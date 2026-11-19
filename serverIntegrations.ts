import { Router, type Request, type Response } from 'express';
import { createAiClient, validateIntegrationUrl, wrapUntrustedContext } from './serverAuth.ts';
import type { AutonomousSchedulerService } from './serverScheduler.ts';
import type {
  HomeAssistantEntity,
  MapsPlaceItem,
  MapsRouteSummary,
  NewsBriefingItem,
  SourceCredibilityTier,
  WeatherBriefing,
} from './src/types/assistant.ts';

function classifySourceCredibility(urlOrTitle: string): SourceCredibilityTier {
  const lower = urlOrTitle.toLowerCase();
  if (
    /\.gov\b|\.gov\.bd\b|who\.int|noaa\.gov|nasa\.gov|metoffice\.gov\.uk|bmd\.gov\.bd|weather\.gov|blog\.google|developers\.google\.com|openai\.com|anthropic\.com|microsoft\.com|apple\.com/.test(
      lower
    )
  ) {
    return 'official';
  }
  if (/\.edu\b|arxiv\.org|nature\.com|science\.org|ieee\.org|acm\.org|scholar\.google/.test(lower)) {
    return 'academic';
  }
  if (
    /reuters\.com|apnews\.com|bbc\.com|bbc\.co\.uk|nytimes\.com|theguardian\.com|bloomberg\.com|wsj\.com|theverge\.com|techcrunch\.com|thedailystar\.net|prothomalo\.com|accuweather\.com|weather\.com/.test(
      lower
    )
  ) {
    return 'reputable';
  }
  return 'secondary';
}

function getMapsApiKey(): string {
  return String(
    process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || ''
  ).trim();
}

function extractFirstJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json\s*|\s*```/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function createIntegrationsRouter(scheduler: AutonomousSchedulerService): Router {
  const router = Router();

  // Exact Server Time & Clock Endpoint (no AI needed)
  router.get('/intelligence/time', (_req: Request, res: Response) => {
    const now = new Date();
    res.json({
      ok: true,
      iso: now.toISOString(),
      formatted: now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      }),
      timeOnly: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      dateOnly: now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    });
  });

  // Live Grounded Weather Briefing
  router.post('/intelligence/weather', async (req: Request, res: Response) => {
    const location = String((req.body as { location?: string })?.location || 'Dhaka, Bangladesh').trim();
    const quota = scheduler.getQuotaStatus();
    if (quota.limited) {
      res.status(429).json({
        error: `Gemini quota cooling down (${quota.retryAfterSeconds}s). Live web weather search will resume shortly.`,
        quotaLimited: true,
        retryAfterSeconds: quota.retryAfterSeconds,
      });
      return;
    }

    try {
      const ai = createAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Look up the current live weather conditions and forecast right now for ${location}. Return ONLY a raw JSON object with fields: "location", "temperatureC", "condition", "humidity", "wind", "summary" (2 crisp sentences max addressing Hasan as Sir if appropriate).`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      scheduler.resetQuotaOnSuccess('gemini-4-hydrogen');

      const parsed = extractFirstJsonObject(response.text || '');
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources: WeatherBriefing['sources'] = [];
      if (Array.isArray(chunks)) {
        for (const ch of chunks.slice(0, 4)) {
          const web = (ch as { web?: { title?: string; uri?: string } }).web;
          if (web?.uri) {
            sources.push({
              title: web.title || web.uri,
              uri: web.uri,
              tier: classifySourceCredibility(`${web.title || ''} ${web.uri}`),
            });
          }
        }
      }

      const briefing: WeatherBriefing = {
        location: String(parsed?.location || location),
        temperatureC: parsed?.temperatureC ? String(parsed.temperatureC) : undefined,
        condition: String(parsed?.condition || 'Live Conditions'),
        humidity: parsed?.humidity ? String(parsed.humidity) : undefined,
        wind: parsed?.wind ? String(parsed.wind) : undefined,
        summary: String(parsed?.summary || response.text?.trim() || `Current weather for ${location}.`),
        sources,
        fetchedAt: new Date().toISOString(),
      };

      res.json({ ok: true, briefing });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
        scheduler.recordGeminiError(err, 'gemini-4-hydrogen');
        res.status(429).json({
          error: 'Gemini quota limit reached for live search.',
          quotaLimited: true,
          retryAfterSeconds: scheduler.getQuotaStatus().retryAfterSeconds,
        });
        return;
      }
      res.status(500).json({ error: msg.slice(0, 240) });
    }
  });

  // Live Grounded News Briefing with Source Credibility Tags
  router.post('/intelligence/news', async (req: Request, res: Response) => {
    const topic = String((req.body as { topic?: string })?.topic || 'world and technology').trim();
    const quota = scheduler.getQuotaStatus();
    if (quota.limited) {
      res.status(429).json({
        error: `Gemini quota cooling down (${quota.retryAfterSeconds}s). News search will resume shortly.`,
        quotaLimited: true,
        retryAfterSeconds: quota.retryAfterSeconds,
      });
      return;
    }

    try {
      const ai = createAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Find the 4 most important current verified news stories right now about: "${topic}". Prefer primary, official, or reputable outlets. Return ONLY a JSON object: {"summary":"...","items":[{"headline":"...","summary":"1-2 sentences","publisher":"...","url":"https://...","publishedAt":"..."}]}.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      scheduler.resetQuotaOnSuccess('gemini-4-hydrogen');

      const parsed = extractFirstJsonObject(response.text || '');
      const rawItems = Array.isArray(parsed?.items) ? parsed!.items : [];
      const items: NewsBriefingItem[] = rawItems
        .map((it) => {
          const rec = it as Record<string, unknown>;
          const url = String(rec.url || '').trim();
          const publisher = String(rec.publisher || 'Verified Source').trim();
          return {
            headline: String(rec.headline || '').trim(),
            summary: String(rec.summary || '').trim(),
            publisher,
            url,
            tier: classifySourceCredibility(`${publisher} ${url}`),
            publishedAt: rec.publishedAt ? String(rec.publishedAt) : new Date().toLocaleDateString(),
          };
        })
        .filter((i) => i.headline.length > 0);

      // Supplement from grounding chunks if JSON parse had no links
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (items.length === 0 && Array.isArray(chunks)) {
        for (const ch of chunks.slice(0, 4)) {
          const web = (ch as { web?: { title?: string; uri?: string } }).web;
          if (web?.uri) {
            items.push({
              headline: web.title || web.uri,
              summary: 'Verified live source returned from search grounding.',
              publisher: web.title || 'Web Source',
              url: web.uri,
              tier: classifySourceCredibility(`${web.title || ''} ${web.uri}`),
              publishedAt: new Date().toLocaleDateString(),
            });
          }
        }
      }

      res.json({
        ok: true,
        topic,
        summary: String(parsed?.summary || response.text?.trim() || `Here are the latest updates on ${topic}.`),
        items,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
        scheduler.recordGeminiError(err, 'gemini-4-hydrogen');
        res.status(429).json({
          error: 'Gemini quota limit reached for live search.',
          quotaLimited: true,
          retryAfterSeconds: scheduler.getQuotaStatus().retryAfterSeconds,
        });
        return;
      }
      res.status(500).json({ error: msg.slice(0, 240) });
    }
  });

  // Google Maps Platform Config + REST Proxies (Places New + Routes API + Geocoding)
  router.get('/maps/config', (_req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    res.json({
      ok: true,
      available: Boolean(apiKey),
      apiKey,
    });
  });

  router.post('/maps/places-search', async (req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(400).json({ error: 'GOOGLE_MAPS_API_KEY is not configured on the server.' });
      return;
    }
    const textQuery = String((req.body as { query?: string })?.query || '').trim();
    if (!textQuery) {
      res.status(400).json({ error: 'Search query is required.' });
      return;
    }

    try {
      const upstream = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryType',
        },
        body: JSON.stringify({
          textQuery,
          maxResultCount: 6,
          languageCode: 'en',
        }),
      });

      const payload = (await upstream.json()) as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
          rating?: number;
          userRatingCount?: number;
          googleMapsUri?: string;
          primaryType?: string;
        }>;
        error?: { message?: string; status?: string; code?: number };
      };

      if (!upstream.ok || payload.error) {
        const isQuota =
          upstream.status === 429 ||
          payload.error?.status === 'RESOURCE_EXHAUSTED';
        res.status(isQuota ? 429 : upstream.status || 502).json({
          error: payload.error?.message || `Places API returned HTTP ${upstream.status}`,
          quotaLimited: isQuota,
          errorCode: payload.error?.status,
        });
        return;
      }

      const places: MapsPlaceItem[] = (payload.places || [])
        .filter((p) => p.location?.latitude !== undefined && p.location?.longitude !== undefined)
        .map((p, idx) => ({
          id: p.id || `place_${idx}`,
          name: p.displayName?.text || 'Place',
          address: p.formattedAddress || '',
          rating: p.rating,
          userRatingCount: p.userRatingCount,
          lat: Number(p.location!.latitude),
          lng: Number(p.location!.longitude),
          googleMapsUri: p.googleMapsUri,
          primaryType: p.primaryType,
        }));

      res.json({ ok: true, places });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to query Google Places API.',
      });
    }
  });

  router.post('/maps/routes', async (req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(400).json({ error: 'GOOGLE_MAPS_API_KEY is not configured on the server.' });
      return;
    }
    const b = (req.body || {}) as {
      origin?: string;
      destination?: string;
      travelMode?: 'DRIVE' | 'WALK' | 'TRANSIT' | 'TWO_WHEELER';
    };
    const origin = String(b.origin || 'Dhaka').trim();
    const destination = String(b.destination || '').trim();
    if (!destination) {
      res.status(400).json({ error: 'Destination is required for route calculation.' });
      return;
    }
    const travelMode = ['DRIVE', 'WALK', 'TRANSIT', 'TWO_WHEELER'].includes(String(b.travelMode))
      ? b.travelMode!
      : 'DRIVE';

    try {
      const requestBody: Record<string, unknown> = {
        origin: { address: origin },
        destination: { address: destination },
        travelMode,
        languageCode: 'en-US',
        units: 'METRIC',
      };
      if (travelMode === 'DRIVE' || travelMode === 'TWO_WHEELER') {
        requestBody.routingPreference = 'TRAFFIC_AWARE';
      }

      const upstream = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration',
        },
        body: JSON.stringify(requestBody),
      });

      const payload = (await upstream.json()) as {
        routes?: Array<{
          duration?: string;
          distanceMeters?: number;
          polyline?: { encodedPolyline?: string };
          legs?: Array<{
            startLocation?: { latLng?: { latitude?: number; longitude?: number } };
            endLocation?: { latLng?: { latitude?: number; longitude?: number } };
            steps?: Array<{
              navigationInstruction?: { instructions?: string };
              distanceMeters?: number;
              staticDuration?: string;
            }>;
          }>;
        }>;
        error?: { message?: string; status?: string };
      };

      if (!upstream.ok || payload.error) {
        const isQuota =
          upstream.status === 429 ||
          payload.error?.status === 'RESOURCE_EXHAUSTED';
        res.status(isQuota ? 429 : upstream.status || 502).json({
          error: payload.error?.message || `Routes API returned HTTP ${upstream.status}`,
          quotaLimited: isQuota,
          errorCode: payload.error?.status,
        });
        return;
      }

      const firstRoute = payload.routes?.[0];
      if (!firstRoute) {
        res.status(404).json({ error: `No route found between "${origin}" and "${destination}".` });
        return;
      }

      const secs = parseInt(String(firstRoute.duration || '0').replace('s', ''), 10) || 0;
      const mins = Math.max(1, Math.round(secs / 60));
      const durationText = mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} min` : `${mins} min`;
      const firstLeg = firstRoute.legs?.[0];

      const routeSummary: MapsRouteSummary = {
        originLabel: origin,
        destinationLabel: destination,
        distanceMeters: Number(firstRoute.distanceMeters || 0),
        durationText,
        encodedPolyline: firstRoute.polyline?.encodedPolyline || '',
        originLatLng:
          firstLeg?.startLocation?.latLng?.latitude !== undefined
            ? {
                lat: Number(firstLeg.startLocation.latLng.latitude),
                lng: Number(firstLeg.startLocation.latLng.longitude),
              }
            : undefined,
        destinationLatLng:
          firstLeg?.endLocation?.latLng?.latitude !== undefined
            ? {
                lat: Number(firstLeg.endLocation.latLng.latitude),
                lng: Number(firstLeg.endLocation.latLng.longitude),
              }
            : undefined,
        steps: (firstLeg?.steps || []).slice(0, 12).map((s) => {
          const stepSec = parseInt(String(s.staticDuration || '0').replace('s', ''), 10) || 0;
          return {
            instruction: s.navigationInstruction?.instructions || 'Continue straight',
            distanceMeters: Number(s.distanceMeters || 0),
            durationText: stepSec >= 60 ? `${Math.round(stepSec / 60)} min` : `${stepSec} sec`,
          };
        }),
      };

      res.json({ ok: true, route: routeSummary });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to compute Google Maps route.',
      });
    }
  });

  router.get('/maps/geocode', async (req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(400).json({ error: 'GOOGLE_MAPS_API_KEY is not configured on the server.' });
      return;
    }
    const address = String(req.query.address || '').trim();
    if (!address) {
      res.status(400).json({ error: 'address query parameter is required.' });
      return;
    }
    try {
      const upstream = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          address
        )}&key=${encodeURIComponent(apiKey)}`
      );
      const payload = (await upstream.json()) as {
        status?: string;
        error_message?: string;
        results?: Array<{
          formatted_address?: string;
          geometry?: { location?: { lat: number; lng: number } };
        }>;
      };
      if (payload.status === 'OVER_QUERY_LIMIT') {
        res.status(429).json({
          error: payload.error_message || 'Geocoding quota exceeded.',
          quotaLimited: true,
          errorCode: 'RESOURCE_EXHAUSTED',
        });
        return;
      }
      const first = payload.results?.[0];
      if (!first?.geometry?.location) {
        res.status(404).json({ error: 'Address could not be geocoded.' });
        return;
      }
      res.json({
        ok: true,
        formattedAddress: first.formatted_address,
        location: first.geometry.location,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Geocoding lookup failed.',
      });
    }
  });

  // Home Assistant Smart Device Connector (stateless pass-through — LLAT never logged or stored)
  router.post('/home-assistant/validate', async (req: Request, res: Response) => {
    const b = (req.body || {}) as { baseUrl?: string; token?: string };
    const urlCheck = validateIntegrationUrl(b.baseUrl || '');
    if (!urlCheck.ok) {
      res.status(400).json({ error: urlCheck.error });
      return;
    }
    const token = String(b.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'Long-Lived Access Token is required.' });
      return;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const ping = await fetch(`${urlCheck.url}/api/`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!ping.ok) {
        res.status(ping.status).json({
          error:
            ping.status === 401
              ? 'Home Assistant rejected the Long-Lived Access Token.'
              : `Home Assistant returned HTTP ${ping.status}.`,
        });
        return;
      }

      const statesResp = await fetch(`${urlCheck.url}/api/states`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const rawStates = (statesResp.ok ? await statesResp.json() : []) as Array<{
        entity_id?: string;
        state?: string;
        attributes?: Record<string, unknown>;
        last_updated?: string;
      }>;

      const ALLOWED_DOMAINS = new Set(['light', 'switch', 'fan', 'climate', 'scene', 'script', 'lock', 'cover', 'media_player']);
      const entities: HomeAssistantEntity[] = rawStates
        .filter((s) => s.entity_id && ALLOWED_DOMAINS.has(s.entity_id.split('.')[0]))
        .slice(0, 80)
        .map((s) => ({
          entityId: s.entity_id!,
          domain: s.entity_id!.split('.')[0],
          friendlyName: String(s.attributes?.friendly_name || s.entity_id!),
          state: String(s.state || 'unknown'),
          attributes: s.attributes || {},
          lastUpdated: s.last_updated,
        }));

      res.json({
        ok: true,
        baseUrl: urlCheck.url,
        entityCount: entities.length,
        entities,
      });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? `Unable to reach Home Assistant at ${urlCheck.url}: ${err.message}`
            : 'Unable to reach Home Assistant.',
      });
    }
  });

  router.post('/home-assistant/states', async (req: Request, res: Response) => {
    const b = (req.body || {}) as { baseUrl?: string; token?: string };
    const urlCheck = validateIntegrationUrl(b.baseUrl || '');
    if (!urlCheck.ok) {
      res.status(400).json({ error: urlCheck.error });
      return;
    }
    const token = String(b.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'Home Assistant token is required.' });
      return;
    }
    try {
      const resp = await fetch(`${urlCheck.url}/api/states`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!resp.ok) {
        res.status(resp.status).json({ error: `Home Assistant returned HTTP ${resp.status}` });
        return;
      }
      const rawStates = (await resp.json()) as Array<{
        entity_id?: string;
        state?: string;
        attributes?: Record<string, unknown>;
        last_updated?: string;
      }>;
      const ALLOWED_DOMAINS = new Set(['light', 'switch', 'fan', 'climate', 'scene', 'script', 'lock', 'cover', 'media_player']);
      const entities: HomeAssistantEntity[] = rawStates
        .filter((s) => s.entity_id && ALLOWED_DOMAINS.has(s.entity_id.split('.')[0]))
        .slice(0, 80)
        .map((s) => ({
          entityId: s.entity_id!,
          domain: s.entity_id!.split('.')[0],
          friendlyName: String(s.attributes?.friendly_name || s.entity_id!),
          state: String(s.state || 'unknown'),
          attributes: s.attributes || {},
          lastUpdated: s.last_updated,
        }));
      res.json({ ok: true, entities });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Home Assistant query failed.' });
    }
  });

  router.post('/home-assistant/service', async (req: Request, res: Response) => {
    const b = (req.body || {}) as {
      baseUrl?: string;
      token?: string;
      domain?: string;
      service?: string;
      entityId?: string;
      data?: Record<string, unknown>;
    };
    const urlCheck = validateIntegrationUrl(b.baseUrl || '');
    if (!urlCheck.ok) {
      res.status(400).json({ error: urlCheck.error });
      return;
    }
    const token = String(b.token || '').trim();
    const domain = String(b.domain || '').replace(/[^a-z_]/g, '');
    const service = String(b.service || '').replace(/[^a-z_]/g, '');
    if (!token || !domain || !service) {
      res.status(400).json({ error: 'Token, domain, and service are required.' });
      return;
    }

    try {
      const serviceBody: Record<string, unknown> = { ...(b.data || {}) };
      if (b.entityId) serviceBody.entity_id = b.entityId;

      const resp = await fetch(`${urlCheck.url}/api/services/${domain}/${service}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceBody),
      });
      if (!resp.ok) {
        res.status(resp.status).json({ error: `Home Assistant service call failed (HTTP ${resp.status})` });
        return;
      }
      const result = await resp.json().catch(() => []);
      res.json({ ok: true, result });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Service call failed.' });
    }
  });

  // Multimodal Screen Vision Verification (screenshot + OCR context -> target or verification)
  router.post('/pc/verify-screen', async (req: Request, res: Response) => {
    const b = (req.body || {}) as {
      imageBase64?: string;
      ocrText?: string;
      goal?: string;
      detectedElements?: Array<{ text: string; x: number; y: number }>;
    };
    const ocrText = String(b.ocrText || '').trim();
    const goal = String(b.goal || 'Inspect visible screen and verify status').trim();
    const quota = scheduler.getQuotaStatus();

    // Quota-independent OCR fallback verification
    if (quota.limited || !b.imageBase64) {
      const lowerOcr = ocrText.toLowerCase();
      const hasError = /\b(error|failed|exception|not responding|unable to)\b/i.test(lowerOcr);
      const matched = (b.detectedElements || []).find((el) =>
        goal.toLowerCase().split(/\s+/).some((w) => w.length > 2 && el.text.toLowerCase().includes(w))
      );
      res.json({
        ok: true,
        verified: !hasError && (Boolean(matched) || ocrText.length > 0),
        summary: ocrText
          ? `OCR scanned ${ocrText.split(/\n/).length} line(s) on screen.${hasError ? ' Warning: an error phrase appeared on screen.' : ''}`
          : 'Screen captured.',
        detectedError: hasError ? 'Potential error dialog detected in OCR text.' : undefined,
        clickTarget: matched ? { x: matched.x, y: matched.y, label: matched.text } : undefined,
      });
      return;
    }

    try {
      const ai = createAiClient();
      const cleanImg = b.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const prompt = `Inspect this desktop screenshot alongside extracted OCR elements.\nGoal: ${goal}\n${wrapUntrustedContext('SCREEN_OCR', ocrText, 2500)}\nReturn ONLY raw JSON: {"verified":true,"summary":"2 concise sentences describing what is open and whether goal succeeded","detectedError":null,"clickTarget":null}. Never bypass logins or CAPTCHAs.`;

      const resp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/png', data: cleanImg } },
            { text: prompt },
          ],
        },
      });
      scheduler.resetQuotaOnSuccess('gemini-4-hydrogen');
      const parsed = extractFirstJsonObject(resp.text || '');
      res.json({
        ok: true,
        verified: parsed?.verified !== false,
        summary: String(parsed?.summary || resp.text?.trim() || 'Screen analyzed.'),
        detectedError: parsed?.detectedError ? String(parsed.detectedError) : undefined,
        clickTarget: parsed?.clickTarget || undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
        scheduler.recordGeminiError(err, 'gemini-4-hydrogen');
      }
      res.json({
        ok: true,
        verified: ocrText.length > 0,
        summary: ocrText ? `OCR fallback analyzed screen (${ocrText.slice(0, 140)}...)` : 'Screen captured.',
      });
    }
  });

  return router;
}

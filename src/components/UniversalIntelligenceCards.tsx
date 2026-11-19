import React, { useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  Activity,
  CloudSun,
  Compass,
  Cpu,
  ExternalLink,
  Eye,
  Home,
  Loader2,
  MapPin,
  Monitor,
  Navigation,
  Newspaper,
  PlugZap,
  Power,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Unplug,
} from 'lucide-react';
import type {
  AgenticStepItem,
  ConnectedIntegrationItem,
  HardwareTelemetry,
  HomeAssistantEntity,
  MapsPlaceItem,
  MapsRouteSummary,
  NewsBriefingItem,
  ScreenOcrSnapshot,
  SourceCredibilityTier,
  WeatherBriefing,
} from '../types/assistant';

function decodeGooglePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const path: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    path.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return path;
}

const MapViewportAndRouteOverlay: React.FC<{
  places: MapsPlaceItem[];
  route: MapsRouteSummary | null;
}> = ({ places, route }) => {
  const map = useMap();
  const decodedPath = useMemo(
    () => (route?.encodedPolyline ? decodeGooglePolyline(route.encodedPolyline) : []),
    [route?.encodedPolyline]
  );

  useEffect(() => {
    const gMaps = (window as unknown as { google?: { maps?: any } }).google?.maps;
    if (!map || !gMaps) return;

    let poly: { setMap: (m: unknown) => void } | null = null;
    if (decodedPath.length > 1) {
      poly = new gMaps.Polyline({
        path: decodedPath,
        geodesic: true,
        strokeColor: '#38bdf8',
        strokeOpacity: 0.9,
        strokeWeight: 4,
      });
      poly?.setMap(map);
    }

    const bounds = new gMaps.LatLngBounds();
    let hasPoint = false;
    decodedPath.forEach((pt) => {
      bounds.extend(pt);
      hasPoint = true;
    });
    places.forEach((p) => {
      bounds.extend({ lat: p.lat, lng: p.lng });
      hasPoint = true;
    });
    if (route?.originLatLng) {
      bounds.extend(route.originLatLng);
      hasPoint = true;
    }
    if (route?.destinationLatLng) {
      bounds.extend(route.destinationLatLng);
      hasPoint = true;
    }

    if (hasPoint) {
      if (places.length === 1 && decodedPath.length === 0) {
        map.setCenter({ lat: places[0].lat, lng: places[0].lng });
        map.setZoom(14);
      } else {
        map.fitBounds(bounds, 48);
      }
    }

    return () => {
      if (poly) {
        poly.setMap(null);
      }
    };
  }, [map, decodedPath, places, route]);

  return null;
};

export const MapsIntelligenceCard: React.FC<{
  apiKey: string;
  places: MapsPlaceItem[];
  route: MapsRouteSummary | null;
  quotaExceeded: boolean;
  onQuickSearch?: (query: string) => void;
}> = ({ apiKey, places, route, quotaExceeded, onQuickSearch }) => {
  const [quickQuery, setQuickQuery] = useState('');

  const defaultCenter = useMemo(() => {
    if (places.length > 0) return { lat: places[0].lat, lng: places[0].lng };
    if (route?.originLatLng) return route.originLatLng;
    return { lat: 23.8103, lng: 90.4125 }; // Dhaka default
  }, [places, route]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 text-slate-200 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Google Maps Intelligence
          </span>
        </div>
        {onQuickSearch && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (quickQuery.trim()) {
                onQuickSearch(quickQuery.trim());
              }
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
              placeholder="Find place or route..."
              className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 w-44"
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-xs font-medium text-sky-200 whitespace-nowrap"
            >
              Search
            </button>
          </form>
        )}
      </div>

      {quotaExceeded ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-200">
          Google Maps Platform preview quota reached. Interactive map tiles are paused until quota resets or a billing-enabled project key is attached.
        </div>
      ) : apiKey ? (
        <div className="w-full h-[340px] rounded-lg overflow-hidden border border-slate-800">
          <APIProvider apiKey={apiKey} language="en" region="BD">
            <GoogleMap
              mapId="DEMO_MAP_ID"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              defaultCenter={defaultCenter}
              defaultZoom={12}
              colorScheme="DARK"
              gestureHandling="greedy"
              disableDefaultUI={false}
              className="w-full h-full"
            >
              <MapViewportAndRouteOverlay places={places} route={route} />
              {places.map((place, idx) => (
                <AdvancedMarker
                  key={place.id || idx}
                  position={{ lat: place.lat, lng: place.lng }}
                  title={place.name}
                >
                  <Pin background="#0284c7" glyphColor="#e0f2fe" borderColor="#38bdf8" />
                </AdvancedMarker>
              ))}
              {route?.originLatLng && (
                <AdvancedMarker position={route.originLatLng} title={route.originLabel}>
                  <Pin background="#10b981" glyphColor="#ecfdf5" borderColor="#34d399" />
                </AdvancedMarker>
              )}
              {route?.destinationLatLng && (
                <AdvancedMarker position={route.destinationLatLng} title={route.destinationLabel}>
                  <Pin background="#f59e0b" glyphColor="#fffbeb" borderColor="#fbbf24" />
                </AdvancedMarker>
              )}
            </GoogleMap>
          </APIProvider>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-xs text-slate-400">
          Google Maps API key is initializing from server configuration. Try asking August for directions or nearby places once ready.
        </div>
      )}

      {route && (
        <div className="rounded-lg border border-sky-500/25 bg-slate-900/80 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-sky-200">
              <Navigation className="w-3.5 h-3.5 text-sky-400" />
              <span>
                {route.originLabel} → {route.destinationLabel}
              </span>
            </div>
            <div className="font-mono tabular-nums text-emerald-300">
              {route.durationText} · {(route.distanceMeters / 1000).toFixed(1)} km
            </div>
          </div>
          {route.steps.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-slate-300 pr-1">
              {route.steps.map((s, idx) => (
                <div key={idx} className="flex items-start justify-between gap-2 border-t border-slate-800/80 pt-1">
                  <span>
                    {idx + 1}. {s.instruction}
                  </span>
                  <span className="font-mono tabular-nums text-slate-500 shrink-0">
                    {s.distanceMeters}m
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {places.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {places.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-xs flex flex-col justify-between gap-1.5"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-100 truncate">{p.name}</span>
                  {p.rating !== undefined && (
                    <span className="font-mono tabular-nums text-[11px] text-amber-300 shrink-0">
                      {p.rating.toFixed(1)}★
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{p.address}</p>
              </div>
              {p.googleMapsUri && (
                <a
                  href={p.googleMapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 w-fit"
                >
                  <MapPin className="w-3 h-3" />
                  <span>Open in Google Maps</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function tierBadgeClass(tier: SourceCredibilityTier): string {
  if (tier === 'official') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
  if (tier === 'academic') return 'bg-sky-500/15 text-sky-300 border-sky-500/35';
  if (tier === 'reputable') return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35';
  return 'bg-slate-800 text-slate-300 border-slate-700';
}

export const WeatherNewsBriefingCard: React.FC<{
  weather: WeatherBriefing | null;
  news: { topic: string; summary: string; items: NewsBriefingItem[]; fetchedAt: string } | null;
}> = ({ weather, news }) => {
  if (!weather && !news) return null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 text-slate-200 space-y-3">
      {weather && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CloudSun className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Weather · {weather.location}
              </span>
            </div>
            <span className="font-mono tabular-nums text-[11px] text-slate-400">
              {new Date(weather.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
              <div className="text-[10px] uppercase text-slate-400">Temp</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-sky-200">
                {weather.temperatureC || '—'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
              <div className="text-[10px] uppercase text-slate-400">Condition</div>
              <div className="text-xs font-medium text-slate-100 truncate">{weather.condition}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
              <div className="text-[10px] uppercase text-slate-400">Humidity / Wind</div>
              <div className="font-mono tabular-nums text-xs text-slate-200 truncate">
                {weather.humidity || weather.wind || 'Live'}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{weather.summary}</p>
          {weather.sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {weather.sources.map((s, idx) => (
                <a
                  key={idx}
                  href={s.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] border ${tierBadgeClass(
                    s.tier
                  )}`}
                >
                  <span className="uppercase font-semibold">{s.tier}</span>
                  <span className="truncate max-w-[140px]">{s.title}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {news && (
        <div className="space-y-2 border-t border-slate-800/80 pt-2.5 first:border-t-0 first:pt-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Briefing · {news.topic}
              </span>
            </div>
            <span className="font-mono tabular-nums text-[11px] text-slate-400">
              {new Date(news.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs text-slate-300">{news.summary}</p>
          <div className="space-y-1.5">
            {news.items.map((item, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-xs space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-100">{item.headline}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase border shrink-0 ${tierBadgeClass(item.tier)}`}>
                    {item.tier}
                  </span>
                </div>
                {item.summary && <p className="text-[11px] text-slate-400">{item.summary}</p>}
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    {item.publisher} {item.publishedAt ? `· ${item.publishedAt}` : ''}
                  </span>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300"
                    >
                      <span>Source</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const HomeAssistantControlCard: React.FC<{
  connected: boolean;
  baseUrl: string;
  entities: HomeAssistantEntity[];
  integrationMeta?: ConnectedIntegrationItem | null;
  busy?: boolean;
  error?: string | null;
  onConnect: (baseUrl: string, token: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onToggleEntity: (entity: HomeAssistantEntity) => Promise<void>;
}> = ({
  connected,
  baseUrl,
  entities,
  busy,
  error,
  onConnect,
  onRefresh,
  onDisconnect,
  onToggleEntity,
}) => {
  const [urlInput, setUrlInput] = useState(baseUrl || 'http://homeassistant.local:8123');
  const [tokenInput, setTokenInput] = useState('');

  useEffect(() => {
    if (baseUrl) setUrlInput(baseUrl);
  }, [baseUrl]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 text-slate-200 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Home className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Smart Home · Home Assistant
          </span>
        </div>
        <span
          className={`text-[11px] px-2 py-0.5 rounded border ${
            connected
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              : 'border-slate-700 bg-slate-900 text-slate-400'
          }`}
        >
          {connected ? `${entities.length} Entities` : 'Disconnected'}
        </span>
      </div>

      {!connected ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (urlInput.trim() && tokenInput.trim()) {
              void onConnect(urlInput.trim(), tokenInput.trim());
            }
          }}
          className="space-y-2"
        >
          <p className="text-[11px] text-slate-400">
            Pair your Home Assistant instance using its URL and a Long-Lived Access Token. Your token stays in browser memory for this session only and is never stored in Firestore.
          </p>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="http://homeassistant.local:8123"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Long-Lived Access Token (LLAT)"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
          {error && <p className="text-[11px] text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || !urlInput.trim() || !tokenInput.trim()}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 px-3 py-1.5 text-xs font-medium text-sky-200 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlugZap className="w-3.5 h-3.5" />}
            <span>Pair & Verify Home Assistant</span>
          </button>
        </form>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="truncate">{baseUrl}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => void onRefresh()}
                className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2 py-1 text-slate-200"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sync</span>
              </button>
              <button
                type="button"
                onClick={() => void onDisconnect()}
                className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 px-2 py-1 text-rose-200"
              >
                <Unplug className="w-3 h-3" />
                <span>Disconnect & Revoke</span>
              </button>
            </div>
          </div>
          {error && <p className="text-[11px] text-rose-400">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
            {entities.map((ent) => {
              const isOn = ent.state === 'on' || ent.state === 'heat' || ent.state === 'cool' || ent.state === 'open';
              return (
                <button
                  key={ent.entityId}
                  type="button"
                  onClick={() => void onToggleEntity(ent)}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                    isOn
                      ? 'border-sky-500/45 bg-sky-500/15 text-sky-100'
                      : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{ent.friendlyName}</div>
                    <div className="text-[10px] uppercase text-slate-400 truncate">
                      {ent.domain} · {ent.state}
                    </div>
                  </div>
                  <Power className={`w-3.5 h-3.5 shrink-0 ${isOn ? 'text-sky-400' : 'text-slate-500'}`} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const PcVisionAuditCard: React.FC<{
  hardware: HardwareTelemetry | null;
  screenSnapshot: ScreenOcrSnapshot | null;
  steps: AgenticStepItem[];
  onCaptureAndInspect?: () => void;
}> = ({ hardware, screenSnapshot, steps, onCaptureAndInspect }) => {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 text-slate-200 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Windows Agent & Screen Vision
          </span>
        </div>
        {onCaptureAndInspect && (
          <button
            type="button"
            onClick={onCaptureAndInspect}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 px-2.5 py-1 text-[11px] font-medium text-sky-200 whitespace-nowrap"
          >
            <Eye className="w-3 h-3" />
            <span>Capture Screen OCR</span>
          </button>
        )}
      </div>

      {hardware && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
            <div className="flex items-center gap-1 text-[10px] uppercase text-slate-400">
              <Cpu className="w-3 h-3" />
              <span>CPU</span>
            </div>
            <div className="font-mono tabular-nums text-sm font-semibold text-sky-200">
              {hardware.cpuPercent !== undefined ? `${hardware.cpuPercent}%` : '—'}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
            <div className="flex items-center gap-1 text-[10px] uppercase text-slate-400">
              <Activity className="w-3 h-3" />
              <span>RAM</span>
            </div>
            <div className="font-mono tabular-nums text-sm font-semibold text-slate-100">
              {hardware.ramPercent !== undefined ? `${hardware.ramPercent}%` : '—'}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
            <div className="flex items-center gap-1 text-[10px] uppercase text-slate-400">
              <ShieldCheck className="w-3 h-3" />
              <span>Agent</span>
            </div>
            <div className="text-xs font-medium text-emerald-300 truncate">
              {hardware.pythonAgentReady ? 'Node + Python' : 'Node Bridge'}
            </div>
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
            <Sparkles className="w-3 h-3 text-sky-400" />
            <span>Agentic Step Verification</span>
          </div>
          {steps.map((st) => (
            <div key={st.index} className="flex items-start justify-between gap-2 text-xs">
              <span className="text-slate-200">
                {st.index}. {st.label}
              </span>
              <span
                className={`text-[10px] uppercase font-mono shrink-0 ${
                  st.status === 'completed'
                    ? 'text-emerald-300'
                    : st.status === 'failed'
                    ? 'text-rose-400'
                    : st.status === 'running'
                    ? 'text-sky-300'
                    : 'text-slate-500'
                }`}
              >
                {st.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {screenSnapshot && (
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="truncate">{screenSnapshot.windowTitle || screenSnapshot.activeApp || 'Captured Frame'}</span>
            <span className="font-mono tabular-nums shrink-0">
              {new Date(screenSnapshot.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {screenSnapshot.imageBase64 && (
            <img
              src={
                screenSnapshot.imageBase64.startsWith('data:')
                  ? screenSnapshot.imageBase64
                  : `data:image/png;base64,${screenSnapshot.imageBase64}`
              }
              alt="Captured screen preview"
              className="w-full max-h-40 object-cover rounded border border-slate-800"
            />
          )}
          {screenSnapshot.verificationSummary && (
            <p className="text-xs text-sky-200">{screenSnapshot.verificationSummary}</p>
          )}
          {screenSnapshot.ocrText && (
            <pre className="text-[10px] font-mono text-slate-400 bg-slate-950/90 rounded p-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
              {screenSnapshot.ocrText.slice(0, 600)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  MonitorTopic,
  MonitorUpdateItem,
  MonitorVerificationStatus,
} from './src/types/assistant.ts';

interface InternalTopicRecord extends MonitorTopic {
  seenHashes: string[];
}

interface PersistedMonitorStore {
  topics: InternalTopicRecord[];
  updates: MonitorUpdateItem[];
}

const TRUSTED_OFFICIAL_DOMAINS = [
  'rockstargames.com',
  'marvel.com',
  'minecraft.net',
  'mojang.com',
  'openai.com',
  'blog.google',
  'deepmind.google',
  'anthropic.com',
  'store.steampowered.com',
  'playstation.com',
  'xbox.com',
  'nintendo.com',
  'github.com',
  'variety.com',
  'hollywoodreporter.com',
  'ign.com',
  'pcgamer.com',
  'reuters.com',
  'apnews.com',
  'theverge.com',
  'techcrunch.com',
];

function classifyTopicCategory(q: string): MonitorTopic['category'] {
  const l = q.toLowerCase();
  if (/\b(?:gta|minecraft|mlbb|free\s*fire|game|gaming|steam|playstation|xbox|valorant)\b/.test(l)) {
    return 'gaming';
  }
  if (/\b(?:marvel|movie|trailer|anime|solo\s+leveling|conan|netflix|film|series)\b/.test(l)) {
    return 'movies';
  }
  if (/\b(?:ai|gemini|openai|tech|model|llm|cybersecurity|software|gpu|nvidia)\b/.test(l)) {
    return 'tech';
  }
  return 'general';
}

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyVerification(
  title: string,
  link: string,
  sourceName: string
): MonitorVerificationStatus {
  const combined = `${title} ${link} ${sourceName}`.toLowerCase();
  if (
    /\b(?:rumor|rumour|leak|leaked|unconfirmed|speculation|reportedly|might\s+be)\b/i.test(
      combined
    )
  ) {
    return 'rumor';
  }
  if (TRUSTED_OFFICIAL_DOMAINS.some((d) => combined.includes(d))) {
    return 'confirmed';
  }
  if (/\b(?:official|announced|announces|releases|trailer|patch\s+notes|update\s+log)\b/i.test(combined)) {
    return 'confirmed';
  }
  return 'rumor';
}

function resolveFeedUrlsForTopic(topic: MonitorTopic): string[] {
  const l = topic.query.toLowerCase();
  const urls: string[] = [];

  if (l.includes('minecraft')) {
    urls.push('https://feedback.minecraft.net/hc/en-us/sections/360001186971-Release-Changelogs.rss');
  }
  if (l.includes('openai')) {
    urls.push('https://openai.com/news/rss.xml');
  }
  if (/\b(?:ai|google\s+ai|gemini|deepmind)\b/i.test(l)) {
    urls.push('https://blog.google/technology/ai/rss/');
  }

  // Always include verified Google News RSS query scoped to official / publisher sources when officialOnly is true
  const qExpr = topic.officialOnly
    ? `${topic.query} (official OR announcement OR trailer OR release)`
    : topic.query;
  urls.push(
    `https://news.google.com/rss/search?q=${encodeURIComponent(qExpr)}&hl=en-US&gl=US&ceid=US:en`
  );
  return urls;
}

interface ParsedFeedEntry {
  title: string;
  link: string;
  pubDate: string;
  sourceName: string;
  snippet: string;
}

function parseRssXml(xml: string): ParsedFeedEntry[] {
  const entries: ParsedFeedEntry[] = [];
  const itemMatches = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
  for (const block of itemMatches.slice(0, 8)) {
    const titleRaw = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
    const linkHref =
      block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ||
      block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1] ||
      '';
    const dateRaw =
      block.match(/<(?:pubDate|published|updated)\b[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/i)?.[1] ||
      '';
    const sourceRaw = block.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i)?.[1] || '';
    const descRaw =
      block.match(/<(?:description|summary)\b[^>]*>([\s\S]*?)<\/(?:description|summary)>/i)?.[1] ||
      '';

    const title = decodeXmlEntities(titleRaw);
    const link = decodeXmlEntities(linkHref);
    if (!title || !link || !link.startsWith('http')) continue;

    let host = 'Verified Feed';
    try {
      host = decodeXmlEntities(sourceRaw) || new URL(link).hostname.replace(/^www\./, '');
    } catch {
      host = decodeXmlEntities(sourceRaw) || 'Web Source';
    }

    entries.push({
      title: title.slice(0, 200),
      link,
      pubDate: decodeXmlEntities(dateRaw) || new Date().toUTCString(),
      sourceName: host.slice(0, 80),
      snippet: decodeXmlEntities(descRaw).slice(0, 240),
    });
  }
  return entries;
}

export class InternetMonitorService {
  private storePath: string;
  private store: PersistedMonitorStore = { topics: [], updates: [] };
  private timer: ReturnType<typeof setInterval> | null = null;
  private checkInFlight = new Set<string>();
  private onUpdateCallback?: (update: MonitorUpdateItem, topic: MonitorTopic) => void;
  private onSyncCallback?: (topics: MonitorTopic[], updates: MonitorUpdateItem[]) => void;

  constructor(
    baseDir: string,
    callbacks?: {
      onUpdate?: (update: MonitorUpdateItem, topic: MonitorTopic) => void;
      onSync?: (topics: MonitorTopic[], updates: MonitorUpdateItem[]) => void;
    }
  ) {
    const dataDir = path.join(baseDir, '.jarvis-data');
    fs.mkdirSync(dataDir, { recursive: true });
    this.storePath = path.join(dataDir, 'monitor-state.json');
    this.onUpdateCallback = callbacks?.onUpdate;
    this.onSyncCallback = callbacks?.onSync;
  }

  public init(): void {
    this.loadFromDisk();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.tickDueTopics();
    }, 15_000);
    // Run one initial non-blocking check 6s after startup
    setTimeout(() => {
      void this.tickDueTopics();
    }, 6_000);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.storePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.storePath, 'utf8')) as Partial<PersistedMonitorStore>;
      this.store = {
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        updates: Array.isArray(parsed.updates) ? parsed.updates : [],
      };
    } catch {
      this.store = { topics: [], updates: [] };
    }
  }

  private saveToDisk(): void {
    try {
      const tmp = `${this.storePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.store, null, 2), 'utf8');
      fs.renameSync(tmp, this.storePath);
    } catch {
      // ignore disk errors
    }
  }

  private sanitizeTopic(t: InternalTopicRecord): MonitorTopic {
    const { seenHashes: _seen, ...publicTopic } = t;
    return publicTopic;
  }

  public getTopics(): MonitorTopic[] {
    return this.store.topics.map((t) => this.sanitizeTopic(t));
  }

  public getUpdates(limit = 30): MonitorUpdateItem[] {
    return this.store.updates.slice(0, limit);
  }

  public getUpdatesToday(): MonitorUpdateItem[] {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const cutoff = startOfDay.getTime();
    return this.store.updates.filter((u) => new Date(u.discoveredAt).getTime() >= cutoff);
  }

  public async addTopic(input: {
    query: string;
    officialOnly?: boolean;
    intervalMinutes?: number;
  }): Promise<{ duplicate: boolean; topic: MonitorTopic; initialUpdate?: MonitorUpdateItem }> {
    const cleanQuery = input.query.trim().slice(0, 140);
    const existing = this.store.topics.find(
      (t) => t.query.toLowerCase() === cleanQuery.toLowerCase()
    );
    if (existing) {
      if (existing.status === 'paused') {
        existing.status = 'active';
        existing.updatedAt = new Date().toISOString();
        this.saveToDisk();
        this.emitSync();
      }
      return { duplicate: true, topic: this.sanitizeTopic(existing) };
    }

    const nowIso = new Date().toISOString();
    const record: InternalTopicRecord = {
      id: `mon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      query: cleanQuery,
      label: cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1),
      category: classifyTopicCategory(cleanQuery),
      officialOnly: input.officialOnly ?? false,
      intervalMinutes: Math.max(2, Math.min(1440, Number(input.intervalMinutes || 30))),
      status: 'active',
      lastStatus: 'pending',
      seenHashes: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.store.topics.unshift(record);
    this.saveToDisk();
    this.emitSync();

    // Perform an immediate baseline verification check
    const initial = await this.checkTopic(record.id, true);
    return {
      duplicate: false,
      topic: this.sanitizeTopic(record),
      initialUpdate: initial.newUpdate,
    };
  }

  public updateTopic(
    id: string,
    patch: { status?: 'active' | 'paused'; officialOnly?: boolean; intervalMinutes?: number }
  ): MonitorTopic | null {
    const t = this.store.topics.find((item) => item.id === id);
    if (!t) return null;
    if (patch.status) t.status = patch.status;
    if (typeof patch.officialOnly === 'boolean') t.officialOnly = patch.officialOnly;
    if (typeof patch.intervalMinutes === 'number') {
      t.intervalMinutes = Math.max(2, Math.min(1440, patch.intervalMinutes));
    }
    t.updatedAt = new Date().toISOString();
    this.saveToDisk();
    this.emitSync();
    return this.sanitizeTopic(t);
  }

  public deleteTopic(id: string): boolean {
    const before = this.store.topics.length;
    this.store.topics = this.store.topics.filter((t) => t.id !== id);
    if (this.store.topics.length !== before) {
      this.saveToDisk();
      this.emitSync();
      return true;
    }
    return false;
  }

  public stopByQuery(query: string): MonitorTopic[] {
    const q = query.trim().toLowerCase();
    const matches = this.store.topics.filter(
      (t) => t.query.toLowerCase().includes(q) || t.label.toLowerCase().includes(q)
    );
    if (matches.length === 0) return [];
    const matchIds = new Set(matches.map((m) => m.id));
    this.store.topics = this.store.topics.filter((t) => !matchIds.has(t.id));
    this.saveToDisk();
    this.emitSync();
    return matches.map((m) => this.sanitizeTopic(m));
  }

  public pauseAll(): number {
    let count = 0;
    const nowIso = new Date().toISOString();
    for (const t of this.store.topics) {
      if (t.status === 'active') {
        t.status = 'paused';
        t.updatedAt = nowIso;
        count += 1;
      }
    }
    if (count > 0) {
      this.saveToDisk();
      this.emitSync();
    }
    return count;
  }

  public resumeAll(): number {
    let count = 0;
    const nowIso = new Date().toISOString();
    for (const t of this.store.topics) {
      if (t.status === 'paused') {
        t.status = 'active';
        t.updatedAt = nowIso;
        count += 1;
      }
    }
    if (count > 0) {
      this.saveToDisk();
      this.emitSync();
    }
    return count;
  }

  public setAllOfficialOnly(officialOnly: boolean): void {
    const nowIso = new Date().toISOString();
    for (const t of this.store.topics) {
      t.officialOnly = officialOnly;
      t.updatedAt = nowIso;
    }
    this.saveToDisk();
    this.emitSync();
  }

  private emitSync(): void {
    this.onSyncCallback?.(this.getTopics(), this.getUpdates());
  }

  private async tickDueTopics(): Promise<void> {
    const now = Date.now();
    for (const topic of this.store.topics) {
      if (topic.status !== 'active') continue;
      const lastMs = topic.lastCheckedAt ? new Date(topic.lastCheckedAt).getTime() : 0;
      const intervalMs = Math.max(2, topic.intervalMinutes) * 60_000;
      if (!lastMs || now - lastMs >= intervalMs) {
        await this.checkTopic(topic.id, false);
      }
    }
  }

  public async checkTopic(
    id: string,
    isBaseline = false
  ): Promise<{ ok: boolean; newUpdate?: MonitorUpdateItem; error?: string }> {
    const topic = this.store.topics.find((t) => t.id === id);
    if (!topic) return { ok: false, error: 'Topic not found.' };
    if (this.checkInFlight.has(id)) return { ok: false, error: 'Check already running.' };

    this.checkInFlight.add(id);
    const nowIso = new Date().toISOString();

    try {
      const feedUrls = resolveFeedUrlsForTopic(topic);
      const discovered: ParsedFeedEntry[] = [];
      let anySuccess = false;
      let lastFetchError = '';

      for (const feedUrl of feedUrls) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 9000);
          const resp = await fetch(feedUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'AugustPersonalMonitor/1.0 (+https://localhost)',
              Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
            },
          });
          clearTimeout(timer);
          if (!resp.ok) {
            lastFetchError = `HTTP ${resp.status}`;
            continue;
          }
          const xml = await resp.text();
          const parsed = parseRssXml(xml);
          discovered.push(...parsed);
          anySuccess = true;
          if (discovered.length >= 6) break;
        } catch (err) {
          lastFetchError = err instanceof Error ? err.message : String(err);
        }
      }

      topic.lastCheckedAt = nowIso;
      topic.updatedAt = nowIso;

      if (!anySuccess) {
        topic.lastStatus = 'error';
        topic.lastError = lastFetchError || 'Unable to reach monitoring feeds.';
        this.saveToDisk();
        this.emitSync();
        return { ok: false, error: topic.lastError };
      }

      topic.lastStatus = 'ok';
      topic.lastError = undefined;

      // Filter officialOnly and detect unseen fingerprints
      let newestCandidate: MonitorUpdateItem | undefined;
      for (const entry of discovered) {
        const verification = classifyVerification(entry.title, entry.link, entry.sourceName);
        if (topic.officialOnly && verification !== 'confirmed') {
          continue;
        }
        const normalizedKey = `${entry.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${entry.link}`;
        const hash = crypto.createHash('sha256').update(normalizedKey).digest('hex').slice(0, 20);

        if (topic.seenHashes.includes(hash)) {
          continue;
        }

        topic.seenHashes.unshift(hash);
        topic.seenHashes = topic.seenHashes.slice(0, 60);

        const updateItem: MonitorUpdateItem = {
          id: `upd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          topicId: topic.id,
          topicTitle: topic.label,
          headline: entry.title,
          summary: entry.snippet || entry.title,
          sourceName: entry.sourceName,
          sourceUrl: entry.link,
          publishedAt: entry.pubDate,
          discoveredAt: nowIso,
          verification,
          hash,
        };

        if (!newestCandidate) {
          newestCandidate = updateItem;
        }
      }

      if (newestCandidate) {
        topic.latestUpdate = newestCandidate;
        if (!isBaseline) {
          this.store.updates.unshift(newestCandidate);
          this.store.updates = this.store.updates.slice(0, 100);
          this.saveToDisk();
          this.emitSync();
          this.onUpdateCallback?.(newestCandidate, this.sanitizeTopic(topic));
          return { ok: true, newUpdate: newestCandidate };
        }
      }

      this.saveToDisk();
      this.emitSync();
      return { ok: true };
    } finally {
      this.checkInFlight.delete(id);
    }
  }
}

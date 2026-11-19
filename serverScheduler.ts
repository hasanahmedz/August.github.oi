import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import {
  formatScheduledTimeLabel,
} from './src/utils/commandParsers.ts';

export type ScheduleKind = 'alarm' | 'reminder' | 'timer';
export type ScheduleStatus =
  | 'scheduled'
  | 'triggered'
  | 'snoozed'
  | 'cancelled'
  | 'completed';

export interface ServerScheduledItem {
  id: string;
  kind: ScheduleKind;
  title: string;
  triggerAt: string;
  durationSeconds?: number;
  remainingSecondsWhenPaused?: number;
  paused?: boolean;
  recurrence: 'once' | 'daily';
  status: ScheduleStatus;
  snoozedUntil?: string;
  spokenMessage?: string;
  createdAt: string;
  updatedAt: string;
  triggeredAt?: string;
}

export interface ServerExecutionLog {
  id: string;
  command: string;
  intent: string;
  source: 'local' | 'companion' | 'live' | 'brain' | 'scheduler';
  status: 'EXECUTING' | 'SCHEDULED' | 'COMPLETED' | 'FAILED';
  detail: string;
  verified: boolean;
  durationMs?: number;
  createdAt: string;
}

export interface ServerProactiveAlert {
  id: string;
  title: string;
  spokenText: string;
  kind: 'timer' | 'alarm' | 'reminder' | 'task' | 'agent' | 'monitor' | 'call';
  scheduleId?: string;
  sourceUrl?: string;
  verification?: 'confirmed' | 'rumor';
  createdAt: string;
}

export interface ServerQuotaStatus {
  limited: boolean;
  cooldownUntil?: string;
  retryAfterSeconds: number;
  lastStatusCode?: number;
  lastError?: string;
  lastModel?: string;
}

interface PersistedSchedulerData {
  schedules: ServerScheduledItem[];
  pendingAlerts: ServerProactiveAlert[];
  executionLogs: ServerExecutionLog[];
}

export class AutonomousSchedulerService {
  private dataDir: string;
  private storePath: string;
  private data: PersistedSchedulerData = {
    schedules: [],
    pendingAlerts: [],
    executionLogs: [],
  };
  private sseClients = new Set<Response>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  // Gemini Quota Circuit Breaker & Deduplication
  private cooldownUntilMs = 0;
  private consecutive429s = 0;
  private lastStatusCode?: number;
  private lastError?: string;
  private lastModel?: string;
  private recentRequests = new Map<string, number>();

  constructor(baseDir: string) {
    this.dataDir = path.join(baseDir, '.jarvis-data');
    this.storePath = path.join(this.dataDir, 'scheduler-state.json');
  }

  public init(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.loadFromDisk();
    this.processDueSchedules(true);

    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => {
      this.processDueSchedules(false);
    }, 1000);
  }

  public stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.storePath)) return;
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedSchedulerData>;
      this.data = {
        schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [],
        pendingAlerts: Array.isArray(parsed.pendingAlerts) ? parsed.pendingAlerts : [],
        executionLogs: Array.isArray(parsed.executionLogs) ? parsed.executionLogs : [],
      };
    } catch {
      this.data = { schedules: [], pendingAlerts: [], executionLogs: [] };
    }
  }

  private saveToDisk(): void {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const tmp = `${this.storePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.storePath);
    } catch {
      // ignore non-fatal persistence errors
    }
  }

  public addSseClient(res: Response): void {
    this.sseClients.add(res);
    res.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  private broadcast(event: string, payload: unknown): void {
    const serialized = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(serialized);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  public broadcastEvent(event: string, payload: unknown): void {
    this.broadcast(event, payload);
  }

  public pushExternalAlert(alertInput: Omit<ServerProactiveAlert, 'id' | 'createdAt'>): ServerProactiveAlert {
    const alert: ServerProactiveAlert = {
      ...alertInput,
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.data.pendingAlerts.unshift(alert);
    this.data.pendingAlerts = this.data.pendingAlerts.slice(0, 30);
    this.saveToDisk();
    this.broadcast('schedule_due', { alert });
    return alert;
  }

  private processDueSchedules(isRecoveryBoot: boolean): void {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    let changed = false;

    for (const item of this.data.schedules) {
      if (item.paused) continue;
      if (item.status !== 'scheduled' && item.status !== 'snoozed') continue;
      const targetIso = item.snoozedUntil || item.triggerAt;
      const dueMs = new Date(targetIso).getTime();
      if (Number.isNaN(dueMs) || dueMs > nowMs) continue;

      item.status = 'triggered';
      item.triggeredAt = nowIso;
      item.updatedAt = nowIso;
      item.snoozedUntil = undefined;
      changed = true;

      const spokenText =
        item.spokenMessage ||
        (item.kind === 'alarm'
          ? `Hasan, your ${item.title} alarm is going off.`
          : item.kind === 'timer'
          ? `Hasan, your ${item.title} timer is complete.`
          : `Hasan, your reminder ${item.title} is due.`);

      const alert: ServerProactiveAlert = {
        id: `alert_${item.id}_${Date.now()}`,
        title: `${item.kind === 'alarm' ? 'Alarm' : item.kind === 'timer' ? 'Timer' : 'Reminder'}: ${item.title}`,
        spokenText: isRecoveryBoot ? `Recovered overdue ${item.kind}: ${spokenText}` : spokenText,
        kind: item.kind,
        scheduleId: item.id,
        createdAt: nowIso,
      };

      this.data.pendingAlerts.unshift(alert);
      this.data.pendingAlerts = this.data.pendingAlerts.slice(0, 20);

      const logEntry: ServerExecutionLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        command: `${item.kind}:${item.title}`,
        intent: isRecoveryBoot ? 'startup_schedule_recovery' : 'scheduler_trigger',
        source: 'scheduler',
        status: 'COMPLETED',
        detail: alert.spokenText,
        verified: true,
        createdAt: nowIso,
      };
      this.data.executionLogs.unshift(logEntry);
      this.data.executionLogs = this.data.executionLogs.slice(0, 120);

      // Auto-roll daily recurring alarms/reminders
      if (item.recurrence === 'daily') {
        const nextTrigger = new Date(dueMs + 24 * 60 * 60 * 1000);
        while (nextTrigger.getTime() <= nowMs) {
          nextTrigger.setDate(nextTrigger.getDate() + 1);
        }
        this.data.schedules.push({
          id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          kind: item.kind,
          title: item.title,
          triggerAt: nextTrigger.toISOString(),
          recurrence: 'daily',
          status: 'scheduled',
          spokenMessage: item.spokenMessage,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }

      this.broadcast('schedule_due', { alert, item });
      this.broadcast('log_added', { entry: logEntry });
    }

    if (changed) {
      this.saveToDisk();
      this.broadcast('schedule_sync', { items: this.data.schedules });
    }
  }

  public getSchedules(): ServerScheduledItem[] {
    return this.data.schedules;
  }

  public getPendingAlerts(): ServerProactiveAlert[] {
    return this.data.pendingAlerts;
  }

  public ackAlert(alertId: string): boolean {
    const before = this.data.pendingAlerts.length;
    this.data.pendingAlerts = this.data.pendingAlerts.filter((a) => a.id !== alertId);
    if (this.data.pendingAlerts.length !== before) {
      this.saveToDisk();
      return true;
    }
    return false;
  }

  public getLogs(): ServerExecutionLog[] {
    return this.data.executionLogs;
  }

  public clearLogs(): void {
    this.data.executionLogs = [];
    this.saveToDisk();
  }

  public addLog(input: Omit<ServerExecutionLog, 'id' | 'createdAt'>): ServerExecutionLog {
    const entry: ServerExecutionLog = {
      ...input,
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.data.executionLogs.unshift(entry);
    this.data.executionLogs = this.data.executionLogs.slice(0, 120);
    this.saveToDisk();
    this.broadcast('log_added', { entry });
    return entry;
  }

  public createSchedule(params: {
    kind: ScheduleKind;
    title: string;
    triggerAt: string;
    durationSeconds?: number;
    recurrence?: 'once' | 'daily';
    spokenMessage?: string;
  }): { duplicate: boolean; item: ServerScheduledItem } {
    const nowIso = new Date().toISOString();
    const cleanTitle = params.title.trim().slice(0, 160) || 'Scheduled Item';
    const triggerMs = new Date(params.triggerAt).getTime();
    const safeTriggerAt = Number.isNaN(triggerMs)
      ? new Date(Date.now() + 60_000).toISOString()
      : new Date(triggerMs).toISOString();
    const targetMs = new Date(safeTriggerAt).getTime();

    // Prevent duplicate active alarms/reminders within 60 seconds
    const existing = this.data.schedules.find((item) => {
      if (item.status !== 'scheduled' && item.status !== 'snoozed') return false;
      if (item.kind !== params.kind) return false;
      const sameTitle = item.title.toLowerCase() === cleanTitle.toLowerCase();
      const itemMs = new Date(item.snoozedUntil || item.triggerAt).getTime();
      const closeTime = Math.abs(itemMs - targetMs) <= 60_000;
      return closeTime && (sameTitle || params.kind === 'alarm');
    });

    if (existing) {
      return { duplicate: true, item: existing };
    }

    const item: ServerScheduledItem = {
      id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kind: params.kind,
      title: cleanTitle,
      triggerAt: safeTriggerAt,
      durationSeconds: params.durationSeconds,
      recurrence: params.recurrence || 'once',
      status: 'scheduled',
      spokenMessage:
        params.spokenMessage ||
        (params.kind === 'alarm'
          ? `Hasan, it is time for your ${cleanTitle} alarm.`
          : params.kind === 'timer'
          ? `Hasan, your ${cleanTitle} timer is complete.`
          : `Hasan, your reminder ${cleanTitle} is due.`),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.data.schedules.unshift(item);
    this.saveToDisk();
    this.broadcast('schedule_sync', { items: this.data.schedules });
    return { duplicate: false, item };
  }

  public updateSchedule(
    id: string,
    patch: {
      title?: string;
      triggerAt?: string;
      recurrence?: 'once' | 'daily';
      status?: ScheduleStatus;
      snoozeMinutes?: number;
      paused?: boolean;
      remainingSecondsWhenPaused?: number;
      restart?: boolean;
    }
  ): ServerScheduledItem | null {
    const item = this.data.schedules.find((s) => s.id === id);
    if (!item) return null;

    const nowIso = new Date().toISOString();
    if (patch.title !== undefined && patch.title.trim()) {
      item.title = patch.title.trim().slice(0, 160);
    }
    if (patch.restart && item.durationSeconds) {
      item.triggerAt = new Date(Date.now() + item.durationSeconds * 1000).toISOString();
      item.status = 'scheduled';
      item.paused = false;
      item.remainingSecondsWhenPaused = undefined;
      item.snoozedUntil = undefined;
    } else if (typeof patch.paused === 'boolean') {
      if (patch.paused) {
        const rem =
          typeof patch.remainingSecondsWhenPaused === 'number'
            ? Math.max(1, Math.round(patch.remainingSecondsWhenPaused))
            : Math.max(1, Math.ceil((new Date(item.triggerAt).getTime() - Date.now()) / 1000));
        item.paused = true;
        item.remainingSecondsWhenPaused = rem;
      } else {
        const rem = item.remainingSecondsWhenPaused || item.durationSeconds || 60;
        item.paused = false;
        item.triggerAt = new Date(Date.now() + rem * 1000).toISOString();
        item.remainingSecondsWhenPaused = undefined;
        item.status = 'scheduled';
      }
    } else if (patch.triggerAt !== undefined) {
      const parsed = new Date(patch.triggerAt);
      if (!Number.isNaN(parsed.getTime())) {
        item.triggerAt = parsed.toISOString();
        item.status = 'scheduled';
        item.paused = false;
        item.remainingSecondsWhenPaused = undefined;
        item.snoozedUntil = undefined;
      }
    }
    if (patch.recurrence) {
      item.recurrence = patch.recurrence;
    }
    if (typeof patch.snoozeMinutes === 'number' && patch.snoozeMinutes > 0) {
      const nextIso = new Date(Date.now() + patch.snoozeMinutes * 60_000).toISOString();
      item.snoozedUntil = nextIso;
      item.triggerAt = nextIso;
      item.status = 'snoozed';
      item.paused = false;
    } else if (patch.status) {
      item.status = patch.status;
    }
    item.updatedAt = nowIso;
    this.saveToDisk();
    this.broadcast('schedule_sync', { items: this.data.schedules });
    return item;
  }

  public deleteSchedule(id: string): ServerScheduledItem | null {
    const idx = this.data.schedules.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const [removed] = this.data.schedules.splice(idx, 1);
    this.saveToDisk();
    this.broadcast('schedule_sync', { items: this.data.schedules });
    return removed;
  }

  public cancelByQuery(query?: string, kind?: ScheduleKind): ServerScheduledItem[] {
    const q = (query || '').trim().toLowerCase();
    const active = this.data.schedules.filter(
      (s) =>
        (s.status === 'scheduled' || s.status === 'snoozed') &&
        (!kind || s.kind === kind)
    );
    if (active.length === 0) return [];

    let targets: ServerScheduledItem[] = [];
    if (!q || q === 'all') {
      targets = q === 'all' ? active : [active[0]];
    } else {
      targets = active.filter(
        (s) =>
          s.id.toLowerCase() === q ||
          s.title.toLowerCase().includes(q) ||
          formatScheduledTimeLabel(s.triggerAt).toLowerCase().includes(q)
      );
      if (targets.length === 0) targets = [active[0]];
    }

    const nowIso = new Date().toISOString();
    for (const t of targets) {
      t.status = 'cancelled';
      t.updatedAt = nowIso;
    }
    this.saveToDisk();
    this.broadcast('schedule_sync', { items: this.data.schedules });
    return targets;
  }

  public snoozeByQuery(minutes: number, query?: string): ServerScheduledItem | null {
    const q = (query || '').trim().toLowerCase();
    const candidate =
      this.data.schedules.find(
        (s) =>
          (s.status === 'triggered' || s.status === 'scheduled' || s.status === 'snoozed') &&
          (!q || s.title.toLowerCase().includes(q))
      ) || this.data.schedules[0];

    if (!candidate) return null;
    return this.updateSchedule(candidate.id, { snoozeMinutes: minutes });
  }

  // Gemini Quota & Rate-Limit Protection
  public getQuotaStatus(): ServerQuotaStatus {
    const now = Date.now();
    const remainingMs = Math.max(0, this.cooldownUntilMs - now);
    const limited = remainingMs > 0;
    return {
      limited,
      cooldownUntil: limited ? new Date(this.cooldownUntilMs).toISOString() : undefined,
      retryAfterSeconds: Math.ceil(remainingMs / 1000),
      lastStatusCode: this.lastStatusCode,
      lastError: this.lastError,
      lastModel: this.lastModel,
    };
  }

  public resetQuotaOnSuccess(model?: string): void {
    this.consecutive429s = 0;
    this.cooldownUntilMs = 0;
    this.lastStatusCode = 200;
    this.lastError = undefined;
    if (model) this.lastModel = model;
  }

  public isDuplicatePrompt(key: string, windowMs = 1500): boolean {
    const now = Date.now();
    // prune old keys
    for (const [k, ts] of this.recentRequests.entries()) {
      if (now - ts > 5000) this.recentRequests.delete(k);
    }
    const prev = this.recentRequests.get(key);
    this.recentRequests.set(key, now);
    return prev !== undefined && now - prev < windowMs;
  }

  public recordGeminiError(err: unknown, model?: string): ServerQuotaStatus {
    const rawMsg = err instanceof Error ? err.message : String(err);
    // Strip any accidental key-like query tokens before logging
    const safeMsg = rawMsg.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]');

    const is429 =
      safeMsg.includes('429') ||
      safeMsg.includes('RESOURCE_EXHAUSTED') ||
      /rate\s*limit|quota/i.test(safeMsg);
    const is503 = safeMsg.includes('503') || safeMsg.includes('UNAVAILABLE');
    const is403 = safeMsg.includes('403') || safeMsg.includes('PERMISSION_DENIED');

    this.lastStatusCode = is429 ? 429 : is503 ? 503 : is403 ? 403 : 500;
    this.lastModel = model;

    if (is429) {
      this.consecutive429s += 1;
      const delayMatch = safeMsg.match(/retry(?:Delay| in| after)?["':\s]+(\d+(?:\.\d+)?)\s*s/i);
      const parsedSecs = delayMatch ? Math.ceil(parseFloat(delayMatch[1])) : 0;
      const backoffSecs = Math.min(180, 30 * Math.pow(2, Math.min(3, this.consecutive429s - 1)));
      const waitSecs = Math.max(15, parsedSecs || backoffSecs);

      this.cooldownUntilMs = Date.now() + waitSecs * 1000;
      this.lastError = `Gemini quota/rate limit active (retry in ${waitSecs}s). Local & PC actions remain operational.`;
      console.warn(
        `[Gemini API] status=429 model=${model || 'unknown'} retryAfter=${waitSecs}s consecutive=${this.consecutive429s}`
      );
      const status = this.getQuotaStatus();
      this.broadcast('quota_status', status);
      return status;
    }

    this.lastError = safeMsg.slice(0, 220);
    console.warn(
      `[Gemini API] status=${this.lastStatusCode} model=${model || 'unknown'} msg=${safeMsg.slice(0, 140)}`
    );
    return this.getQuotaStatus();
  }
}

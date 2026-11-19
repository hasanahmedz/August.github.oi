import type {
  AiMode,
  AssistantConfig,
  AssistantMessage,
  AssistantSessionSnapshot,
  AssistantState,
  ColorTemperature,
  GeminiVoiceName,
  MemoryCategory,
  MemoryFact,
  SearchHistoryItem,
  TaskItem,
  TaskPriority,
  ThinkingPreset,
  TimerItem,
  ToolGroupId,
  VoiceMode,
  WakeEnginePreference,
} from '../types/assistant';
import { PERSONA_PRESETS } from '../data/blueprintData';

const VALID_TOOL_GROUPS = new Set<ToolGroupId>([
  'tasks',
  'timers',
  'memory',
  'environment',
  'search',
  'computer',
]);
const VALID_THINKING = new Set<ThinkingPreset>(['LOW', 'MEDIUM', 'HIGH']);
const VALID_AI_MODES = new Set<AiMode>(['FAST', 'STANDARD', 'PRO', 'EXPERT']);
const VALID_WAKE_ENGINES = new Set<WakeEnginePreference>([
  'auto',
  'porcupine',
  'speech_recognition',
  'manual',
]);
const VALID_VOICE_MODES = new Set<VoiceMode>(['gemini', 'browser', 'muted']);
const VALID_VOICES = new Set<GeminiVoiceName>([
  'Charon',
  'Fenrir',
  'Kore',
  'Puck',
  'Zephyr',
]);
const VALID_PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high']);
const VALID_TEMPS = new Set<ColorTemperature>(['warm', 'daylight', 'cool']);
const VALID_MEM_CATS = new Set<MemoryCategory>([
  'preference',
  'note',
  'project',
  'command',
  'assistant_preference',
  'summary',
  'knowledge',
  'task_context',
  'context',
  'contact',
]);

export function createSessionSnapshot(
  messages: AssistantMessage[],
  config: AssistantConfig,
  state: AssistantState
): AssistantSessionSnapshot {
  // Never export local sensitive client keys in backup JSON
  const safeConfig: AssistantConfig = {
    ...config,
    picovoiceAccessKey: undefined,
  };
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    messages,
    config: safeConfig,
    state,
  };
}

export function downloadSessionJson(snapshot: AssistantSessionSnapshot): string {
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const dateStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `jarvis-session-${dateStamp}.json`;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  return filename;
}

export function parseAndValidateSessionJson(
  rawText: string
): { ok: true; snapshot: AssistantSessionSnapshot } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: 'The selected file is not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Session file must be a JSON object.' };
  }

  const record = parsed as Record<string, unknown>;

  if (!Array.isArray(record.messages)) {
    return {
      ok: false,
      error: 'Missing or invalid "messages" array in session file.',
    };
  }

  if (!record.config || typeof record.config !== 'object' || Array.isArray(record.config)) {
    return {
      ok: false,
      error: 'Missing or invalid "config" object in session file.',
    };
  }

  if (!record.state || typeof record.state !== 'object' || Array.isArray(record.state)) {
    return {
      ok: false,
      error: 'Missing or invalid "state" object in session file.',
    };
  }

  const nowIso = new Date().toISOString();

  const messages: AssistantMessage[] = [];
  for (let i = 0; i < record.messages.length; i += 1) {
    const item = record.messages[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Invalid message entry at index ${i}.` };
    }
    const m = item as Record<string, unknown>;
    if (m.role !== 'user' && m.role !== 'model') {
      return {
        ok: false,
        error: `Message at index ${i} must have role "user" or "model".`,
      };
    }
    if (typeof m.text !== 'string') {
      return { ok: false, error: `Message at index ${i} is missing text.` };
    }
    messages.push({
      id: typeof m.id === 'string' && m.id ? m.id : `msg_imported_${i}_${Date.now()}`,
      role: m.role,
      text: m.text,
      timestamp: typeof m.timestamp === 'string' && m.timestamp ? m.timestamp : 'Restored',
      trace: Array.isArray(m.trace) ? m.trace : undefined,
      groundingSources: Array.isArray(m.groundingSources) ? m.groundingSources : undefined,
      error: typeof m.error === 'boolean' ? m.error : undefined,
    });
  }

  const rawConfig = record.config as Record<string, unknown>;
  const defaultPreset = PERSONA_PRESETS[0];
  const rawTools = Array.isArray(rawConfig.enabledTools)
    ? rawConfig.enabledTools.filter(
        (t): t is ToolGroupId => typeof t === 'string' && VALID_TOOL_GROUPS.has(t as ToolGroupId)
      )
    : ['tasks', 'timers', 'memory', 'environment', 'search', 'computer'];

  const config: AssistantConfig = {
    personaId:
      typeof rawConfig.personaId === 'string' && rawConfig.personaId
        ? rawConfig.personaId
        : defaultPreset.id,
    systemInstruction:
      typeof rawConfig.systemInstruction === 'string' && rawConfig.systemInstruction.trim()
        ? rawConfig.systemInstruction
        : defaultPreset.systemInstruction,
    enabledTools: rawTools as ToolGroupId[],
    thinkingLevel:
      typeof rawConfig.thinkingLevel === 'string' &&
      VALID_THINKING.has(rawConfig.thinkingLevel as ThinkingPreset)
        ? (rawConfig.thinkingLevel as ThinkingPreset)
        : 'MEDIUM',
    aiMode:
      typeof rawConfig.aiMode === 'string' &&
      VALID_AI_MODES.has(rawConfig.aiMode as AiMode)
        ? (rawConfig.aiMode as AiMode)
        : 'STANDARD',
    continuousMode: Boolean(rawConfig.continuousMode),
    memoryEnabled:
      rawConfig.memoryEnabled === undefined ? true : Boolean(rawConfig.memoryEnabled),
    wakeEngine:
      typeof rawConfig.wakeEngine === 'string' &&
      VALID_WAKE_ENGINES.has(rawConfig.wakeEngine as WakeEnginePreference)
        ? (rawConfig.wakeEngine as WakeEnginePreference)
        : 'auto',
    voiceMode:
      typeof rawConfig.voiceMode === 'string' &&
      VALID_VOICE_MODES.has(rawConfig.voiceMode as VoiceMode)
        ? (rawConfig.voiceMode as VoiceMode)
        : 'gemini',
    voiceName:
      typeof rawConfig.voiceName === 'string' &&
      VALID_VOICES.has(rawConfig.voiceName as GeminiVoiceName)
        ? (rawConfig.voiceName as GeminiVoiceName)
        : defaultPreset.voiceName,
    agentVoiceProfileId:
      typeof rawConfig.agentVoiceProfileId === 'string' && rawConfig.agentVoiceProfileId
        ? rawConfig.agentVoiceProfileId.slice(0, 64)
        : 'jarvis_tactical',
    agentVoiceStyle:
      typeof rawConfig.agentVoiceStyle === 'string' && rawConfig.agentVoiceStyle.trim()
        ? rawConfig.agentVoiceStyle.slice(0, 300)
        : 'Calm, articulate, composed personal AI butler with crisp diction',
    voiceVolume:
      typeof rawConfig.voiceVolume === 'number'
        ? Math.min(1, Math.max(0, rawConfig.voiceVolume))
        : 0.9,
    voiceSpeed:
      typeof rawConfig.voiceSpeed === 'number'
        ? Math.min(1.4, Math.max(0.75, rawConfig.voiceSpeed))
        : 1.0,
    voicePitchSemitones:
      typeof rawConfig.voicePitchSemitones === 'number'
        ? Math.min(6, Math.max(-6, rawConfig.voicePitchSemitones))
        : 0,
    proactiveVoiceAlerts:
      rawConfig.proactiveVoiceAlerts === undefined
        ? true
        : Boolean(rawConfig.proactiveVoiceAlerts),
    spokenToolUpdates:
      rawConfig.spokenToolUpdates === undefined
        ? true
        : Boolean(rawConfig.spokenToolUpdates),
  };

  const rawState = record.state as Record<string, unknown>;
  if (!Array.isArray(rawState.tasks) || !Array.isArray(rawState.timers)) {
    return {
      ok: false,
      error: 'Session "state" must include "tasks" and "timers" arrays.',
    };
  }

  const tasks: TaskItem[] = [];
  for (let i = 0; i < rawState.tasks.length; i += 1) {
    const t = rawState.tasks[i] as Record<string, unknown>;
    if (!t || typeof t !== 'object' || typeof t.title !== 'string') {
      return { ok: false, error: `Invalid task item at index ${i}.` };
    }
    tasks.push({
      id: typeof t.id === 'string' && t.id ? t.id : `task_imp_${i}_${Date.now()}`,
      title: t.title.slice(0, 240),
      priority:
        typeof t.priority === 'string' && VALID_PRIORITIES.has(t.priority as TaskPriority)
          ? (t.priority as TaskPriority)
          : 'medium',
      completed: Boolean(t.completed),
      dueLabel: typeof t.dueLabel === 'string' ? t.dueLabel.slice(0, 80) : undefined,
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : nowIso,
    });
  }

  const timers: TimerItem[] = [];
  for (let i = 0; i < rawState.timers.length; i += 1) {
    const tm = rawState.timers[i] as Record<string, unknown>;
    if (!tm || typeof tm !== 'object' || typeof tm.label !== 'string') {
      return { ok: false, error: `Invalid timer item at index ${i}.` };
    }
    const durationSeconds = Math.max(1, Math.round(Number(tm.durationSeconds) || 60));
    const remainingSeconds = Math.min(
      durationSeconds,
      Math.max(0, Math.round(Number(tm.remainingSeconds ?? durationSeconds)))
    );
    timers.push({
      id: typeof tm.id === 'string' && tm.id ? tm.id : `timer_imp_${i}_${Date.now()}`,
      label: tm.label,
      durationSeconds,
      remainingSeconds,
      running: remainingSeconds > 0 ? Boolean(tm.running) : false,
      createdAt: typeof tm.createdAt === 'string' ? tm.createdAt : nowIso,
    });
  }

  const memory: MemoryFact[] = Array.isArray(rawState.memory)
    ? rawState.memory
        .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === 'object'))
        .map((m, i) => ({
          id: typeof m.id === 'string' && m.id ? m.id : `mem_imp_${i}_${Date.now()}`,
          key:
            typeof m.key === 'string' && m.key
              ? m.key.slice(0, 120)
              : `fact_${i}`,
          value: (typeof m.value === 'string' ? m.value : String(m.value ?? '')).slice(
            0,
            2000
          ),
          category:
            typeof m.category === 'string' &&
            VALID_MEM_CATS.has(m.category as MemoryCategory)
              ? (m.category as MemoryCategory)
              : 'context',
          approved: m.approved === undefined ? true : Boolean(m.approved),
          updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : nowIso,
        }))
    : [];

  const rawEnv =
    rawState.environment && typeof rawState.environment === 'object'
      ? (rawState.environment as Record<string, unknown>)
      : {};

  const searchHistory: SearchHistoryItem[] = Array.isArray(rawState.searchHistory)
    ? rawState.searchHistory
        .filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(
              entry &&
                typeof entry === 'object' &&
                typeof (entry as Record<string, unknown>).query === 'string'
            )
        )
        .map((entry, i) => ({
          id:
            typeof entry.id === 'string' && entry.id
              ? entry.id
              : `hist_imp_${i}_${Date.now()}`,
          query: String(entry.query).trim().slice(0, 1000),
          responsePreview:
            typeof entry.responsePreview === 'string'
              ? entry.responsePreview.slice(0, 1500)
              : undefined,
          aiMode:
            typeof entry.aiMode === 'string' &&
            VALID_AI_MODES.has(entry.aiMode as AiMode)
              ? (entry.aiMode as AiMode)
              : undefined,
          memoriesUsed: Array.isArray(entry.memoriesUsed)
            ? entry.memoriesUsed.map((x) => String(x).slice(0, 120)).slice(0, 15)
            : undefined,
          createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : nowIso,
          lastRunAt: typeof entry.lastRunAt === 'string' ? entry.lastRunAt : nowIso,
          runCount: Math.max(1, Math.round(Number(entry.runCount) || 1)),
          usedSearchGrounding:
            typeof entry.usedSearchGrounding === 'boolean'
              ? entry.usedSearchGrounding
              : undefined,
          toolCount:
            typeof entry.toolCount === 'number' ? Math.max(0, entry.toolCount) : undefined,
        }))
        .filter((entry) => entry.query.length > 0)
    : [];

  const state: AssistantState = {
    tasks,
    timers,
    memory,
    environment: {
      lightBrightness: Math.min(
        100,
        Math.max(0, Math.round(Number(rawEnv.lightBrightness ?? 75)))
      ),
      lightTemperature:
        typeof rawEnv.lightTemperature === 'string' &&
        VALID_TEMPS.has(rawEnv.lightTemperature as ColorTemperature)
          ? (rawEnv.lightTemperature as ColorTemperature)
          : 'daylight',
      thermostatCelsius: Math.min(
        28,
        Math.max(16, Number(rawEnv.thermostatCelsius ?? 21))
      ),
      focusMode: Boolean(rawEnv.focusMode),
    },
    searchHistory,
  };

  return {
    ok: true,
    snapshot: {
      schemaVersion: 1,
      exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : nowIso,
      messages,
      config,
      state,
    },
  };
}

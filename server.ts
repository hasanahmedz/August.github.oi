import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import {
  GoogleGenAI,
  InteractionStatus,
  Modality,
  ThinkingLevel,
  Type,
  type Content,
  type FunctionDeclaration,
  type LiveServerMessage,
  type Part,
  type Session,
  type Tool,
} from '@google/genai';
import {
  AutonomousSchedulerService,
  type ScheduleKind,
} from './serverScheduler.ts';
import {
  formatScheduledTimeLabel,
  parseLocalCommand,
  parseNaturalTimeExpression,
  resolveWebTarget,
} from './src/utils/commandParsers.ts';
import { ServerBrowserService } from './serverBrowser.ts';
import { InternetMonitorService } from './serverMonitor.ts';
import { verifyOptionalFirebaseAuth } from './serverAuth.ts';
import { createKnowledgeRouter } from './serverKnowledge.ts';
import { createIntegrationsRouter } from './serverIntegrations.ts';
import { createAgentRouter } from './serverAgent.ts';
import { DESKTOP_COMPANION_SCRIPT } from './src/utils/computerControl.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);


function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Open Settings > Secrets to set your Gemini API key.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

type AiMode = 'FAST' | 'STANDARD' | 'PRO' | 'EXPERT';

interface TaskItem {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  dueLabel?: string;
  createdAt: string;
}

interface TimerItem {
  id: string;
  label: string;
  durationSeconds: number;
  remainingSeconds: number;
  running: boolean;
  createdAt: string;
}

type MemoryCategory =
  | 'preference'
  | 'note'
  | 'project'
  | 'command'
  | 'assistant_preference'
  | 'summary'
  | 'knowledge'
  | 'task_context'
  | 'context'
  | 'contact';

interface MemoryFact {
  id: string;
  key: string;
  value: string;
  category: MemoryCategory;
  approved?: boolean;
  updatedAt: string;
}

interface EnvironmentState {
  lightBrightness: number;
  lightTemperature: 'warm' | 'daylight' | 'cool';
  thermostatCelsius: number;
  focusMode: boolean;
}

interface SearchHistoryItem {
  id: string;
  query: string;
  createdAt: string;
  lastRunAt: string;
  runCount: number;
  usedSearchGrounding?: boolean;
  toolCount?: number;
}

interface AssistantState {
  tasks: TaskItem[];
  timers: TimerItem[];
  memory: MemoryFact[];
  environment: EnvironmentState;
  searchHistory?: SearchHistoryItem[];
}

interface ChatMessageInput {
  role: 'user' | 'model';
  text: string;
}

interface ToolTraceItem {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  durationMs: number;
}

function resolveAiModeConfig(rawMode?: string): {
  mode: AiMode;
  liveModel: string;
  useExtendedLive: boolean;
  liveThinkingLevel?: ThinkingLevel;
  restModel: string;
  restThinkingLevel: ThinkingLevel;
  directive: string;
} {
  const normalized = String(rawMode || 'STANDARD').toUpperCase();
  if (normalized === 'FAST') {
    return {
      mode: 'FAST',
      liveModel: 'gemini-3.8-live',
      useExtendedLive: false,
      restModel: 'gemini-4-hydrogen',
      restThinkingLevel: ThinkingLevel.LOW,
      directive:
        'AI Mode FAST: Prioritize ultra-low latency. Respond in 1 crisp spoken sentence and invoke tools immediately without preamble.',
    };
  }
  if (normalized === 'PRO') {
    return {
      mode: 'PRO',
      liveModel: 'gemini-3.8-live-extended-thinking',
      useExtendedLive: true,
      liveThinkingLevel: ThinkingLevel.HIGH,
      restModel: 'gemini-4-hydrogen',
      restThinkingLevel: ThinkingLevel.HIGH,
      directive:
        'AI Mode PRO: Apply high-depth multi-step reasoning, verify factual claims via search tools when relevant, and deliver clear, accurate engineering or planning guidance.',
    };
  }
  if (normalized === 'EXPERT') {
    return {
      mode: 'EXPERT',
      liveModel: 'gemini-3.8-live-extended-thinking',
      useExtendedLive: true,
      liveThinkingLevel: ThinkingLevel.HIGH,
      restModel: 'gemini-4-hydrogen',
      restThinkingLevel: ThinkingLevel.XHIGH,
      directive:
        'AI Mode EXPERT: Perform thorough multi-step analysis, cross-reference relevant personal memories and workspace tasks, verify outcomes, and articulate trade-offs cleanly.',
    };
  }
  return {
    mode: 'STANDARD',
    liveModel: 'gemini-3.8-live-extended-thinking',
    useExtendedLive: true,
    liveThinkingLevel: ThinkingLevel.MEDIUM,
    restModel: 'gemini-4-hydrogen',
    restThinkingLevel: ThinkingLevel.MEDIUM,
    directive:
      'AI Mode STANDARD: Balance conversational responsiveness with reliable tool orchestration and concise reasoning.',
  };
}

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

const TOOL_DECLARATIONS: Record<string, FunctionDeclaration[]> = {
  tasks: [
    {
      name: 'create_task',
      description: 'Create a new personal task or reminder in the user task list.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Concise action title for the task.',
          },
          priority: {
            type: Type.STRING,
            description: 'Task priority: low, medium, or high.',
          },
          dueLabel: {
            type: Type.STRING,
            description: 'Optional due time or date label, e.g. Today 4:00 PM or Tomorrow.',
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'complete_task',
      description: 'Mark an existing task as completed or uncompleted by matching its title or ID.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'Task ID or partial title to match.',
          },
          completed: {
            type: Type.BOOLEAN,
            description: 'Whether the task is completed (defaults to true).',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'delete_task',
      description: 'Remove a task from the user task list by matching its ID or title.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'Task ID or partial title to delete.',
          },
        },
        required: ['query'],
      },
    },
  ],
  timers: [
    {
      name: 'set_timer',
      description: 'Create and start a persistent countdown timer in seconds or minutes.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          label: {
            type: Type.STRING,
            description: 'Short label for what the timer is tracking.',
          },
          minutes: {
            type: Type.NUMBER,
            description: 'Duration in minutes (can be fractional, e.g. 0.5 for 30 seconds).',
          },
          seconds: {
            type: Type.NUMBER,
            description: 'Additional duration in seconds.',
          },
        },
        required: ['label'],
      },
    },
    {
      name: 'cancel_timer',
      description: 'Cancel and remove an active timer by label or ID.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'Timer ID or partial label to cancel.',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'set_alarm',
      description: 'Set a persistent real alarm for a specific clock time such as "7 AM", "7:30 PM", or "tomorrow at 8 AM".',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Alarm label, e.g. Wake up or Morning Medication.',
          },
          timeExpression: {
            type: Type.STRING,
            description: 'Natural clock time or ISO timestamp, e.g. "7 AM", "7:30 PM", or "tomorrow at 6:30 AM".',
          },
          daily: {
            type: Type.BOOLEAN,
            description: 'Whether the alarm repeats daily.',
          },
        },
        required: ['timeExpression'],
      },
    },
    {
      name: 'create_reminder',
      description: 'Schedule a persistent delayed or future reminder (e.g. "after 2 minutes", "tomorrow to call someone", "at 5 PM").',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'What to remind the user about.',
          },
          whenExpression: {
            type: Type.STRING,
            description: 'Natural delay or date/time string, e.g. "after 2 minutes", "tomorrow at 9 AM", or ISO string.',
          },
        },
        required: ['title', 'whenExpression'],
      },
    },
    {
      name: 'list_schedules',
      description: 'List upcoming persistent alarms, reminders, and active timers.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            description: 'Optional filter: alarm, reminder, timer, or all.',
          },
        },
      },
    },
    {
      name: 'cancel_schedule',
      description: 'Cancel an active alarm, reminder, or timer by title, time, or ID.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'Title, time, ID, or "all".',
          },
          kind: {
            type: Type.STRING,
            description: 'Optional type: alarm, reminder, or timer.',
          },
        },
      },
    },
    {
      name: 'snooze_schedule',
      description: 'Snooze an alarm or reminder by a number of minutes (default 5).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          minutes: {
            type: Type.NUMBER,
            description: 'Snooze duration in minutes.',
          },
          query: {
            type: Type.STRING,
            description: 'Optional alarm or reminder title to match.',
          },
        },
      },
    },
  ],
  memory: [
    {
      name: 'remember_fact',
      description:
        'Propose saving a persistent user preference, note, project detail, or knowledge item to the Personal Memory vault (requires user approval on screen).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          key: {
            type: Type.STRING,
            description: 'Short attribute key, e.g. preferred_language or hardware_mic.',
          },
          value: {
            type: Type.STRING,
            description: 'The fact or preference to remember.',
          },
          category: {
            type: Type.STRING,
            description:
              'Category: preference, note, project, command, assistant_preference, summary, knowledge, or task_context.',
          },
        },
        required: ['key', 'value'],
      },
    },
    {
      name: 'forget_fact',
      description: 'Remove a stored fact from the memory vault by key or partial value.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'Key or partial text of the memory to remove.',
          },
        },
        required: ['query'],
      },
    },
  ],
  environment: [
    {
      name: 'set_room_lighting',
      description: 'Adjust the workspace lighting brightness (0-100) and color temperature.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          brightness: {
            type: Type.NUMBER,
            description: 'Brightness percentage from 0 (off) to 100 (full).',
          },
          colorTemperature: {
            type: Type.STRING,
            description: 'Lighting temperature: warm, daylight, or cool.',
          },
        },
        required: ['brightness'],
      },
    },
    {
      name: 'set_thermostat',
      description: 'Set the workspace target temperature in degrees Celsius (16 to 28).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          celsius: {
            type: Type.NUMBER,
            description: 'Target temperature in Celsius between 16 and 28.',
          },
        },
        required: ['celsius'],
      },
    },
    {
      name: 'toggle_focus_mode',
      description: 'Enable or disable Do Not Disturb focus mode in the workspace.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          enabled: {
            type: Type.BOOLEAN,
            description: 'True to enable focus mode, false to disable.',
          },
        },
        required: ['enabled'],
      },
    },
  ],
};

function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  state: AssistantState
): Record<string, unknown> {
  const nowIso = new Date().toISOString();

  switch (name) {
    case 'create_task': {
      const title = String(args.title || 'Untitled task').trim().slice(0, 240);
      const rawPriority = String(args.priority || 'medium').toLowerCase();
      const priority: 'low' | 'medium' | 'high' =
        rawPriority === 'high' || rawPriority === 'low' ? rawPriority : 'medium';
      const dueLabel = args.dueLabel ? String(args.dueLabel).trim().slice(0, 80) : undefined;
      const newTask: TaskItem = {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        priority,
        completed: false,
        dueLabel,
        createdAt: nowIso,
      };
      state.tasks.unshift(newTask);
      return { status: 'created', task: newTask, totalTasks: state.tasks.length };
    }

    case 'complete_task': {
      const query = String(args.query || '').toLowerCase();
      const completed = args.completed === undefined ? true : Boolean(args.completed);
      const match = state.tasks.find(
        (t) => t.id.toLowerCase() === query || t.title.toLowerCase().includes(query)
      );
      if (!match) {
        return { status: 'not_found', query };
      }
      match.completed = completed;
      return { status: 'updated', task: match };
    }

    case 'delete_task': {
      const query = String(args.query || '').toLowerCase();
      const index = state.tasks.findIndex(
        (t) => t.id.toLowerCase() === query || t.title.toLowerCase().includes(query)
      );
      if (index === -1) {
        return { status: 'not_found', query };
      }
      const [removed] = state.tasks.splice(index, 1);
      return { status: 'deleted', removed };
    }

    case 'set_timer': {
      const label = String(args.label || 'Focus Timer').trim();
      const mins = Number(args.minutes || 0);
      const secs = Number(args.seconds || 0);
      const totalSeconds = Math.max(5, Math.round(mins * 60 + secs) || 300);
      const newTimer: TimerItem = {
        id: `timer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        label,
        durationSeconds: totalSeconds,
        remainingSeconds: totalSeconds,
        running: true,
        createdAt: nowIso,
      };
      state.timers.unshift(newTimer);
      return { status: 'started', timer: newTimer };
    }

    case 'cancel_timer': {
      const query = String(args.query || '').toLowerCase();
      const index = state.timers.findIndex(
        (t) => t.id.toLowerCase() === query || t.label.toLowerCase().includes(query)
      );
      if (index === -1) {
        return { status: 'not_found', query };
      }
      const [removed] = state.timers.splice(index, 1);
      return { status: 'cancelled', removed };
    }

    case 'remember_fact': {
      const key = String(args.key || 'note')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .slice(0, 120);
      const value = String(args.value || '').trim().slice(0, 2000);
      const rawCat = String(args.category || 'note').toLowerCase() as MemoryCategory;
      const category: MemoryCategory = VALID_MEM_CATS.has(rawCat) ? rawCat : 'note';

      const existing = state.memory.find((m) => m.key.toLowerCase() === key);
      if (existing) {
        existing.value = value;
        existing.category = category;
        existing.approved = true;
        existing.updatedAt = nowIso;
        return { status: 'updated', memory: existing };
      }
      const fact: MemoryFact = {
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        key,
        value,
        category,
        approved: true,
        updatedAt: nowIso,
      };
      state.memory.unshift(fact);
      return { status: 'stored', memory: fact };
    }

    case 'forget_fact': {
      const query = String(args.query || '').toLowerCase();
      const index = state.memory.findIndex(
        (m) => m.key.toLowerCase().includes(query) || m.value.toLowerCase().includes(query)
      );
      if (index === -1) {
        return { status: 'not_found', query };
      }
      const [removed] = state.memory.splice(index, 1);
      return { status: 'forgotten', removed };
    }

    case 'set_room_lighting': {
      const brightness = Math.min(100, Math.max(0, Math.round(Number(args.brightness ?? 75))));
      const tempRaw = String(args.colorTemperature || state.environment.lightTemperature).toLowerCase();
      const lightTemperature: EnvironmentState['lightTemperature'] =
        tempRaw === 'warm' || tempRaw === 'cool' || tempRaw === 'daylight'
          ? tempRaw
          : state.environment.lightTemperature;
      state.environment.lightBrightness = brightness;
      state.environment.lightTemperature = lightTemperature;
      return { status: 'applied', environment: state.environment };
    }

    case 'set_thermostat': {
      const celsius = Math.min(28, Math.max(16, Number(args.celsius ?? 21)));
      state.environment.thermostatCelsius = Math.round(celsius * 2) / 2;
      return { status: 'applied', environment: state.environment };
    }

    case 'toggle_focus_mode': {
      state.environment.focusMode = Boolean(args.enabled);
      return { status: 'applied', environment: state.environment };
    }

    default:
      return { status: 'unsupported_tool', name };
  }
}

function buildContextPrompt(
  personaInstruction: string,
  state: AssistantState,
  enabledTools: string[],
  memoryEnabled: boolean,
  modeDirective: string
): { systemInstruction: string; injectedMemoryKeys: string[] } {
  const approvedMemories = memoryEnabled
    ? state.memory.filter((m) => m.approved !== false)
    : [];

  const injectedMemoryKeys = approvedMemories.slice(0, 15).map((m) => m.key);

  const memoryLines = !memoryEnabled
    ? 'Personal Memory Vault is currently DISABLED by user preference.'
    : approvedMemories.length > 0
    ? approvedMemories
        .slice(0, 30)
        .map((m) => `- ${m.key} (${m.category}): ${m.value}`)
        .join('\n')
    : 'No approved memories stored yet.';

  const taskLines =
    state.tasks.length > 0
      ? state.tasks
          .slice(0, 20)
          .map(
            (t) =>
              `- [${t.completed ? 'x' : ' '}] ${t.title} (priority: ${t.priority}${
                t.dueLabel ? `, due: ${t.dueLabel}` : ''
              })`
          )
          .join('\n')
      : 'No tasks yet.';

  const timerLines =
    state.timers.length > 0
      ? state.timers
          .map(
            (t) =>
              `- ${t.label}: ${t.remainingSeconds}s remaining (${t.running ? 'running' : 'paused'})`
          )
          .join('\n')
      : 'No active timers.';

  const systemInstruction = `${personaInstruction}

${modeDirective}
Current Local Time: ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
Enabled Tool Groups: ${enabledTools.join(', ') || 'none'}

LIVE WORKSPACE STATE (authoritative):
[Personal Memory Vault]
${memoryLines}

[Task List]
${taskLines}

[Active Timers]
${timerLines}

[Workspace Environment]
- Lighting: ${state.environment.lightBrightness}% (${state.environment.lightTemperature})
- Thermostat: ${state.environment.thermostatCelsius}°C
- Focus Mode: ${state.environment.focusMode ? 'Enabled' : 'Disabled'}

Guidelines:
1. When the user asks to perform an action (create task, set timer, adjust lights/thermostat/focus mode, open website/app, or execute computer control), invoke the appropriate function tool immediately instead of pretending you did it.
2. Never falsely claim a native OS action completed if the user still needs to approve a confirmation card or connect the Desktop Companion.
3. For memory storage, call remember_fact ONLY when the user asks to remember something or shares an explicit enduring preference/fact; the user approves memory additions on screen.
4. Use [Personal Memory Vault] as natural background context rather than repeating the profile back unprompted; never invent unconfirmed facts or treat past timelines as current without confirmation.
5. When answering factual or current-event questions, use web search if enabled.`;

  return { systemInstruction, injectedMemoryKeys };
}

function extractApiError(err: unknown): {
  status: number;
  message: string;
  retryAfterSeconds?: number;
  quotaLimited?: boolean;
} {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]');
  if (msg.includes('GEMINI_API_KEY is not configured')) {
    return { status: 400, message: msg };
  }
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'Gemini API key is missing or invalid. Check Settings > Secrets.',
    };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || /rate\s*limit|quota/i.test(msg)) {
    const delayMatch = msg.match(/retry(?:Delay| in| after)?["':\s]+(\d+(?:\.\d+)?)\s*s/i);
    const retryAfterSeconds = delayMatch ? Math.max(5, Math.ceil(parseFloat(delayMatch[1]))) : 45;
    return {
      status: 429,
      message: `Gemini API rate limit / quota reached. Cooling down for ${retryAfterSeconds}s — local & PC commands remain available.`,
      retryAfterSeconds,
      quotaLimited: true,
    };
  }
  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return {
      status: 503,
      message: 'Gemini model is temporarily experiencing high demand. Please retry in a moment.',
    };
  }
  return { status: 500, message: msg.slice(0, 260) || 'Failed to generate assistant response.' };
}

async function generateContentWithRetry(
  ai: GoogleGenAI,
  scheduler: AutonomousSchedulerService,
  params: {
    model: string;
    contents: Content[] | string | { parts: Part[] };
    config?: Record<string, unknown>;
  }
) {
  const quotaBefore = scheduler.getQuotaStatus();
  if (quotaBefore.limited) {
    throw new Error(
      `429 RESOURCE_EXHAUSTED: Gemini cooldown active (retry in ${quotaBefore.retryAfterSeconds}s)`
    );
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const isQuotaError = (err: unknown) => {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota');
  };
  const isTransient = (err: unknown) => {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      msg.includes('503') ||
      msg.includes('unavailable') ||
      msg.includes('high demand') ||
      msg.includes('overloaded') ||
      msg.includes('not_found') ||
      msg.includes('404') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout')
    );
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent(params);
      scheduler.resetQuotaOnSuccess(params.model);
      return response;
    } catch (err) {
      lastErr = err;
      if (isQuotaError(err)) {
        // Hard 429: trip circuit breaker immediately instead of spamming retries
        scheduler.recordGeminiError(err, params.model);
        throw err;
      }
      if (!isTransient(err) || attempt === 1) break;
      const jitter = Math.floor(Math.random() * 250);
      await sleep(500 * Math.pow(2, attempt) + jitter);
    }
  }

  // Fallback to lite model ONLY on transient non-429 capacity/404 errors
  if (params.model !== 'gemini-3.1-flash-lite' && isTransient(lastErr)) {
    const fallbackConfig = params.config ? { ...params.config } : undefined;
    if (fallbackConfig && 'thinkingConfig' in fallbackConfig) {
      delete fallbackConfig.thinkingConfig;
    }
    try {
      const fallbackRes = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: params.contents,
        config: fallbackConfig,
      });
      scheduler.resetQuotaOnSuccess('gemini-3.1-flash-lite');
      return fallbackRes;
    } catch (fbErr) {
      scheduler.recordGeminiError(fbErr, 'gemini-3.1-flash-lite');
      throw fbErr;
    }
  }

  scheduler.recordGeminiError(lastErr, params.model);
  throw lastErr;
}

async function createAppServer() {
  const app = express();
  app.use(express.json({ limit: '16mb' }));
  app.use('/api', verifyOptionalFirebaseAuth);

  const scheduler = new AutonomousSchedulerService(__dirname);
  scheduler.init();

  const browserService = new ServerBrowserService();
  const monitorService = new InternetMonitorService(__dirname, {
    onUpdate: (update, topic) => {
      scheduler.broadcastEvent('monitor_update', { update, topic });
      scheduler.pushExternalAlert({
        title: `Update: ${topic.label} (${update.verification === 'confirmed' ? 'Confirmed' : 'Rumor'})`,
        spokenText: `Sir, new ${topic.label} update found from ${update.sourceName}: ${update.headline}. Would you like me to brief you on it?`,
        kind: 'monitor',
        sourceUrl: update.sourceUrl,
        verification: update.verification,
      });
      scheduler.addLog({
        command: `monitor:${topic.label}`,
        intent: 'monitor_update_found',
        source: 'scheduler',
        status: 'COMPLETED',
        detail: `${update.headline} (${update.sourceUrl})`,
        verified: true,
      });
    },
    onSync: (topics, updates) => {
      scheduler.broadcastEvent('monitor_sync', { topics, updates });
    },
  });
  monitorService.init();

  app.use('/api/knowledge', createKnowledgeRouter(scheduler));
  app.use('/api', createIntegrationsRouter(scheduler));
  app.use('/api', createAgentRouter(scheduler));

  app.get('/api/companion/bundle/:filename', (req: Request, res: Response) => {
    const filename = String(req.params.filename || '').trim();
    if (filename === 'jarvis-companion.mjs') {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="jarvis-companion.mjs"');
      res.send(DESKTOP_COMPANION_SCRIPT);
      return;
    }
    const allowedDiskFiles = new Set([
      'jarvis_windows_agent.py',
      'requirements.txt',
      'start-companion.bat',
    ]);
    if (!allowedDiskFiles.has(filename)) {
      res.status(404).json({ error: 'Unknown companion bundle file.' });
      return;
    }
    const diskPath = path.join(__dirname, 'companion', filename);
    if (!fs.existsSync(diskPath)) {
      res.status(404).json({ error: 'Companion file not found on server.' });
      return;
    }
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(diskPath);
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() });
  });

  app.get('/api/assistant/status', (_req: Request, res: Response) => {
    const quota = scheduler.getQuotaStatus();
    const activeSchedules = scheduler
      .getSchedules()
      .filter((s) => s.status === 'scheduled' || s.status === 'snoozed').length;
    res.json({
      ok: true,
      quota,
      activeSchedules,
      activeMonitors: monitorService.getTopics().filter((t) => t.status === 'active').length,
      pendingAlertsCount: scheduler.getPendingAlerts().length,
      timestamp: new Date().toISOString(),
    });
  });

  // Proactive Internet Monitoring API
  app.get('/api/monitors', (_req: Request, res: Response) => {
    res.json({
      topics: monitorService.getTopics(),
      updates: monitorService.getUpdates(),
      updatesToday: monitorService.getUpdatesToday(),
    });
  });

  app.post('/api/monitors', async (req: Request, res: Response) => {
    const b = req.body as {
      query?: string;
      officialOnly?: boolean;
      intervalMinutes?: number;
    };
    const query = String(b.query || '').trim();
    if (!query) {
      res.status(400).json({ error: 'Monitor topic query is required.' });
      return;
    }
    const result = await monitorService.addTopic({
      query,
      officialOnly: b.officialOnly,
      intervalMinutes: b.intervalMinutes,
    });
    scheduler.addLog({
      command: `monitor_add:${query}`,
      intent: 'add_monitor',
      source: 'local',
      status: 'SCHEDULED',
      detail: `Monitoring "${result.topic.label}" every ${result.topic.intervalMinutes}m.`,
      verified: true,
    });
    res.status(result.duplicate ? 200 : 201).json({
      ...result,
      topics: monitorService.getTopics(),
      updates: monitorService.getUpdates(),
    });
  });

  app.patch('/api/monitors/:id', (req: Request, res: Response) => {
    const updated = monitorService.updateTopic(req.params.id, req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'Monitor topic not found.' });
      return;
    }
    res.json({
      topic: updated,
      topics: monitorService.getTopics(),
      updates: monitorService.getUpdates(),
    });
  });

  app.delete('/api/monitors/:id', (req: Request, res: Response) => {
    const deleted = monitorService.deleteTopic(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Monitor topic not found.' });
      return;
    }
    res.json({
      ok: true,
      topics: monitorService.getTopics(),
      updates: monitorService.getUpdates(),
    });
  });

  app.post('/api/monitors/:id/check', async (req: Request, res: Response) => {
    const out = await monitorService.checkTopic(req.params.id, false);
    res.json({
      ...out,
      topics: monitorService.getTopics(),
      updates: monitorService.getUpdates(),
    });
  });

  app.post('/api/monitors/pause-all', (_req: Request, res: Response) => {
    const pausedCount = monitorService.pauseAll();
    res.json({
      ok: true,
      pausedCount,
      topics: monitorService.getTopics(),
      updates: monitorService.getUpdates(),
    });
  });

  app.post('/api/monitors/resume-all', (_req: Request, res: Response) => {
    const resumedCount = monitorService.resumeAll();
    res.json({
      ok: true,
      resumedCount,
      topics: monitorService.getTopics(),
      updates: monitorService.getUpdates(),
    });
  });

  app.post('/api/monitors/official-only', (req: Request, res: Response) => {
    const flag = Boolean((req.body as { officialOnly?: boolean })?.officialOnly ?? true);
    monitorService.setAllOfficialOnly(flag);
    res.json({
      ok: true,
      officialOnly: flag,
      topics: monitorService.getTopics(),
      updates: monitorService.getUpdates(),
    });
  });

  // Real Browser Automation API (Playwright Server Engine)
  app.get('/api/browser/state', (_req: Request, res: Response) => {
    res.json({ snapshot: browserService.getSnapshot() });
  });

  app.post('/api/browser/execute', async (req: Request, res: Response) => {
    const out = await browserService.execute(req.body || {});
    scheduler.broadcastEvent('browser_state', { snapshot: out.snapshot });
    scheduler.addLog({
      command: `browser:${req.body?.action || 'action'}${req.body?.query ? `:${req.body.query}` : ''}`,
      intent: 'browser_automation',
      source: 'local',
      status: out.ok ? 'COMPLETED' : 'FAILED',
      detail: out.spokenMessage,
      verified: out.ok,
    });
    res.json(out);
  });

  app.post('/api/browser/abort', async (_req: Request, res: Response) => {
    const snapshot = await browserService.abort();
    scheduler.broadcastEvent('browser_state', { snapshot });
    res.json({ ok: true, snapshot });
  });

  // Incoming Call & Desktop Awareness Webhook / Sync Bridge
  app.post('/api/desktop-call/incoming', (req: Request, res: Response) => {
    const b = (req.body || {}) as {
      callerName?: string;
      callerNumber?: string;
      appSource?: string;
    };
    const event = {
      id: `call_${Date.now()}`,
      callerName: String(b.callerName || 'Unknown Caller').slice(0, 100),
      callerNumber: b.callerNumber ? String(b.callerNumber).slice(0, 40) : undefined,
      appSource: String(b.appSource || 'Phone Bridge').slice(0, 60),
      status: 'ringing' as const,
      isVip: false,
      receivedAt: new Date().toISOString(),
    };
    scheduler.broadcastEvent('incoming_call', { call: event });
    res.status(201).json({ ok: true, call: event });
  });

  // Persistent Alarms, Reminders & Timers API + SSE stream
  app.get('/api/schedules', (_req: Request, res: Response) => {
    res.json({
      items: scheduler.getSchedules(),
      pendingAlerts: scheduler.getPendingAlerts(),
      now: new Date().toISOString(),
    });
  });

  app.get('/api/schedules/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(
      `event: init\ndata: ${JSON.stringify({
        items: scheduler.getSchedules(),
        pendingAlerts: scheduler.getPendingAlerts(),
        quota: scheduler.getQuotaStatus(),
        monitors: monitorService.getTopics(),
        monitorUpdates: monitorService.getUpdates(),
        browserState: browserService.getSnapshot(),
      })}\n\n`
    );
    scheduler.addSseClient(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25000);
    req.on('close', () => clearInterval(keepAlive));
  });

  app.post('/api/schedules', (req: Request, res: Response) => {
    const body = req.body as {
      kind?: ScheduleKind;
      title?: string;
      triggerAt?: string;
      durationSeconds?: number;
      recurrence?: 'once' | 'daily';
      spokenMessage?: string;
    };
    const kind: ScheduleKind =
      body.kind === 'alarm' || body.kind === 'timer' ? body.kind : 'reminder';
    let triggerAt = body.triggerAt;
    if (!triggerAt && typeof body.durationSeconds === 'number') {
      triggerAt = new Date(Date.now() + Math.max(1, body.durationSeconds) * 1000).toISOString();
    }
    if (!triggerAt) {
      res.status(400).json({ error: 'triggerAt or durationSeconds is required.' });
      return;
    }

    const result = scheduler.createSchedule({
      kind,
      title: String(body.title || `${kind} alert`),
      triggerAt,
      durationSeconds: body.durationSeconds,
      recurrence: body.recurrence,
      spokenMessage: body.spokenMessage,
    });

    scheduler.addLog({
      command: `schedule:${kind}:${result.item.title}`,
      intent: 'create_schedule',
      source: 'local',
      status: 'SCHEDULED',
      detail: result.duplicate
        ? `Duplicate ${kind} prevented; keeping existing ${formatScheduledTimeLabel(result.item.triggerAt)}.`
        : `Scheduled ${kind} "${result.item.title}" for ${formatScheduledTimeLabel(result.item.triggerAt)}.`,
      verified: true,
    });

    res.status(result.duplicate ? 200 : 201).json(result);
  });

  app.patch('/api/schedules/:id', (req: Request, res: Response) => {
    const updated = scheduler.updateSchedule(req.params.id, req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'Scheduled item not found.' });
      return;
    }
    scheduler.addLog({
      command: `update_schedule:${updated.title}`,
      intent: 'update_schedule',
      source: 'local',
      status: 'COMPLETED',
      detail: `Updated ${updated.kind} "${updated.title}" (${updated.status}).`,
      verified: true,
    });
    res.json({ item: updated });
  });

  app.delete('/api/schedules/:id', (req: Request, res: Response) => {
    const removed = scheduler.deleteSchedule(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Scheduled item not found.' });
      return;
    }
    scheduler.addLog({
      command: `delete_schedule:${removed.title}`,
      intent: 'delete_schedule',
      source: 'local',
      status: 'COMPLETED',
      detail: `Removed ${removed.kind} "${removed.title}".`,
      verified: true,
    });
    res.json({ removed });
  });

  app.post('/api/schedules/alerts/:id/ack', (req: Request, res: Response) => {
    const acked = scheduler.ackAlert(req.params.id);
    res.json({ ok: acked });
  });

  app.get('/api/logs', (_req: Request, res: Response) => {
    res.json({ logs: scheduler.getLogs() });
  });

  app.post('/api/logs', (req: Request, res: Response) => {
    const b = req.body || {};
    const entry = scheduler.addLog({
      command: String(b.command || 'manual'),
      intent: String(b.intent || 'action'),
      source: b.source || 'local',
      status: b.status || 'COMPLETED',
      detail: String(b.detail || 'Executed.'),
      verified: b.verified !== false,
      durationMs: typeof b.durationMs === 'number' ? b.durationMs : undefined,
    });
    res.status(201).json({ entry });
  });

  app.delete('/api/logs', (_req: Request, res: Response) => {
    scheduler.clearLogs();
    res.json({ ok: true });
  });

  const openWebAppDeclaration: FunctionDeclaration = {
    name: 'open_web_app',
    description:
      'Open a website or web app such as YouTube, Google, GitHub, Spotify, Gmail, Calendar, Maps, Netflix, or any domain, optionally with a search query.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appOrSite: {
          type: Type.STRING,
          description:
            'Name of the app/site (e.g. YouTube, Spotify, GitHub, Google) or a URL/domain.',
        },
        searchQuery: {
          type: Type.STRING,
          description:
            'Optional query to search inside the app/site (e.g. lo-fi beats on YouTube).',
        },
      },
      required: ['appOrSite'],
    },
  };

  const computerControlDeclaration: FunctionDeclaration = {
    name: 'computer_control',
    description:
      'Execute a browser-native or Desktop Companion computer action: capture_screenshot, open_local_file, search_local_files, create_local_folder, system_info, companion_launch_app, companion_close_app, companion_media_control, companion_system_setting, companion_write_file, companion_read_file, companion_run_command.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description:
            'One of: capture_screenshot, open_local_file, search_local_files, create_local_folder, system_info, companion_launch_app, companion_close_app, companion_media_control, companion_system_setting, companion_write_file, companion_read_file, companion_run_command.',
        },
        target: {
          type: Type.STRING,
          description:
            'Target app name, folder/file name, media command (play/pause/next/previous), setting (volume), or safe command (date/whoami/uptime).',
        },
        value: {
          type: Type.STRING,
          description: 'Optional value such as volume level 0-100, note file text content, or search pattern.',
        },
      },
      required: ['action'],
    },
  };

  function resolveLaunchTarget(
    rawTarget: string,
    searchQuery?: string
  ): { name: string; url: string; searchQuery?: string } {
    return resolveWebTarget(rawTarget, searchQuery);
  }

  function executeUnifiedToolCall(
    name: string,
    args: Record<string, unknown>,
    state: AssistantState
  ): {
    result: Record<string, unknown>;
    scheduleCreated?: ReturnType<typeof scheduler.createSchedule>['item'];
  } {
    if (name === 'set_alarm') {
      const expr = String(args.timeExpression || '7 AM');
      const parsed = parseNaturalTimeExpression(`alarm ${expr}`);
      const triggerAt = parsed
        ? parsed.triggerAt.toISOString()
        : new Date(Date.now() + 60_000).toISOString();
      const title = String(args.title || 'Alarm').trim();
      const res = scheduler.createSchedule({
        kind: 'alarm',
        title,
        triggerAt,
        recurrence: Boolean(args.daily) || parsed?.recurrence === 'daily' ? 'daily' : 'once',
      });
      return {
        result: {
          status: res.duplicate ? 'duplicate_prevented' : 'scheduled',
          alarm: res.item,
          humanTime: formatScheduledTimeLabel(res.item.triggerAt),
        },
        scheduleCreated: res.item,
      };
    }

    if (name === 'create_reminder') {
      const expr = String(args.whenExpression || 'in 2 minutes');
      const parsed = parseNaturalTimeExpression(expr);
      const triggerAt = parsed
        ? parsed.triggerAt.toISOString()
        : new Date(Date.now() + 120_000).toISOString();
      const title = String(args.title || 'Reminder').trim();
      const res = scheduler.createSchedule({
        kind: 'reminder',
        title,
        triggerAt,
        durationSeconds: parsed?.durationSeconds,
        recurrence: parsed?.recurrence || 'once',
      });
      return {
        result: {
          status: res.duplicate ? 'duplicate_prevented' : 'scheduled',
          reminder: res.item,
          humanTime: formatScheduledTimeLabel(res.item.triggerAt),
        },
        scheduleCreated: res.item,
      };
    }

    if (name === 'set_timer') {
      const label = String(args.label || 'Focus Timer').trim();
      const mins = Number(args.minutes || 0);
      const secs = Number(args.seconds || 0);
      const totalSeconds = Math.max(5, Math.round(mins * 60 + secs) || 300);
      const toolRes = executeToolCall('set_timer', args, state);
      const schedRes = scheduler.createSchedule({
        kind: 'timer',
        title: label,
        triggerAt: new Date(Date.now() + totalSeconds * 1000).toISOString(),
        durationSeconds: totalSeconds,
      });
      return {
        result: { ...toolRes, persistentSchedule: schedRes.item },
        scheduleCreated: schedRes.item,
      };
    }

    if (name === 'list_schedules') {
      const kindArg = args.kind ? String(args.kind).toLowerCase() : 'all';
      const active = scheduler
        .getSchedules()
        .filter(
          (s) =>
            (s.status === 'scheduled' || s.status === 'snoozed') &&
            (kindArg === 'all' || s.kind === kindArg)
        );
      return {
        result: {
          status: 'ok',
          count: active.length,
          schedules: active.map((s) => ({
            id: s.id,
            kind: s.kind,
            title: s.title,
            when: formatScheduledTimeLabel(s.snoozedUntil || s.triggerAt),
            status: s.status,
          })),
        },
      };
    }

    if (name === 'cancel_schedule' || name === 'cancel_timer') {
      const kindArg = args.kind ? (String(args.kind).toLowerCase() as ScheduleKind) : undefined;
      const cancelled = scheduler.cancelByQuery(
        args.query ? String(args.query) : undefined,
        name === 'cancel_timer' ? 'timer' : kindArg
      );
      if (name === 'cancel_timer') {
        executeToolCall('cancel_timer', args, state);
      }
      return {
        result: {
          status: cancelled.length > 0 ? 'cancelled' : 'not_found',
          cancelledCount: cancelled.length,
          cancelled,
        },
      };
    }

    if (name === 'snooze_schedule') {
      const mins = Math.max(1, Number(args.minutes || 5));
      const snoozed = scheduler.snoozeByQuery(
        mins,
        args.query ? String(args.query) : undefined
      );
      return {
        result: snoozed
          ? {
              status: 'snoozed',
              item: snoozed,
              nextTime: formatScheduledTimeLabel(snoozed.triggerAt),
            }
          : { status: 'not_found' },
      };
    }

    return { result: executeToolCall(name, args, state) };
  }

  app.post('/api/assistant/chat', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        messages?: ChatMessageInput[];
        state?: AssistantState;
        imageBase64?: string;
        config?: {
          personaPrompt?: string;
          enabledTools?: string[];
          aiMode?: string;
          memoryEnabled?: boolean;
        };
      };

      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (messages.length === 0) {
        res.status(400).json({ error: 'At least one user message is required.' });
        return;
      }

      const workingState: AssistantState = JSON.parse(
        JSON.stringify(
          body.state || {
            tasks: [],
            timers: [],
            memory: [],
            environment: {
              lightBrightness: 75,
              lightTemperature: 'daylight',
              thermostatCelsius: 21,
              focusMode: false,
            },
            searchHistory: [],
          }
        )
      ) as AssistantState;

      const enabledTools = Array.isArray(body.config?.enabledTools)
        ? body.config!.enabledTools
        : ['tasks', 'timers', 'memory', 'environment', 'search', 'computer'];

      const memoryEnabled = body.config?.memoryEnabled !== false;
      const modeSpec = resolveAiModeConfig(body.config?.aiMode);
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.text || '';

      // 1. Deterministic Local Command Router (executes reliably even at 0 Gemini quota!)
      const localCmd = !body.imageBase64 ? parseLocalCommand(lastUserMessage) : null;
      if (localCmd) {
        if (localCmd.type === 'stop_speaking') {
          const logEntry = scheduler.addLog({
            command: lastUserMessage,
            intent: 'stop_speaking',
            source: 'local',
            status: 'COMPLETED',
            detail: 'Stopped speech playback.',
            verified: true,
          });
          res.json({
            reply: 'Stopping speech.',
            updatedState: workingState,
            trace: [],
            localHandled: true,
            stopSpeaking: true,
            executionLog: logEntry,
            schedules: scheduler.getSchedules(),
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: [],
            groundingSources: [],
          });
          return;
        }

        if (localCmd.type === 'create_schedule') {
          const created = scheduler.createSchedule({
            kind: localCmd.kind,
            title: localCmd.title,
            triggerAt: localCmd.triggerAtIso,
            durationSeconds: localCmd.durationSeconds,
            recurrence: localCmd.recurrence,
          });
          if (localCmd.kind === 'timer' && localCmd.durationSeconds) {
            workingState.timers.unshift({
              id: created.item.id,
              label: created.item.title,
              durationSeconds: localCmd.durationSeconds,
              remainingSeconds: localCmd.durationSeconds,
              running: true,
              createdAt: created.item.createdAt,
            });
          }
          const replyMsg = created.duplicate
            ? `You already have an active ${localCmd.kind} set for ${formatScheduledTimeLabel(created.item.triggerAt)}.`
            : localCmd.spokenConfirmation;
          const logEntry = scheduler.addLog({
            command: lastUserMessage,
            intent: `create_${localCmd.kind}`,
            source: 'local',
            status: 'SCHEDULED',
            detail: replyMsg,
            verified: true,
          });
          res.json({
            reply: replyMsg,
            updatedState: workingState,
            trace: [
              {
                id: `trace_loc_${Date.now()}`,
                toolName: `schedule_${localCmd.kind}`,
                args: { title: created.item.title, triggerAt: created.item.triggerAt },
                result: { status: created.duplicate ? 'duplicate_prevented' : 'scheduled', item: created.item },
                durationMs: 2,
              },
            ],
            scheduledItem: created.item,
            schedules: scheduler.getSchedules(),
            executionLog: logEntry,
            localHandled: true,
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: [],
            groundingSources: [],
          });
          return;
        }

        if (localCmd.type === 'list_schedules') {
          const active = scheduler
            .getSchedules()
            .filter(
              (s) =>
                (s.status === 'scheduled' || s.status === 'snoozed') &&
                (!localCmd.kind || s.kind === localCmd.kind)
            );
          const replyMsg =
            active.length === 0
              ? `You have no active ${localCmd.kind ? `${localCmd.kind}s` : 'alarms, timers, or reminders'} scheduled.`
              : `You have ${active.length} active schedule${active.length === 1 ? '' : 's'}: ${active
                  .slice(0, 4)
                  .map((s) => `${s.kind} "${s.title}" (${formatScheduledTimeLabel(s.snoozedUntil || s.triggerAt)})`)
                  .join('; ')}.`;
          const logEntry = scheduler.addLog({
            command: lastUserMessage,
            intent: 'list_schedules',
            source: 'local',
            status: 'COMPLETED',
            detail: replyMsg,
            verified: true,
          });
          res.json({
            reply: replyMsg,
            updatedState: workingState,
            trace: [],
            schedules: scheduler.getSchedules(),
            executionLog: logEntry,
            localHandled: true,
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: [],
            groundingSources: [],
          });
          return;
        }

        if (localCmd.type === 'cancel_schedule') {
          const cancelled = scheduler.cancelByQuery(localCmd.query, localCmd.kind);
          const replyMsg =
            cancelled.length > 0
              ? `Cancelled ${cancelled.map((c) => `${c.kind} "${c.title}"`).join(', ')}.`
              : `I could not find any matching active ${localCmd.kind || 'schedule'} to cancel.`;
          const logEntry = scheduler.addLog({
            command: lastUserMessage,
            intent: 'cancel_schedule',
            source: 'local',
            status: cancelled.length > 0 ? 'COMPLETED' : 'FAILED',
            detail: replyMsg,
            verified: cancelled.length > 0,
          });
          res.json({
            reply: replyMsg,
            updatedState: workingState,
            trace: [],
            schedules: scheduler.getSchedules(),
            executionLog: logEntry,
            localHandled: true,
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: [],
            groundingSources: [],
          });
          return;
        }

        if (localCmd.type === 'snooze_schedule') {
          const snoozed = scheduler.snoozeByQuery(localCmd.minutes, localCmd.query);
          const replyMsg = snoozed
            ? `Snoozed "${snoozed.title}" for ${localCmd.minutes} minutes until ${formatScheduledTimeLabel(snoozed.triggerAt)}.`
            : 'No active or recent alarm or reminder found to snooze.';
          const logEntry = scheduler.addLog({
            command: lastUserMessage,
            intent: 'snooze_schedule',
            source: 'local',
            status: snoozed ? 'SCHEDULED' : 'FAILED',
            detail: replyMsg,
            verified: Boolean(snoozed),
          });
          res.json({
            reply: replyMsg,
            updatedState: workingState,
            trace: [],
            scheduledItem: snoozed || undefined,
            schedules: scheduler.getSchedules(),
            executionLog: logEntry,
            localHandled: true,
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: [],
            groundingSources: [],
          });
          return;
        }

        if (localCmd.type === 'environment') {
          workingState.environment = { ...workingState.environment, ...localCmd.patch };
          const logEntry = scheduler.addLog({
            command: lastUserMessage,
            intent: 'environment_control',
            source: 'local',
            status: 'COMPLETED',
            detail: localCmd.spokenConfirmation,
            verified: true,
          });
          res.json({
            reply: localCmd.spokenConfirmation,
            updatedState: workingState,
            trace: [
              {
                id: `trace_env_${Date.now()}`,
                toolName: 'environment_control',
                args: localCmd.patch,
                result: { status: 'applied', environment: workingState.environment },
                durationMs: 1,
              },
            ],
            executionLog: logEntry,
            localHandled: true,
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: [],
            groundingSources: [],
          });
          return;
        }

        if (localCmd.type === 'time_query') {
          const now = new Date();
          const replyMsg = `It is ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} on ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, Sir.`;
          const logEntry = scheduler.addLog({
            command: lastUserMessage,
            intent: 'time_query',
            source: 'local',
            status: 'COMPLETED',
            detail: replyMsg,
            verified: true,
          });
          res.json({
            reply: replyMsg,
            updatedState: workingState,
            trace: [],
            executionLog: logEntry,
            localHandled: true,
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: [],
            groundingSources: [],
          });
          return;
        }

        if (localCmd.type === 'list_tasks') {
          const filtered = workingState.tasks.filter((t) =>
            localCmd.filter === 'completed'
              ? t.completed
              : localCmd.filter === 'all'
              ? true
              : !t.completed
          );
          const replyMsg =
            filtered.length === 0
              ? `You have no ${localCmd.filter || 'pending'} tasks right now, Sir.`
              : `You have ${filtered.length} ${localCmd.filter || 'pending'} task${filtered.length === 1 ? '' : 's'}, Sir: ${filtered
                  .slice(0, 5)
                  .map((t) => t.title)
                  .join('; ')}.`;
          const logEntry = scheduler.addLog({
            command: lastUserMessage,
            intent: 'list_tasks',
            source: 'local',
            status: 'COMPLETED',
            detail: replyMsg,
            verified: true,
          });
          res.json({
            reply: replyMsg,
            updatedState: workingState,
            trace: [],
            executionLog: logEntry,
            localHandled: true,
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: [],
            groundingSources: [],
          });
          return;
        }

        if (localCmd.type === 'add_task') {
          const created = executeToolCall(
            'create_task',
            { title: localCmd.title, priority: localCmd.priority || 'medium' },
            workingState
          );
          const replyMsg = `Added task "${localCmd.title}" to your list, Sir.`;
          const logEntry = scheduler.addLog({
            command: lastUserMessage,
            intent: 'create_task',
            source: 'local',
            status: 'COMPLETED',
            detail: replyMsg,
            verified: true,
          });
          res.json({
            reply: replyMsg,
            updatedState: workingState,
            trace: [{ id: `trace_task_${Date.now()}`, toolName: 'create_task', args: { title: localCmd.title }, result: created, durationMs: 2 }],
            executionLog: logEntry,
            localHandled: true,
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: [],
            groundingSources: [],
          });
          return;
        }

        if (localCmd.type === 'complete_task') {
          const resTask = executeToolCall('complete_task', { query: localCmd.query, completed: true }, workingState);
          const found = resTask.status === 'updated';
          const replyMsg = found
            ? `Marked "${(resTask.task as TaskItem).title}" as completed, Sir.`
            : `I could not find a task matching "${localCmd.query}", Sir.`;
          const logEntry = scheduler.addLog({
            command: lastUserMessage,
            intent: 'complete_task',
            source: 'local',
            status: found ? 'COMPLETED' : 'FAILED',
            detail: replyMsg,
            verified: found,
          });
          res.json({
            reply: replyMsg,
            updatedState: workingState,
            trace: [{ id: `trace_task_${Date.now()}`, toolName: 'complete_task', args: { query: localCmd.query }, result: resTask, durationMs: 2 }],
            executionLog: logEntry,
            localHandled: true,
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: [],
            groundingSources: [],
          });
          return;
        }

        if (localCmd.type === 'open_web') {
          const logEntry = scheduler.addLog({
            command: lastUserMessage,
            intent: 'open_web_app',
            source: 'local',
            status: 'COMPLETED',
            detail: `Prepared launch for ${localCmd.name} (${localCmd.url}).`,
            verified: true,
          });
          res.json({
            reply: `Opening ${localCmd.name} for you, Sir.`,
            updatedState: workingState,
            trace: [
              {
                id: `trace_web_${Date.now()}`,
                toolName: 'open_web_app',
                args: { appOrSite: localCmd.name, searchQuery: localCmd.searchQuery },
                result: { status: 'launch_triggered', name: localCmd.name, url: localCmd.url },
                durationMs: 2,
              },
            ],
            launchTarget: {
              name: localCmd.name,
              url: localCmd.url,
              searchQuery: localCmd.searchQuery,
            },
            executionLog: logEntry,
            localHandled: true,
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: [],
            groundingSources: [],
          });
          return;
        }

        if (localCmd.type === 'computer_action') {
          const logEntry = scheduler.addLog({
            command: lastUserMessage,
            intent: localCmd.action,
            source: 'local',
            status: 'EXECUTING',
            detail: `Dispatched ${localCmd.label} to browser / Desktop Companion.`,
            verified: false,
          });
          res.json({
            reply: localCmd.requiresConfirmation
              ? `Confirmation card is ready on screen for ${localCmd.label}, Sir.`
              : `Executing ${localCmd.label}, Sir.`,
            updatedState: workingState,
            trace: [
              {
                id: `trace_pc_${Date.now()}`,
                toolName: 'computer_control',
                args: { action: localCmd.action, target: localCmd.target, value: localCmd.value },
                result: { status: 'dispatched' },
                durationMs: 2,
              },
            ],
            computerActions: [
              {
                action: localCmd.action,
                target: localCmd.target,
                value: localCmd.value || '',
                subAction: localCmd.subAction,
                x: localCmd.x,
                y: localCmd.y,
                keys: localCmd.keys,
                requiresConfirmation: localCmd.requiresConfirmation,
                callId: `cmp_loc_${Date.now()}`,
              },
            ],
            executionLog: logEntry,
            localHandled: true,
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: [],
            groundingSources: [],
          });
          return;
        }
      }

      // Check deduplication / active Gemini quota cooldown BEFORE hitting Gemini API
      const quotaNow = scheduler.getQuotaStatus();
      if (quotaNow.limited) {
        res.status(429).json({
          error: quotaNow.lastError || `Gemini API cooldown active (${quotaNow.retryAfterSeconds}s remaining).`,
          quotaLimited: true,
          retryAfterSeconds: quotaNow.retryAfterSeconds,
          cooldownUntil: quotaNow.cooldownUntil,
        });
        return;
      }

      if (!body.imageBase64 && scheduler.isDuplicatePrompt(`chat:${lastUserMessage.toLowerCase()}`, 1200)) {
        res.status(429).json({
          error: 'Duplicate voice command throttled to protect Gemini quota.',
          retryAfterSeconds: 2,
        });
        return;
      }

      const ai = getAiClient();

      const personaPrompt =
        body.config?.personaPrompt ||
        'You are J.A.R.V.I.S., a calm, articulate, concise personal AI assistant. Address requests efficiently and accurately.';

      const functionDeclarations: FunctionDeclaration[] = [];
      for (const group of enabledTools) {
        if (group === 'memory' && !memoryEnabled) continue;
        if (TOOL_DECLARATIONS[group]) {
          functionDeclarations.push(...TOOL_DECLARATIONS[group]);
        }
      }
      functionDeclarations.push(openWebAppDeclaration);
      if (enabledTools.includes('computer')) {
        functionDeclarations.push(computerControlDeclaration);
      }

      const useSearch = enabledTools.includes('search');
      const tools: Tool[] = [];
      if (useSearch) {
        tools.push({ googleSearch: {} });
      }
      if (functionDeclarations.length > 0) {
        tools.push({ functionDeclarations });
      }

      const contents: Content[] = messages.slice(-14).map((m, idx, arr) => {
        const parts: Part[] = [{ text: m.text }];
        if (idx === arr.length - 1 && m.role === 'user' && body.imageBase64) {
          const cleanB64 = body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
          parts.unshift({
            inlineData: {
              mimeType: 'image/png',
              data: cleanB64,
            },
          });
        }
        return {
          role: m.role === 'model' ? 'model' : 'user',
          parts,
        };
      });

      const { systemInstruction, injectedMemoryKeys } = buildContextPrompt(
        personaPrompt,
        workingState,
        enabledTools,
        memoryEnabled,
        modeSpec.directive
      );

      const trace: ToolTraceItem[] = [];
      const groundingSourcesMap = new Map<string, { title: string; uri: string }>();
      let launchTarget: { name: string; url: string; searchQuery?: string } | undefined;
      const memoryProposals: Array<{
        id: string;
        key: string;
        value: string;
        category: MemoryCategory;
        createdAt: string;
      }> = [];
      const computerActions: Array<{
        action: string;
        target: string;
        value: string;
        requiresConfirmation: boolean;
        callId: string;
      }> = [];

      const buildConfig = () => {
        const configObj: Record<string, unknown> = {
          systemInstruction,
          thinkingConfig: { thinkingLevel: modeSpec.restThinkingLevel },
        };
        if (tools.length > 0) {
          configObj.tools = tools;
        }
        if (useSearch && functionDeclarations.length > 0) {
          configObj.toolConfig = { includeServerSideToolInvocations: true };
        }
        return configObj;
      };

      const deterministicIntent = parseLocalCommand(lastUserMessage);

      let finalResponse;
      try {
        finalResponse = await generateContentWithRetry(ai, scheduler, {
          model: modeSpec.restModel,
          contents,
          config: buildConfig(),
        });
      } catch (primaryErr) {
        // Deterministic safety net if upstream model encounters quota/capacity issues
        if (deterministicIntent?.type === 'open_web') {
          res.json({
            reply: `Opening ${deterministicIntent.name} for you.`,
            updatedState: workingState,
            trace: [
              {
                id: `trace_det_${Date.now()}`,
                toolName: 'open_web_app',
                args: { appOrSite: deterministicIntent.name },
                result: {
                  status: 'launch_triggered',
                  name: deterministicIntent.name,
                  url: deterministicIntent.url,
                },
                durationMs: 2,
              },
            ],
            launchTarget: {
              name: deterministicIntent.name,
              url: deterministicIntent.url,
              searchQuery: deterministicIntent.searchQuery,
            },
            memoryProposals,
            computerActions,
            schedules: scheduler.getSchedules(),
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: injectedMemoryKeys,
            groundingSources: [],
          });
          return;
        }
        if (deterministicIntent?.type === 'computer_action') {
          res.json({
            reply: `I prepared the confirmation card on your screen for ${deterministicIntent.label}.`,
            updatedState: workingState,
            trace: [],
            memoryProposals,
            computerActions: [
              {
                action: deterministicIntent.action,
                target: deterministicIntent.target,
                value: deterministicIntent.value || '',
                requiresConfirmation: deterministicIntent.requiresConfirmation,
                callId: `cmp_det_${Date.now()}`,
              },
            ],
            schedules: scheduler.getSchedules(),
            quotaStatus: scheduler.getQuotaStatus(),
            aiMode: modeSpec.mode,
            memoriesUsed: injectedMemoryKeys,
            groundingSources: [],
          });
          return;
        }
        throw primaryErr;
      }

      let loopCount = 0;
      while (
        finalResponse.functionCalls &&
        finalResponse.functionCalls.length > 0 &&
        loopCount < 4
      ) {
        loopCount += 1;
        const modelContent = finalResponse.candidates?.[0]?.content;
        if (modelContent) {
          contents.push(modelContent);
        }

        const functionResponseParts: Part[] = [];
        for (const call of finalResponse.functionCalls) {
          const startedAt = Date.now();
          const args = (call.args || {}) as Record<string, unknown>;
          let result: Record<string, unknown>;

          if (call.name === 'open_web_app') {
            const target = resolveLaunchTarget(
              String(args.appOrSite || 'YouTube'),
              args.searchQuery ? String(args.searchQuery) : undefined
            );
            launchTarget = target;
            result = {
              status: 'launch_triggered',
              name: target.name,
              url: target.url,
              note: 'Direct launch attempted and clickable launch card displayed on screen.',
            };
          } else if (call.name === 'remember_fact') {
            if (!memoryEnabled) {
              result = {
                status: 'disabled',
                note: 'Personal Memory Vault is currently disabled by user settings.',
              };
            } else {
              const rawCat = String(args.category || 'note').toLowerCase() as MemoryCategory;
              const proposal = {
                id: `mem_prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                key: String(args.key || 'note')
                  .trim()
                  .toLowerCase()
                  .replace(/\s+/g, '_')
                  .slice(0, 120),
                value: String(args.value || '').trim().slice(0, 2000),
                category: VALID_MEM_CATS.has(rawCat) ? rawCat : 'note',
                createdAt: new Date().toISOString(),
              };
              memoryProposals.push(proposal);
              result = {
                status: 'pending_user_approval',
                proposal,
                note: 'Displayed memory approval card on screen so the user can approve saving permanently.',
              };
            }
          } else if (call.name === 'computer_control') {
            const action = String(args.action || 'system_info').trim();
            const target = args.target ? String(args.target).trim() : '';
            const value = args.value ? String(args.value).trim() : '';
            const sensitive =
              action === 'create_local_folder' ||
              action === 'capture_screenshot' ||
              action === 'companion_launch_app' ||
              action === 'companion_close_app' ||
              action === 'companion_media_control' ||
              action === 'companion_system_setting' ||
              action === 'companion_write_file' ||
              action === 'companion_run_command';
            computerActions.push({
              action,
              target,
              value,
              requiresConfirmation: sensitive,
              callId: call.id || `cmp_${Date.now()}`,
            });
            result = sensitive
              ? {
                  status: 'confirmation_required',
                  action,
                  target,
                  note: 'Awaiting explicit user confirmation on screen before executing computer control.',
                }
              : {
                  status: 'dispatched_to_browser',
                  action,
                  target,
                  note: 'Triggered browser inspection / file picker on client HUD.',
                };
          } else {
            const unified = executeUnifiedToolCall(
              call.name || '',
              args,
              workingState
            );
            result = unified.result;
          }

          const durationMs = Math.max(1, Date.now() - startedAt);

          trace.push({
            id: call.id || `trace_${Date.now()}_${trace.length}`,
            toolName: call.name || 'unknown_tool',
            args,
            result,
            durationMs,
          });

          scheduler.addLog({
            command: lastUserMessage || call.name || 'tool_call',
            intent: call.name || 'tool_call',
            source: 'brain',
            status:
              result.status === 'not_found' || result.status === 'error'
                ? 'FAILED'
                : result.status === 'scheduled'
                ? 'SCHEDULED'
                : 'COMPLETED',
            detail: `${call.name}: ${JSON.stringify(result).slice(0, 180)}`,
            verified: result.status !== 'not_found' && result.status !== 'error',
          });

          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name || '',
              response: result,
            },
          });
        }

        contents.push({
          role: 'user',
          parts: functionResponseParts,
        });

        try {
          finalResponse = await generateContentWithRetry(ai, scheduler, {
            model: modeSpec.restModel,
            contents,
            config: buildConfig(),
          });
        } catch (loopErr) {
          if (launchTarget || trace.length > 0) {
            break;
          }
          throw loopErr;
        }
      }

      // Deterministic safety net if user requested opening a site/app but model replied without calling tool
      if (!launchTarget && deterministicIntent?.type === 'open_web') {
        launchTarget = {
          name: deterministicIntent.name,
          url: deterministicIntent.url,
          searchQuery: deterministicIntent.searchQuery,
        };
      } else if (
        computerActions.length === 0 &&
        deterministicIntent?.type === 'computer_action'
      ) {
        computerActions.push({
          action: deterministicIntent.action,
          target: deterministicIntent.target,
          value: deterministicIntent.value || '',
          requiresConfirmation: deterministicIntent.requiresConfirmation,
          callId: `cmp_det_${Date.now()}`,
        });
      }

      const chunks = finalResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks)) {
        for (const chunk of chunks) {
          const web = (chunk as { web?: { uri?: string; title?: string } }).web;
          if (web?.uri) {
            groundingSourcesMap.set(web.uri, {
              title: web.title || web.uri,
              uri: web.uri,
            });
          }
        }
      }

      const replyText =
        finalResponse.text?.trim() ||
        (launchTarget
          ? `Opening ${launchTarget.name} for you.`
          : trace.length > 0
          ? 'Completed the requested workspace actions.'
          : 'I could not generate a response for that request.');

      res.json({
        reply: replyText,
        updatedState: workingState,
        trace,
        launchTarget,
        memoryProposals,
        computerActions,
        schedules: scheduler.getSchedules(),
        quotaStatus: scheduler.getQuotaStatus(),
        aiMode: modeSpec.mode,
        memoriesUsed: injectedMemoryKeys,
        groundingSources: Array.from(groundingSourcesMap.values()),
      });
    } catch (err) {
      const info = extractApiError(err);
      res.status(info.status).json({
        error: info.message,
        quotaLimited: info.quotaLimited,
        retryAfterSeconds: info.retryAfterSeconds,
        quotaStatus: scheduler.getQuotaStatus(),
      });
    }
  });

  app.post('/api/assistant/transcribe', async (req: Request, res: Response) => {
    try {
      const quotaNow = scheduler.getQuotaStatus();
      if (quotaNow.limited) {
        res.status(429).json({
          error:
            quotaNow.lastError ||
            `Gemini API cooldown active (${quotaNow.retryAfterSeconds}s remaining).`,
          quotaLimited: true,
          retryAfterSeconds: quotaNow.retryAfterSeconds,
        });
        return;
      }

      const ai = getAiClient();
      const body = req.body as { audioBase64?: string; mimeType?: string };
      const rawAudio = String(body.audioBase64 || '').trim();
      if (!rawAudio) {
        res.status(400).json({ error: 'Audio payload is required for transcription.' });
        return;
      }

      const cleanAudio = rawAudio.replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, '');
      const allowedMimes = new Set([
        'audio/webm',
        'audio/ogg',
        'audio/mp4',
        'audio/wav',
        'audio/mp3',
        'audio/mpeg',
      ]);
      const baseMime = String(body.mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
      const mimeType = allowedMimes.has(baseMime) ? baseMime : 'audio/webm';

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanAudio,
              },
            },
            {
              text: 'Transcribe this spoken user command cleanly. Return only the spoken words.',
            },
          ],
        },
      });

      scheduler.resetQuotaOnSuccess('gemini-3.5-transcribe');
      res.json({
        transcript: (response.text || '').trim(),
      });
    } catch (err) {
      scheduler.recordGeminiError(err, 'gemini-3.5-transcribe');
      const info = extractApiError(err);
      res.status(info.status).json({
        error: info.message,
        quotaLimited: info.quotaLimited,
        retryAfterSeconds: info.retryAfterSeconds,
      });
    }
  });

  app.post('/api/assistant/tts', async (req: Request, res: Response) => {
    let ttsModel = 'gemini-3.8-flash-lite-tts';
    try {
      const quotaNow = scheduler.getQuotaStatus();
      if (quotaNow.limited) {
        res.status(429).json({
          error:
            quotaNow.lastError ||
            `Gemini API cooldown active (${quotaNow.retryAfterSeconds}s remaining).`,
          quotaLimited: true,
          retryAfterSeconds: quotaNow.retryAfterSeconds,
        });
        return;
      }

      const ai = getAiClient();
      const body = req.body as {
        text?: string;
        voiceName?: string;
        style?: string;
        mood?: string;
        language?: string;
        useVoiceDesign?: boolean;
      };
      const rawText = String(body.text || '').trim();
      if (!rawText) {
        res.status(400).json({ error: 'Text is required for speech synthesis.' });
        return;
      }

      const spokenText = rawText
        .replace(/```[\s\S]*?```/g, 'Code snippet omitted.')
        .replace(/[*_`#>]/g, '')
        .slice(0, 900);

      const allowedVoices = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
      const voiceName =
        body.voiceName && allowedVoices.has(body.voiceName) ? body.voiceName : 'Charon';

      const moodHints: Record<string, string> = {
        sad: 'Speak softly, gently, and empathetically with a comforting reassuring warmth.',
        angry: 'Keep a steady, respectful, grounding calm poise.',
        excited: 'Speak with genuine crisp enthusiasm and bright positive energy.',
        proud: 'Speak with warm appreciative pride and composed confidence.',
        serious: 'Speak with clear, measured, focused authority.',
        greeting: 'Speak warmly and courteously like a trusted British aide welcoming Hasan.',
      };
      const moodNote = body.mood && moodHints[body.mood] ? ` ${moodHints[body.mood]}` : '';
      const langNote = body.language === 'bn-BD' ? ' Pronounce Bangla and Banglish phrases naturally and clearly.' : '';

      const baseStyle =
        String(body.style || '').trim().slice(0, 220) ||
        'Soft, calm, emotionally expressive mature young-adult male British-English butler voice addressing Hasan respectfully as Sir, paced naturally around 0.95x speed.';

      const stylePrompt = `${baseStyle}${moodNote}${langNote}`.slice(0, 340);

      ttsModel = body.useVoiceDesign
        ? 'gemini-3.8-flash-tts'
        : 'gemini-3.8-flash-lite-tts';

      const response = await ai.models.generateContent({
        model: ttsModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: spokenText,
                speechMetadata: {
                  style: stylePrompt,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'TTS model returned no audio payload.' });
        return;
      }

      scheduler.resetQuotaOnSuccess(ttsModel);
      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        model: ttsModel,
      });
    } catch (err) {
      scheduler.recordGeminiError(err, ttsModel);
      const info = extractApiError(err);
      res.status(info.status).json({
        error: info.message,
        quotaLimited: info.quotaLimited,
        retryAfterSeconds: info.retryAfterSeconds,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/api/live' });

  const webSearchDeclaration: FunctionDeclaration = {
    name: 'web_search',
    description:
      'Search the live web for up-to-date facts, news, weather, prices, or current technical documentation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Concise search query.',
        },
      },
      required: ['query'],
    },
  };

  // openWebAppDeclaration, computerControlDeclaration & resolveLaunchTarget hoisted above routes

  async function runLiveWebSearch(
    ai: GoogleGenAI,
    query: string
  ): Promise<Record<string, unknown>> {
    try {
      const searchRes = await generateContentWithRetry(ai, scheduler, {
        model: 'gemini-4-hydrogen',
        contents: `Provide a concise, factual summary (2-3 sentences max) answering: ${query}`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      const chunks = searchRes.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = Array.isArray(chunks)
        ? chunks
            .map((c) => (c as { web?: { title?: string; uri?: string } }).web)
            .filter((w): w is { title?: string; uri: string } => Boolean(w?.uri))
            .slice(0, 3)
            .map((w) => w.title || w.uri)
        : [];
      return {
        status: 'ok',
        summary: searchRes.text?.trim() || 'No search summary found.',
        sources,
      };
    } catch (err) {
      return {
        status: 'error',
        error: err instanceof Error ? err.message : 'Web search failed.',
      };
    }
  }

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Session | null = null;
    let isConnectingLive = false;
    let workingState: AssistantState | null = null;
    let isClosing = false;
    let memoryEnabledFlag = true;
    const pendingAudioQueue: string[] = [];
    const pendingTextQueue: string[] = [];
    let currentUserTurnText = '';
    let turnDispatchedAction = false;

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const formatToolProgressLabel = (
      toolName: string,
      args: Record<string, unknown>
    ): string => {
      switch (toolName) {
        case 'web_search':
          return `Searching the web for ${String(args.query || 'information')}...`;
        case 'open_web_app':
          return `Opening ${String(args.appOrSite || 'app')}...`;
        case 'create_task':
          return `Adding task: ${String(args.title || 'new task')}...`;
        case 'complete_task':
          return `Updating task status...`;
        case 'delete_task':
          return `Removing task...`;
        case 'set_timer':
          return `Starting ${String(args.label || 'timer')}...`;
        case 'set_alarm':
          return `Setting persistent alarm for ${String(args.timeExpression || 'requested time')}...`;
        case 'create_reminder':
          return `Scheduling persistent reminder: ${String(args.title || 'reminder')}...`;
        case 'list_schedules':
          return `Checking active alarms and reminders...`;
        case 'cancel_schedule':
        case 'cancel_timer':
          return `Cancelling schedule...`;
        case 'snooze_schedule':
          return `Snoozing schedule...`;
        case 'remember_fact':
          return `Preparing memory note for ${String(args.key || 'vault')}...`;
        case 'forget_fact':
          return `Updating memory vault...`;
        case 'set_room_lighting':
        case 'set_thermostat':
        case 'toggle_focus_mode':
          return `Adjusting workspace environment...`;
        case 'computer_control':
          return `Preparing computer control: ${String(args.action || 'action')}...`;
        default:
          return `Running ${toolName}...`;
      }
    };

    clientWs.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type?: string;
          data?: string;
          text?: string;
          state?: AssistantState;
          config?: {
            personaPrompt?: string;
            voiceName?: string;
            agentVoiceStyle?: string;
            aiMode?: string;
            memoryEnabled?: boolean;
            enabledTools?: string[];
          };
          initialPrompt?: string;
        };

        if (msg.type === 'init') {
          if (liveSession || isConnectingLive) return;
          const quotaNow = scheduler.getQuotaStatus();
          if (quotaNow.limited) {
            safeSend({
              type: 'error',
              fallbackRecommended: true,
              quotaLimited: true,
              retryAfterSeconds: quotaNow.retryAfterSeconds,
              error:
                quotaNow.lastError ||
                `Gemini Live paused for quota cooldown (${quotaNow.retryAfterSeconds}s). Using local & Agent Voice fallback.`,
            });
            return;
          }
          isConnectingLive = true;
          const ai = getAiClient();

          workingState = JSON.parse(
            JSON.stringify(
              msg.state || {
                tasks: [],
                timers: [],
                memory: [],
                environment: {
                  lightBrightness: 75,
                  lightTemperature: 'daylight',
                  thermostatCelsius: 21,
                  focusMode: false,
                },
                searchHistory: [],
              }
            )
          ) as AssistantState;

          memoryEnabledFlag = msg.config?.memoryEnabled !== false;
          const modeSpec = resolveAiModeConfig(msg.config?.aiMode);

          const enabledTools = Array.isArray(msg.config?.enabledTools)
            ? msg.config!.enabledTools
            : ['tasks', 'timers', 'memory', 'environment', 'search', 'computer'];

          const declarations: FunctionDeclaration[] = [];
          // Always declare interactive workspace & launch tools synchronously (blocking)
          // across all modes so extended thinking never finishes or errors ahead of tool dispatch.
          const pushDecl = (decl: FunctionDeclaration) => {
            declarations.push({ ...decl });
          };

          for (const group of enabledTools) {
            if (group === 'memory' && !memoryEnabledFlag) continue;
            if (TOOL_DECLARATIONS[group]) {
              for (const decl of TOOL_DECLARATIONS[group]) {
                pushDecl(decl);
              }
            }
          }
          if (enabledTools.includes('search')) {
            pushDecl(webSearchDeclaration);
          }
          pushDecl(openWebAppDeclaration);
          if (enabledTools.includes('computer')) {
            pushDecl(computerControlDeclaration);
          }

          const allowedVoices = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
          const voiceName =
            msg.config?.voiceName && allowedVoices.has(msg.config.voiceName)
              ? msg.config.voiceName
              : 'Charon';

          const voiceStyle = String(msg.config?.agentVoiceStyle || '').trim();
          const personaPrompt =
            msg.config?.personaPrompt ||
            'You are August (J.A.R.V.I.S.), Hasan Ahmed’s soft-spoken, emotionally perceptive British-English personal AI aide. Address Hasan naturally and warmly as Sir, respond in plain spoken sentences with zero markdown syntax, and match Bangla or Banglish fluently whenever Hasan speaks it.';

          const { systemInstruction: baseInstruction, injectedMemoryKeys } = buildContextPrompt(
            personaPrompt,
            workingState,
            enabledTools,
            memoryEnabledFlag,
            modeSpec.directive
          );

          const systemInstruction = `${baseInstruction}

Voice-First Delivery Rules:
- You are communicating strictly by real-time voice.${
            voiceStyle ? ` Adopt this agent vocal style: ${voiceStyle}.` : ''
          } Keep replies crisp, emotionally nuanced, warm, and conversational (1-3 short sentences unless asked for detail).
- Address Hasan respectfully as "Sir" naturally without sounding robotic.
- Never read markdown symbols (no asterisks, backticks, or hashtags) aloud.
- Confirm tool actions naturally in speech once they complete.
- When the user asks to open YouTube or any website/app, immediately invoke open_web_app and confirm aloud.
- For sensitive computer controls (creating local folders, capturing screenshots, desktop app/media/volume settings), invoke computer_control and inform the user that a confirmation prompt is on screen.`;

          const liveConfig: Record<string, unknown> = {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            tools: declarations.length > 0 ? [{ functionDeclarations: declarations }] : undefined,
            systemInstruction,
          };

          if (modeSpec.useExtendedLive && modeSpec.liveThinkingLevel) {
            liveConfig.thinkingConfig = { thinkingLevel: modeSpec.liveThinkingLevel };
          }

          liveSession = await ai.live.connect({
            model: modeSpec.liveModel,
            config: liveConfig,
            callbacks: {
              onopen: () => {
                safeSend({
                  type: 'ready',
                  aiMode: modeSpec.mode,
                  liveModel: modeSpec.liveModel,
                  memoriesUsed: injectedMemoryKeys,
                });
              },
              onmessage: (message: LiveServerMessage) => {
                const content = message.serverContent;

                if (content?.interrupted) {
                  safeSend({ type: 'interrupted' });
                }

                if (content?.inputTranscription?.text) {
                  currentUserTurnText += content.inputTranscription.text;
                  safeSend({
                    type: 'subtitle',
                    speaker: 'user',
                    text: content.inputTranscription.text,
                  });
                }

                if (content?.outputTranscription?.text) {
                  safeSend({
                    type: 'subtitle',
                    speaker: 'jarvis',
                    text: content.outputTranscription.text,
                  });
                }

                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    safeSend({ type: 'audio', data: part.inlineData.data });
                  }
                }

                if (content?.turnComplete) {
                  if (!turnDispatchedAction && currentUserTurnText.trim()) {
                    const fallbackIntent = parseLocalCommand(currentUserTurnText);
                    if (fallbackIntent?.type === 'open_web') {
                      turnDispatchedAction = true;
                      safeSend({
                        type: 'open_url',
                        target: {
                          name: fallbackIntent.name,
                          url: fallbackIntent.url,
                          searchQuery: fallbackIntent.searchQuery,
                        },
                      });
                    } else if (fallbackIntent?.type === 'computer_action') {
                      turnDispatchedAction = true;
                      safeSend({
                        type: 'computer_action',
                        action: fallbackIntent.action,
                        target: fallbackIntent.target,
                        value: fallbackIntent.value || '',
                        requiresConfirmation: fallbackIntent.requiresConfirmation,
                        callId: `cmp_live_${Date.now()}`,
                      });
                    } else if (fallbackIntent?.type === 'create_schedule') {
                      turnDispatchedAction = true;
                      const created = scheduler.createSchedule({
                        kind: fallbackIntent.kind,
                        title: fallbackIntent.title,
                        triggerAt: fallbackIntent.triggerAtIso,
                        durationSeconds: fallbackIntent.durationSeconds,
                        recurrence: fallbackIntent.recurrence,
                      });
                      scheduler.addLog({
                        command: currentUserTurnText,
                        intent: `create_${fallbackIntent.kind}`,
                        source: 'live',
                        status: 'SCHEDULED',
                        detail: `Created via Live turn-complete fallback: ${created.item.title}`,
                        verified: true,
                      });
                      safeSend({ type: 'schedules_sync', schedules: scheduler.getSchedules() });
                    }
                  }
                  currentUserTurnText = '';
                  turnDispatchedAction = false;
                  safeSend({ type: 'turn_complete' });
                }

                if (content?.interactionStatus) {
                  safeSend({
                    type: 'status',
                    status:
                      content.interactionStatus === InteractionStatus.IN_PROGRESS
                        ? 'in_progress'
                        : 'idle',
                  });
                }

                const calls = message.toolCall?.functionCalls ?? [];
                if (calls.length > 0 && workingState && liveSession) {
                  const activeSession = liveSession;
                  const stateRef = workingState;

                  void (async () => {
                    try {
                      const functionResponses = [];
                      let stateChanged = false;

                      for (const call of calls) {
                        const args = (call.args || {}) as Record<string, unknown>;
                        const toolName = call.name || 'unknown_tool';

                        safeSend({
                          type: 'tool_progress',
                          toolName,
                          message: formatToolProgressLabel(toolName, args),
                        });

                        let result: Record<string, unknown>;

                        if (toolName === 'web_search') {
                          result = await runLiveWebSearch(ai, String(args.query || ''));
                        } else if (toolName === 'open_web_app') {
                          const target = resolveLaunchTarget(
                            String(args.appOrSite || 'YouTube'),
                            args.searchQuery ? String(args.searchQuery) : undefined
                          );
                          turnDispatchedAction = true;
                          safeSend({ type: 'open_url', target });
                          result = {
                            status: 'launch_triggered',
                            name: target.name,
                            url: target.url,
                            note: 'Direct launch attempted and clickable launch card displayed on screen.',
                          };
                        } else if (toolName === 'remember_fact') {
                          if (!memoryEnabledFlag) {
                            result = {
                              status: 'disabled',
                              note: 'Personal Memory Vault is currently disabled by user settings.',
                            };
                          } else {
                            const rawCat = String(
                              args.category || 'note'
                            ).toLowerCase() as MemoryCategory;
                            const proposal = {
                              id: `mem_prop_${Date.now()}_${Math.random()
                                .toString(36)
                                .slice(2, 6)}`,
                              key: String(args.key || 'note')
                                .trim()
                                .toLowerCase()
                                .replace(/\s+/g, '_')
                                .slice(0, 120),
                              value: String(args.value || '').trim().slice(0, 2000),
                              category: VALID_MEM_CATS.has(rawCat) ? rawCat : 'note',
                              createdAt: new Date().toISOString(),
                            };
                            safeSend({ type: 'memory_proposal', proposal });
                            result = {
                              status: 'pending_user_approval',
                              proposal,
                              note: 'Displayed memory approval card on screen so the user can approve saving permanently.',
                            };
                          }
                        } else if (toolName === 'computer_control') {
                          const action = String(args.action || 'system_info').trim();
                          const target = args.target ? String(args.target).trim() : '';
                          const value = args.value ? String(args.value).trim() : '';
                          const sensitive =
                            action === 'create_local_folder' ||
                            action === 'capture_screenshot' ||
                            action === 'companion_launch_app' ||
                            action === 'companion_close_app' ||
                            action === 'companion_media_control' ||
                            action === 'companion_system_setting' ||
                            action === 'companion_write_file' ||
                            action === 'companion_run_command';

                          turnDispatchedAction = true;
                          safeSend({
                            type: 'computer_action',
                            action,
                            target,
                            value,
                            requiresConfirmation: sensitive,
                            callId: call.id || `cmp_${Date.now()}`,
                          });

                          result = sensitive
                            ? {
                                status: 'confirmation_required',
                                action,
                                target,
                                note: 'Awaiting explicit user confirmation on screen before executing computer control.',
                              }
                            : {
                                status: 'dispatched_to_browser',
                                action,
                                target,
                                note: 'Triggered browser inspection / file picker on client HUD.',
                              };
                        } else {
                          const unified = executeUnifiedToolCall(
                            toolName,
                            args,
                            stateRef
                          );
                          result = unified.result;
                          stateChanged = true;
                          if (
                            toolName === 'set_alarm' ||
                            toolName === 'create_reminder' ||
                            toolName === 'set_timer' ||
                            toolName === 'cancel_schedule' ||
                            toolName === 'cancel_timer' ||
                            toolName === 'snooze_schedule'
                          ) {
                            turnDispatchedAction = true;
                            safeSend({ type: 'schedules_sync', schedules: scheduler.getSchedules() });
                          }
                          scheduler.addLog({
                            command: currentUserTurnText || toolName,
                            intent: toolName,
                            source: 'live',
                            status:
                              result.status === 'not_found' || result.status === 'error'
                                ? 'FAILED'
                                : result.status === 'scheduled'
                                ? 'SCHEDULED'
                                : 'COMPLETED',
                            detail: `${toolName}: ${JSON.stringify(result).slice(0, 180)}`,
                            verified: result.status !== 'not_found' && result.status !== 'error',
                          });
                        }

                        functionResponses.push({
                          id: call.id,
                          name: toolName,
                          response: result,
                        });
                      }

                      if (stateChanged) {
                        safeSend({ type: 'state_sync', state: stateRef });
                      }

                      if (!isClosing && functionResponses.length > 0) {
                        activeSession.sendToolResponse({ functionResponses });
                      }
                    } catch (toolErr) {
                      const info = extractApiError(toolErr);
                      safeSend({
                        type: 'error',
                        fallbackRecommended: true,
                        quotaLimited: info.quotaLimited,
                        retryAfterSeconds: info.retryAfterSeconds,
                        error: info.message || 'Live tool execution error.',
                      });
                    }
                  })();
                }
              },
              onerror: (event: ErrorEvent) => {
                scheduler.recordGeminiError(
                  event?.message || 'Gemini Live connection error',
                  modeSpec.liveModel
                );
                const info = extractApiError(event?.message || 'Gemini Live connection error');
                safeSend({
                  type: 'error',
                  fallbackRecommended: true,
                  quotaLimited: info.quotaLimited,
                  retryAfterSeconds: info.retryAfterSeconds,
                  error: info.message || 'Gemini Live connection error.',
                });
              },
              onclose: () => {
                if (!isClosing) {
                  safeSend({ type: 'closed' });
                }
              },
            },
          });

          isConnectingLive = false;

          if (msg.initialPrompt && msg.initialPrompt.trim()) {
            const promptText = msg.initialPrompt.trim();
            currentUserTurnText = promptText;
            turnDispatchedAction = false;
            liveSession.sendRealtimeInput({ text: promptText });
          }
          while (pendingAudioQueue.length > 0 && liveSession) {
            const chunk = pendingAudioQueue.shift()!;
            liveSession.sendRealtimeInput({
              audio: { data: chunk, mimeType: 'audio/pcm;rate=16000' },
            });
          }
          while (pendingTextQueue.length > 0 && liveSession) {
            const textChunk = pendingTextQueue.shift()!;
            currentUserTurnText = textChunk;
            turnDispatchedAction = false;
            liveSession.sendRealtimeInput({ text: textChunk });
          }
          return;
        }

        if (msg.type === 'audio' && msg.data) {
          if (liveSession) {
            liveSession.sendRealtimeInput({
              audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (isConnectingLive) {
            if (pendingAudioQueue.length >= 35) {
              pendingAudioQueue.shift();
            }
            pendingAudioQueue.push(msg.data);
          }
          return;
        }

        if (msg.type === 'text_prompt' && msg.text) {
          currentUserTurnText = msg.text.trim();
          turnDispatchedAction = false;
          if (liveSession) {
            liveSession.sendRealtimeInput({ text: msg.text });
          } else if (isConnectingLive) {
            pendingTextQueue.push(msg.text);
          }
          return;
        }

        if (msg.type === 'state_update' && msg.state) {
          workingState = JSON.parse(JSON.stringify(msg.state)) as AssistantState;
        }
      } catch (err) {
        isConnectingLive = false;
        scheduler.recordGeminiError(err, 'gemini-3.8-live');
        const info = extractApiError(err);
        safeSend({
          type: 'error',
          fallbackRecommended: true,
          quotaLimited: info.quotaLimited,
          retryAfterSeconds: info.retryAfterSeconds,
          error: info.message,
        });
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore
        }
        liveSession = null;
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

createAppServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

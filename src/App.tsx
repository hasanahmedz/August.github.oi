import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type {
  AssistantConfig,
  AssistantMessage,
  AssistantSessionSnapshot,
  AssistantState,
  AutomationWorkflow,
  BrowserAutomationSnapshot,
  BugFixReport,
  CallLogEntry,
  ConnectedIntegrationItem,
  ContactEntry,
  CreativeAssetEntry,
  ExecutionLogEntry,
  GeminiQuotaStatus,
  HomeAssistantEntity,
  IncomingCallEvent,
  KnowledgeChunkItem,
  KnowledgeCitation,
  KnowledgeDocItem,
  MemoryCategory,
  MemoryFact,
  MonitorTopic,
  MonitorUpdateItem,
  MultiAgentRun,
  NavSection,
  ProactiveAlert,
  ProjectEntry,
  ScheduleKind,
  ScheduleRecurrence,
  ScheduledItem,
  SkillDefinition,
  SkillVersionEntry,
  TaskItem,
  TaskPriority,
  VoiceMood,
} from './types/assistant';
import {
  AGENT_VOICE_PROFILES,
  HASAN_PROFILE_MEMORIES,
  INITIAL_ASSISTANT_STATE,
  PERSONA_PRESETS,
} from './data/blueprintData';
import {
  auth,
  clearAllCloudMemories,
  deleteCloudContact,
  deleteCloudCreativeAsset,
  deleteCloudHistoryItem,
  deleteCloudIntegrationStatus,
  deleteCloudKnowledgeDocWithChunks,
  deleteCloudMemory,
  deleteCloudProject,
  deleteCloudSkill,
  deleteCloudTask,
  deleteCloudWorkflow,
  ensureCloudUserProfile,
  saveCloudAgentRun,
  saveCloudAuditLog,
  saveCloudBugReport,
  saveCloudCallLog,
  saveCloudContact,
  saveCloudCreativeAsset,
  saveCloudHistoryItem,
  saveCloudIntegrationStatus,
  saveCloudKnowledgeChunksBatch,
  saveCloudKnowledgeDoc,
  saveCloudMemory,
  saveCloudProject,
  saveCloudSkill,
  saveCloudSkillVersion,
  saveCloudTask,
  saveCloudWorkflow,
  signInWithGoogle,
  signOutUser,
  subscribeToAuth,
  subscribeUserCloudCollections,
  subscribeUserKnowledgeAndIntegrations,
  subscribeUserStudioCollections,
  toggleCloudKnowledgeDoc,
  updateCloudUserProfile,
} from './services/firebase';
import { TopNav } from './components/TopNav';
import { LiveSandbox } from './components/LiveSandbox';
import { ArchitectureView } from './components/ArchitectureView';
import { BuildGuideView } from './components/BuildGuideView';
import { CodeGeneratorView } from './components/CodeGeneratorView';

const STORAGE_KEYS = {
  state: 'jarvis_lab_state_v1',
  config: 'jarvis_lab_config_v1',
  messages: 'jarvis_lab_messages_v1',
  guide: 'jarvis_lab_guide_v1',
  hasanLocalSeed: 'jarvis_hasan_local_seeded_v2',
  schedules: 'jarvis_schedules_v1',
  logs: 'jarvis_execution_logs_v1',
};

const DEFAULT_CONFIG: AssistantConfig = {
  personaId: PERSONA_PRESETS[0].id,
  systemInstruction: PERSONA_PRESETS[0].systemInstruction,
  enabledTools: ['tasks', 'timers', 'memory', 'environment', 'search', 'computer'],
  thinkingLevel: 'MEDIUM',
  aiMode: 'STANDARD',
  continuousMode: true,
  memoryEnabled: true,
  wakeEngine: 'auto',
  voiceMode: 'gemini',
  voiceName: PERSONA_PRESETS[0].voiceName,
  agentVoiceProfileId: AGENT_VOICE_PROFILES[0].id,
  agentVoiceStyle: AGENT_VOICE_PROFILES[0].stylePrompt,
  voiceVolume: 0.9,
  voiceSpeed: 0.95,
  voicePitchSemitones: -0.5,
  proactiveVoiceAlerts: true,
  spokenToolUpdates: true,
  soundFeedbackEnabled: true,
  picovoiceAccessKey: '',
  companionUrl: 'ws://127.0.0.1:4849',
  companionPairingToken: '',
  visualQuality: 'balanced',
  voiceLanguage: 'en-US',
  preferredLanguage: 'en-US',
  voiceMoodDefault: 'normal',
  wakeSensitivity: 0.6,
  desktopAwarenessEnabled: false,
  callConfig: {
    enabled: true,
    handlingMode: 'notify_wait',
    busyMode: false,
    busyReplyText: 'Hasan is busy right now and will get back to you shortly.',
    vipContacts: [],
    autoAnswerEnabled: false,
  },
};

function formatTimeNow(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeLoadedConfig(raw: Partial<AssistantConfig> | null): AssistantConfig {
  const merged: AssistantConfig = {
    ...DEFAULT_CONFIG,
    ...(raw || {}),
  };
  if (!Array.isArray(merged.enabledTools) || merged.enabledTools.length === 0) {
    merged.enabledTools = [...DEFAULT_CONFIG.enabledTools];
  } else if (!merged.enabledTools.includes('computer')) {
    merged.enabledTools = [...merged.enabledTools, 'computer'];
  }
  if (!merged.aiMode) merged.aiMode = 'STANDARD';
  if (merged.memoryEnabled === undefined) merged.memoryEnabled = true;
  if (merged.continuousMode === undefined) merged.continuousMode = false;
  if (!merged.wakeEngine) merged.wakeEngine = 'auto';
  if (!merged.companionUrl) merged.companionUrl = 'ws://127.0.0.1:4849';
  if (typeof merged.companionPairingToken !== 'string') {
    merged.companionPairingToken = '';
  }
  if (!merged.visualQuality) merged.visualQuality = 'balanced';
  if (!merged.voiceLanguage) merged.voiceLanguage = 'en-US';
  if (!merged.preferredLanguage) merged.preferredLanguage = merged.voiceLanguage;
  if (!merged.voiceMoodDefault) merged.voiceMoodDefault = 'normal';
  merged.wakeSensitivity =
    typeof merged.wakeSensitivity === 'number' && Number.isFinite(merged.wakeSensitivity)
      ? Math.max(0.2, Math.min(0.95, merged.wakeSensitivity))
      : 0.6;
  if (!merged.agentVoiceProfileId) {
    merged.agentVoiceProfileId = DEFAULT_CONFIG.agentVoiceProfileId;
  }
  if (!merged.agentVoiceStyle) {
    merged.agentVoiceStyle = DEFAULT_CONFIG.agentVoiceStyle;
  }
  merged.voiceVolume =
    typeof merged.voiceVolume === 'number' && Number.isFinite(merged.voiceVolume)
      ? Math.max(0, Math.min(1, merged.voiceVolume))
      : DEFAULT_CONFIG.voiceVolume;
  merged.voiceSpeed =
    typeof merged.voiceSpeed === 'number' && Number.isFinite(merged.voiceSpeed)
      ? Math.max(0.75, Math.min(1.4, merged.voiceSpeed))
      : DEFAULT_CONFIG.voiceSpeed;
  merged.voicePitchSemitones =
    typeof merged.voicePitchSemitones === 'number' &&
    Number.isFinite(merged.voicePitchSemitones)
      ? Math.max(-6, Math.min(6, merged.voicePitchSemitones))
      : DEFAULT_CONFIG.voicePitchSemitones;
  if (merged.proactiveVoiceAlerts === undefined) {
    merged.proactiveVoiceAlerts = true;
  }
  if (merged.spokenToolUpdates === undefined) {
    merged.spokenToolUpdates = true;
  }
  if (merged.soundFeedbackEnabled === undefined) {
    merged.soundFeedbackEnabled = true;
  }
  if (merged.desktopAwarenessEnabled === undefined) {
    merged.desktopAwarenessEnabled = false;
  }
  if (!merged.callConfig) {
    merged.callConfig = { ...DEFAULT_CONFIG.callConfig! };
  } else {
    merged.callConfig = {
      ...DEFAULT_CONFIG.callConfig!,
      ...merged.callConfig,
      vipContacts: Array.isArray(merged.callConfig.vipContacts)
        ? merged.callConfig.vipContacts
        : [],
    };
  }
  if (
    merged.personaId === 'butler' &&
    (merged.systemInstruction.startsWith('You are Jarvis, a calm, articulate, and highly capable') ||
      merged.systemInstruction.startsWith("You are J.A.R.V.I.S., Hasan Ahmed's personal AI assistant. Communicate directly"))
  ) {
    merged.systemInstruction = PERSONA_PRESETS[0].systemInstruction;
  }
  return merged;
}

function normalizeLoadedState(raw: Partial<AssistantState> | null): AssistantState {
  const base = INITIAL_ASSISTANT_STATE;
  let memory: MemoryFact[] = Array.isArray(raw?.memory)
    ? raw!.memory.map((m) => ({
        ...m,
        approved: m.approved === undefined ? true : Boolean(m.approved),
      }))
    : [...base.memory];

  // Non-destructive one-time v2 upgrade to merge Hasan Ahmed's complete Personal History
  try {
    if (!localStorage.getItem(STORAGE_KEYS.hasanLocalSeed)) {
      const seedById = new Map(HASAN_PROFILE_MEMORIES.map((m) => [m.id, m]));
      const updatedExisting = memory.map((m) => {
        const replacement = seedById.get(m.id);
        return replacement ? { ...m, ...replacement } : m;
      });
      const existingIds = new Set(updatedExisting.map((m) => m.id));
      const existingKeys = new Set(updatedExisting.map((m) => m.key.toLowerCase()));
      const additions = HASAN_PROFILE_MEMORIES.filter(
        (m) => !existingIds.has(m.id) && !existingKeys.has(m.key.toLowerCase())
      );
      memory = [...additions, ...updatedExisting];
      localStorage.setItem(STORAGE_KEYS.hasanLocalSeed, 'true');
    }
  } catch {
    // ignore storage access issues
  }

  return {
    tasks: Array.isArray(raw?.tasks) ? raw!.tasks : base.tasks,
    timers: Array.isArray(raw?.timers) ? raw!.timers : base.timers,
    memory,
    environment: raw?.environment
      ? { ...base.environment, ...raw.environment }
      : base.environment,
    searchHistory: Array.isArray(raw?.searchHistory) ? raw!.searchHistory : [],
  };
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || 'An unexpected application error occurred.',
    };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#04070d] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-2xl border border-rose-500/30 bg-[#070f1d] p-6 space-y-4">
            <h1 className="text-lg font-display font-semibold text-rose-300">
              J.A.R.V.I.S. System Recovery
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              A runtime or cloud permission error interrupted the interface.
            </p>
            <pre className="text-xs font-mono text-rose-200/90 bg-slate-950/80 border border-rose-500/20 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
              {this.state.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 transition-colors"
            >
              Reload J.A.R.V.I.S.
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('sandbox');

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const [assistantState, setAssistantState] = useState<AssistantState>(() =>
    normalizeLoadedState(loadFromStorage<Partial<AssistantState> | null>(STORAGE_KEYS.state, null))
  );

  const [config, setConfig] = useState<AssistantConfig>(() =>
    normalizeLoadedConfig(loadFromStorage<Partial<AssistantConfig> | null>(STORAGE_KEYS.config, null))
  );

  const [messages, setMessages] = useState<AssistantMessage[]>(() =>
    loadFromStorage<AssistantMessage[]>(STORAGE_KEYS.messages, [])
  );

  const [completedStepIds, setCompletedStepIds] = useState<string[]>(() =>
    loadFromStorage<string[]>(STORAGE_KEYS.guide, [])
  );

  const [pendingVoicePrompt, setPendingVoicePrompt] = useState<string | null>(null);
  const [latestAlert, setLatestAlert] = useState<ProactiveAlert | null>(null);
  const [schedules, setSchedules] = useState<ScheduledItem[]>(() =>
    loadFromStorage<ScheduledItem[]>(STORAGE_KEYS.schedules, [])
  );
  const [executionLogs, setExecutionLogs] = useState<ExecutionLogEntry[]>(() =>
    loadFromStorage<ExecutionLogEntry[]>(STORAGE_KEYS.logs, [])
  );
  const [quotaStatus, setQuotaStatus] = useState<GeminiQuotaStatus>({
    limited: false,
    retryAfterSeconds: 0,
  });
  const [monitorTopics, setMonitorTopics] = useState<MonitorTopic[]>([]);
  const [monitorUpdates, setMonitorUpdates] = useState<MonitorUpdateItem[]>([]);
  const [browserSnapshot, setBrowserSnapshot] = useState<BrowserAutomationSnapshot>({
    active: false,
    engine: 'none',
    status: 'idle',
    currentUrl: '',
    pageTitle: '',
    tabCount: 0,
    activeTabIndex: 0,
    tabs: [],
    results: [],
    steps: [],
    updatedAt: new Date().toISOString(),
  });
  const [incomingCall, setIncomingCall] = useState<IncomingCallEvent | null>(null);
  const [mapsApiKey, setMapsApiKey] = useState<string>('');
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState<boolean>(false);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocItem[]>([]);
  const [knowledgeChunks, setKnowledgeChunks] = useState<KnowledgeChunkItem[]>([]);
  const [knowledgeUploading, setKnowledgeUploading] = useState<boolean>(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<ConnectedIntegrationItem[]>([]);
  const [haConnected, setHaConnected] = useState<boolean>(false);
  const [haBaseUrl, setHaBaseUrl] = useState<string>('http://homeassistant.local:8123');
  const [haEntities, setHaEntities] = useState<HomeAssistantEntity[]>([]);
  const [haBusy, setHaBusy] = useState<boolean>(false);
  const [haError, setHaError] = useState<string | null>(null);

  // Studio Collections (Synced with Firestore when signed in; cached locally for guest mode)
  const [skills, setSkills] = useState<SkillDefinition[]>(() =>
    loadFromStorage<SkillDefinition[]>('jarvis_studio_skills_v1', [])
  );
  const [projects, setProjects] = useState<ProjectEntry[]>(() =>
    loadFromStorage<ProjectEntry[]>('jarvis_studio_projects_v1', [])
  );
  const [bugReports, setBugReports] = useState<BugFixReport[]>(() =>
    loadFromStorage<BugFixReport[]>('jarvis_studio_bugs_v1', [])
  );
  const [creativeAssets, setCreativeAssets] = useState<CreativeAssetEntry[]>(() =>
    loadFromStorage<CreativeAssetEntry[]>('jarvis_studio_creative_v1', [])
  );
  const [contacts, setContacts] = useState<ContactEntry[]>(() =>
    loadFromStorage<ContactEntry[]>('jarvis_studio_contacts_v1', [])
  );
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>(() =>
    loadFromStorage<CallLogEntry[]>('jarvis_studio_calllogs_v1', [])
  );
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>(() =>
    loadFromStorage<AutomationWorkflow[]>('jarvis_studio_workflows_v1', [])
  );
  const [agentRuns, setAgentRuns] = useState<MultiAgentRun[]>(() =>
    loadFromStorage<MultiAgentRun[]>('jarvis_studio_agentruns_v1', [])
  );

  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? window.Notification.permission
      : 'unsupported'
  );

  const userRef = useRef<User | null>(null);
  const assistantStateRef = useRef<AssistantState>(assistantState);
  const configRef = useRef<AssistantConfig>(config);
  const deliveredAlertIdsRef = useRef<Set<string>>(new Set());
  // Kept in memory only (never written to Firestore, localStorage, or server disk)
  const haTokenRef = useRef<string>('');

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    assistantStateRef.current = assistantState;
  }, [assistantState]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.schedules, JSON.stringify(schedules));
    } catch {
      // ignore
    }
  }, [schedules]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(executionLogs.slice(0, 120)));
    } catch {
      // ignore
    }
  }, [executionLogs]);

  // Persist local guest state & local-only keys (Picovoice key / Companion URL)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(assistantState));
    } catch {
      // ignore storage quota
    }
  }, [assistantState]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(config));
    } catch {
      // ignore
    }
  }, [config]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(messages.slice(-40)));
    } catch {
      // ignore
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.guide, JSON.stringify(completedStepIds));
    } catch {
      // ignore
    }
  }, [completedStepIds]);

  useEffect(() => {
    try {
      localStorage.setItem('jarvis_studio_skills_v1', JSON.stringify(skills));
      localStorage.setItem('jarvis_studio_projects_v1', JSON.stringify(projects));
      localStorage.setItem('jarvis_studio_bugs_v1', JSON.stringify(bugReports.slice(0, 60)));
      localStorage.setItem('jarvis_studio_creative_v1', JSON.stringify(creativeAssets.slice(0, 40)));
      localStorage.setItem('jarvis_studio_contacts_v1', JSON.stringify(contacts));
      localStorage.setItem('jarvis_studio_calllogs_v1', JSON.stringify(callLogs.slice(0, 80)));
      localStorage.setItem('jarvis_studio_workflows_v1', JSON.stringify(workflows));
      localStorage.setItem('jarvis_studio_agentruns_v1', JSON.stringify(agentRuns.slice(0, 40)));
    } catch {
      // ignore storage quota errors
    }
  }, [skills, projects, bugReports, creativeAssets, contacts, callLogs, workflows, agentRuns]);

  const deliverProactiveAlert = useCallback((alert: ProactiveAlert) => {
    if (deliveredAlertIdsRef.current.has(alert.id)) return;
    deliveredAlertIdsRef.current.add(alert.id);
    setLatestAlert(alert);

    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'granted'
    ) {
      try {
        new window.Notification('August · J.A.R.V.I.S.', {
          body: alert.spokenText || alert.title,
          tag: alert.scheduleId || alert.id,
        });
      } catch {
        // ignore browser notification failures
      }
    }

    if (alert.scheduleId || alert.id.startsWith('sched_alert_')) {
      void fetch(`/api/schedules/alerts/${encodeURIComponent(alert.id)}/ack`, {
        method: 'POST',
      }).catch(() => {});
    }
  }, []);

  // Subscribe to Google Maps quota events + fetch Maps client config
  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    void fetch('/api/maps/config')
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as { apiKey?: string };
        if (data.apiKey) setMapsApiKey(data.apiKey);
      })
      .catch(() => {});
    return () => {
      window.removeEventListener('gmp-quota-exceeded', onQuota);
    };
  }, []);

  // Subscribe to persistent backend scheduler SSE + initial hydrate
  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      try {
        const [schedRes, logsRes, statusRes, monRes, browRes] = await Promise.all([
          fetch('/api/schedules'),
          fetch('/api/logs'),
          fetch('/api/assistant/status'),
          fetch('/api/monitors'),
          fetch('/api/browser/state'),
        ]);
        if (!active) return;

        if (schedRes.ok) {
          const data = (await schedRes.json()) as {
            items?: ScheduledItem[];
            pendingAlerts?: Array<{
              id: string;
              scheduleId: string;
              kind: 'alarm' | 'reminder' | 'timer';
              title: string;
              spokenText: string;
              createdAt: string;
            }>;
          };
          if (Array.isArray(data.items)) {
            setSchedules(data.items);
          }
          if (Array.isArray(data.pendingAlerts) && data.pendingAlerts.length > 0) {
            const first = data.pendingAlerts[0];
            deliverProactiveAlert({
              id: first.id,
              scheduleId: first.scheduleId,
              title: first.title,
              spokenText: first.spokenText,
              kind: first.kind,
              createdAt: first.createdAt,
            });
          }
        }
        if (logsRes.ok) {
          const data = (await logsRes.json()) as { logs?: ExecutionLogEntry[] };
          if (Array.isArray(data.logs)) {
            setExecutionLogs(data.logs);
          }
        }
        if (statusRes.ok) {
          const data = (await statusRes.json()) as { quota?: GeminiQuotaStatus };
          if (data.quota) {
            setQuotaStatus(data.quota);
          }
        }
        if (monRes.ok) {
          const data = (await monRes.json()) as {
            topics?: MonitorTopic[];
            updates?: MonitorUpdateItem[];
          };
          if (Array.isArray(data.topics)) setMonitorTopics(data.topics);
          if (Array.isArray(data.updates)) setMonitorUpdates(data.updates);
        }
        if (browRes.ok) {
          const data = (await browRes.json()) as {
            snapshot?: BrowserAutomationSnapshot;
            state?: BrowserAutomationSnapshot;
          };
          const snap = data.snapshot || data.state;
          if (snap) setBrowserSnapshot(snap);
        }
      } catch {
        // offline fallback uses localStorage schedules
      }
    };

    void hydrate();

    const eventSource = new EventSource('/api/schedules/events');
    eventSource.addEventListener('init', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as {
          items?: ScheduledItem[];
          quota?: GeminiQuotaStatus;
          monitors?: MonitorTopic[];
          monitorUpdates?: MonitorUpdateItem[];
          browserState?: BrowserAutomationSnapshot;
          pendingAlerts?: Array<{
            id: string;
            scheduleId: string;
            kind: 'alarm' | 'reminder' | 'timer';
            title: string;
            spokenText: string;
            createdAt: string;
          }>;
        };
        if (Array.isArray(parsed.items)) setSchedules(parsed.items);
        if (parsed.quota) setQuotaStatus(parsed.quota);
        if (Array.isArray(parsed.monitors)) setMonitorTopics(parsed.monitors);
        if (Array.isArray(parsed.monitorUpdates)) setMonitorUpdates(parsed.monitorUpdates);
        if (parsed.browserState) setBrowserSnapshot(parsed.browserState);
        if (Array.isArray(parsed.pendingAlerts) && parsed.pendingAlerts.length > 0) {
          const first = parsed.pendingAlerts[0];
          deliverProactiveAlert({
            id: first.id,
            scheduleId: first.scheduleId,
            title: first.title,
            spokenText: first.spokenText,
            kind: first.kind,
            createdAt: first.createdAt,
          });
        }
      } catch {
        // ignore malformed SSE
      }
    });

    eventSource.addEventListener('schedule_sync', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as {
          items?: ScheduledItem[];
        };
        if (Array.isArray(parsed.items)) setSchedules(parsed.items);
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener('schedule_due', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as {
          alert?: {
            id: string;
            scheduleId: string;
            kind: 'alarm' | 'reminder' | 'timer';
            title: string;
            spokenText: string;
            createdAt: string;
          };
        };
        if (parsed.alert) {
          deliverProactiveAlert({
            id: parsed.alert.id,
            scheduleId: parsed.alert.scheduleId,
            title: parsed.alert.title,
            spokenText: parsed.alert.spokenText,
            kind: parsed.alert.kind,
            createdAt: parsed.alert.createdAt,
          });
        }
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener('log_added', (ev) => {
      try {
        const raw = JSON.parse((ev as MessageEvent).data) as
          | { entry?: ExecutionLogEntry }
          | ExecutionLogEntry;
        const entry =
          'entry' in raw && raw.entry ? raw.entry : (raw as ExecutionLogEntry);
        if (entry?.id) {
          setExecutionLogs((prev) =>
            [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 120)
          );
        }
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener('quota_status', (ev) => {
      try {
        const quota = JSON.parse((ev as MessageEvent).data) as GeminiQuotaStatus;
        setQuotaStatus(quota);
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener('monitor_sync', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as {
          topics?: MonitorTopic[];
          updates?: MonitorUpdateItem[];
        };
        if (Array.isArray(parsed.topics)) setMonitorTopics(parsed.topics);
        if (Array.isArray(parsed.updates)) setMonitorUpdates(parsed.updates);
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener('monitor_update', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as {
          topic?: MonitorTopic;
          update?: MonitorUpdateItem;
        };
        if (parsed.update) {
          const u = parsed.update;
          setMonitorUpdates((prev) => [u, ...prev.filter((x) => x.id !== u.id)].slice(0, 60));
          deliverProactiveAlert({
            id: `mon_${u.id}`,
            title: `${u.topicTitle} (${u.verification === 'confirmed' ? 'Official' : 'Rumor'})`,
            spokenText: `${u.topicTitle} update: ${u.headline}.`,
            kind: 'monitor',
            sourceUrl: u.sourceUrl,
            verification: u.verification,
            createdAt: u.discoveredAt,
          });
        }
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener('browser_state', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as {
          snapshot?: BrowserAutomationSnapshot;
          state?: BrowserAutomationSnapshot;
        };
        const snap = parsed.snapshot || parsed.state;
        if (snap) setBrowserSnapshot(snap);
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener('incoming_call', (ev) => {
      try {
        const raw = JSON.parse((ev as MessageEvent).data) as {
          call?: {
            callerName?: string;
            callerNumber?: string;
            appSource?: string;
            receivedAt?: string;
          };
          callerName?: string;
          callerNumber?: string;
          appSource?: string;
          receivedAt?: string;
        };
        const callPayload = raw.call || raw;
        const callerName = String(callPayload.callerName || 'Unknown Caller');
        const vips = (configRef.current.callConfig?.vipContacts || []).map((v) =>
          v.toLowerCase()
        );
        const isVip = vips.some((v) => callerName.toLowerCase().includes(v));
        const callObj: IncomingCallEvent = {
          id: `call_${Date.now()}`,
          callerName,
          callerNumber: callPayload.callerNumber,
          appSource: callPayload.appSource || 'Phone Bridge',
          status: 'ringing',
          isVip,
          receivedAt: callPayload.receivedAt || new Date().toISOString(),
        };
        setIncomingCall(callObj);
        deliverProactiveAlert({
          id: callObj.id,
          title: `Incoming Call: ${callerName}`,
          spokenText: `Hasan, incoming call from ${callerName} via ${callObj.appSource}.`,
          kind: 'call',
          createdAt: callObj.receivedAt,
        });
      } catch {
        // ignore
      }
    });

    return () => {
      active = false;
      eventSource.close();
    };
  }, [deliverProactiveAlert]);

  // 1-second quota cooldown countdown + offline schedule fallback ticker
  useEffect(() => {
    const id = window.setInterval(() => {
      setQuotaStatus((prev) => {
        if (!prev.limited) return prev;
        if (prev.cooldownUntil) {
          const remaining = Math.max(
            0,
            Math.ceil((new Date(prev.cooldownUntil).getTime() - Date.now()) / 1000)
          );
          if (remaining <= 0) {
            return { limited: false, retryAfterSeconds: 0 };
          }
          return { ...prev, retryAfterSeconds: remaining };
        }
        const nextSecs = Math.max(0, prev.retryAfterSeconds - 1);
        return nextSecs <= 0
          ? { limited: false, retryAfterSeconds: 0 }
          : { ...prev, retryAfterSeconds: nextSecs };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Subscribe to Firebase Auth & real-time Firestore collections
  useEffect(() => {
    let unsubCollections: (() => void) | null = null;
    let unsubKnowledge: (() => void) | null = null;
    let unsubStudios: (() => void) | null = null;
    let cancelled = false;

    const unsubAuth = subscribeToAuth((nextUser) => {
      if (cancelled) return;
      if (unsubCollections) {
        unsubCollections();
        unsubCollections = null;
      }
      if (unsubKnowledge) {
        unsubKnowledge();
        unsubKnowledge = null;
      }
      if (unsubStudios) {
        unsubStudios();
        unsubStudios = null;
      }

      setUser(nextUser);
      setAuthLoading(false);

      if (!nextUser) {
        setCloudError(null);
        return;
      }

      void (async () => {
        try {
          setCloudError(null);
          await ensureCloudUserProfile(nextUser, {
            displayName: nextUser.displayName || 'User',
            personaId: configRef.current.personaId,
            aiMode: configRef.current.aiMode,
            voiceName: configRef.current.voiceName,
            continuousMode: configRef.current.continuousMode,
            memoryEnabled: configRef.current.memoryEnabled,
            agentVoiceProfileId: configRef.current.agentVoiceProfileId,
            agentVoiceStyle: configRef.current.agentVoiceStyle,
            voiceVolume: configRef.current.voiceVolume,
            voiceSpeed: configRef.current.voiceSpeed,
            voicePitchSemitones: configRef.current.voicePitchSemitones,
            proactiveVoiceAlerts: configRef.current.proactiveVoiceAlerts,
            spokenToolUpdates: configRef.current.spokenToolUpdates,
            soundFeedbackEnabled: configRef.current.soundFeedbackEnabled,
            desktopAwarenessEnabled: configRef.current.desktopAwarenessEnabled,
            preferredLanguage: configRef.current.preferredLanguage || configRef.current.voiceLanguage,
            voiceMoodDefault: configRef.current.voiceMoodDefault || 'normal',
            environment: assistantStateRef.current.environment,
          });
          if (cancelled) return;

          unsubCollections = subscribeUserCloudCollections(nextUser.uid, {
            onProfile: (profile) => {
              setConfig((prev) => {
                const matchedPersona = PERSONA_PRESETS.find(
                  (p) => p.id === profile.personaId
                );
                return {
                  ...prev,
                  personaId: profile.personaId || prev.personaId,
                  systemInstruction:
                    matchedPersona?.systemInstruction || prev.systemInstruction,
                  aiMode: profile.aiMode || prev.aiMode,
                  voiceName: profile.voiceName || prev.voiceName,
                  continuousMode: profile.continuousMode,
                  memoryEnabled: profile.memoryEnabled,
                  agentVoiceProfileId:
                    profile.agentVoiceProfileId || prev.agentVoiceProfileId,
                  agentVoiceStyle:
                    profile.agentVoiceStyle || prev.agentVoiceStyle,
                  voiceVolume:
                    typeof profile.voiceVolume === 'number'
                      ? profile.voiceVolume
                      : prev.voiceVolume,
                  voiceSpeed:
                    typeof profile.voiceSpeed === 'number'
                      ? profile.voiceSpeed
                      : prev.voiceSpeed,
                  voicePitchSemitones:
                    typeof profile.voicePitchSemitones === 'number'
                      ? profile.voicePitchSemitones
                      : prev.voicePitchSemitones,
                  proactiveVoiceAlerts:
                    typeof profile.proactiveVoiceAlerts === 'boolean'
                      ? profile.proactiveVoiceAlerts
                      : prev.proactiveVoiceAlerts,
                  spokenToolUpdates:
                    typeof profile.spokenToolUpdates === 'boolean'
                      ? profile.spokenToolUpdates
                      : prev.spokenToolUpdates,
                  soundFeedbackEnabled:
                    typeof profile.soundFeedbackEnabled === 'boolean'
                      ? profile.soundFeedbackEnabled
                      : prev.soundFeedbackEnabled,
                  desktopAwarenessEnabled:
                    typeof profile.desktopAwarenessEnabled === 'boolean'
                      ? profile.desktopAwarenessEnabled
                      : prev.desktopAwarenessEnabled,
                  preferredLanguage: profile.preferredLanguage || prev.preferredLanguage,
                  voiceLanguage: profile.preferredLanguage || prev.voiceLanguage,
                  voiceMoodDefault: profile.voiceMoodDefault || prev.voiceMoodDefault,
                };
              });
              if (profile.environment) {
                setAssistantState((prev) => ({
                  ...prev,
                  environment: profile.environment!,
                }));
              }
            },
            onMemories: (memories) => {
              const cloudSeedKey = `jarvis_hasan_cloud_seeded_v2_${nextUser.uid}`;
              let alreadySeededCloud = false;
              try {
                alreadySeededCloud = Boolean(localStorage.getItem(cloudSeedKey));
              } catch {
                alreadySeededCloud = true;
              }
              if (!alreadySeededCloud) {
                try {
                  localStorage.setItem(cloudSeedKey, 'true');
                } catch {
                  // ignore
                }
                const existingById = new Map(memories.map((m) => [m.id, m]));
                const existingKeys = new Set(memories.map((m) => m.key.toLowerCase()));
                for (const fact of HASAN_PROFILE_MEMORIES) {
                  const prior = existingById.get(fact.id);
                  if (prior) {
                    if (prior.value !== fact.value || prior.key !== fact.key) {
                      void saveCloudMemory(nextUser.uid, { ...fact, isNew: false }).catch(() => {
                        // ignore transient seed update errors
                      });
                    }
                  } else if (!existingKeys.has(fact.key.toLowerCase())) {
                    void saveCloudMemory(nextUser.uid, { ...fact, isNew: true }).catch(() => {
                      // ignore transient seed create errors
                    });
                  }
                }
              }
              setAssistantState((prev) => ({
                ...prev,
                memory: memories,
              }));
            },
            onTasks: (tasks) => {
              setAssistantState((prev) => ({
                ...prev,
                tasks,
              }));
            },
            onHistory: (searchHistory) => {
              setAssistantState((prev) => ({
                ...prev,
                searchHistory,
              }));
            },
            onError: (err) => {
              setCloudError(err.message);
            },
          });

          unsubKnowledge = subscribeUserKnowledgeAndIntegrations(nextUser.uid, {
            onDocs: (docs) => setKnowledgeDocs(docs),
            onChunks: (chunks) => setKnowledgeChunks(chunks),
            onIntegrations: (items) => {
              setIntegrations(items);
              const haMeta = items.find((item) => item.provider === 'home_assistant');
              if (haMeta?.baseUrl) {
                setHaBaseUrl(haMeta.baseUrl);
              }
            },
            onAuditLogs: (cloudLogs) => {
              setExecutionLogs((prev) => {
                const seen = new Set(cloudLogs.map((l) => l.id));
                return [...cloudLogs, ...prev.filter((l) => !seen.has(l.id))].slice(0, 120);
              });
            },
            onError: (err) => setCloudError(err.message),
          });

          unsubStudios = subscribeUserStudioCollections(nextUser.uid, {
            onSkills: (items) => setSkills(items),
            onProjects: (items) => setProjects(items),
            onBugReports: (items) => setBugReports(items),
            onCreativeAssets: (items) => setCreativeAssets(items),
            onContacts: (items) => setContacts(items),
            onCallLogs: (items) => setCallLogs(items),
            onWorkflows: (items) => setWorkflows(items),
            onAgentRuns: (items) => setAgentRuns(items),
            onError: (err) => setCloudError(err.message),
          });
        } catch (err) {
          setCloudError(
            err instanceof Error ? err.message : 'Unable to connect Cloud Firestore.'
          );
        }
      })();
    });

    return () => {
      cancelled = true;
      unsubAuth();
      if (unsubCollections) unsubCollections();
      if (unsubKnowledge) unsubKnowledge();
      if (unsubStudios) unsubStudios();
    };
  }, []);

  const hasRunningTimer = assistantState.timers.some(
    (t) => t.running && t.remainingSeconds > 0
  );

  // Real-time 1-second background timer countdown tick + proactive alert trigger
  useEffect(() => {
    if (!hasRunningTimer) return;

    const interval = window.setInterval(() => {
      const completingNow = assistantStateRef.current.timers.filter(
        (t) => t.running && t.remainingSeconds === 1
      );
      setAssistantState((prev) => ({
        ...prev,
        timers: prev.timers.map((t) => {
          if (!t.running || t.remainingSeconds <= 0) return t;
          const next = t.remainingSeconds - 1;
          return {
            ...t,
            remainingSeconds: next,
            running: next > 0,
          };
        }),
      }));
      if (completingNow.length > 0) {
        const first = completingNow[0];
        setLatestAlert({
          id: `alert_timer_${first.id}_${Date.now()}`,
          title: `Timer complete: ${first.label}`,
          spokenText: `${first.label} is complete.`,
          kind: 'timer',
          createdAt: new Date().toISOString(),
        });
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [hasRunningTimer]);

  const handleSignIn = useCallback(() => {
    setCloudError(null);
    void signInWithGoogle().catch((err) => {
      setCloudError(
        err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.'
      );
    });
  }, []);

  const handleSignOut = useCallback(() => {
    setCloudError(null);
    void signOutUser().catch((err) => {
      setCloudError(err instanceof Error ? err.message : 'Sign-out failed.');
    });
  }, []);

  // Sync voice-initiated Live state mutations to React + Firestore
  const handleSyncState = useCallback((nextState: AssistantState) => {
    const prev = assistantStateRef.current;
    setAssistantState(nextState);

    const activeUser = userRef.current;
    if (!activeUser) return;

    const prevTaskMap = new Map<string, TaskItem>(prev.tasks.map((t) => [t.id, t]));
    const nextTaskMap = new Map<string, TaskItem>(nextState.tasks.map((t) => [t.id, t]));
    for (const task of nextState.tasks) {
      const prior = prevTaskMap.get(task.id);
      if (
        !prior ||
        prior.title !== task.title ||
        prior.priority !== task.priority ||
        prior.completed !== task.completed ||
        prior.dueLabel !== task.dueLabel
      ) {
        void saveCloudTask(activeUser.uid, { ...task, isNew: !prior }).catch((err) =>
          setCloudError(err instanceof Error ? err.message : 'Task sync failed.')
        );
      }
    }
    for (const oldTask of prev.tasks) {
      if (!nextTaskMap.has(oldTask.id)) {
        void deleteCloudTask(activeUser.uid, oldTask.id).catch((err) =>
          setCloudError(err instanceof Error ? err.message : 'Task delete sync failed.')
        );
      }
    }

    const prevMemMap = new Map<string, MemoryFact>(prev.memory.map((m) => [m.id, m]));
    for (const fact of nextState.memory) {
      const prior = prevMemMap.get(fact.id);
      if (
        !prior ||
        prior.key !== fact.key ||
        prior.value !== fact.value ||
        prior.category !== fact.category ||
        prior.approved !== fact.approved
      ) {
        void saveCloudMemory(activeUser.uid, { ...fact, isNew: !prior }).catch((err) =>
          setCloudError(err instanceof Error ? err.message : 'Memory sync failed.')
        );
      }
    }

    if (
      prev.environment.lightBrightness !== nextState.environment.lightBrightness ||
      prev.environment.lightTemperature !== nextState.environment.lightTemperature ||
      prev.environment.thermostatCelsius !== nextState.environment.thermostatCelsius ||
      prev.environment.focusMode !== nextState.environment.focusMode
    ) {
      void updateCloudUserProfile(activeUser.uid, {
        environment: nextState.environment,
      }).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Environment sync failed.')
      );
    }
  }, []);

  const handleUpdateConfig: React.Dispatch<React.SetStateAction<AssistantConfig>> =
    useCallback((updater) => {
      setConfig((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const activeUser = userRef.current;
        if (
          activeUser &&
          (prev.aiMode !== next.aiMode ||
            prev.voiceName !== next.voiceName ||
            prev.continuousMode !== next.continuousMode ||
            prev.memoryEnabled !== next.memoryEnabled ||
            prev.personaId !== next.personaId ||
            prev.agentVoiceProfileId !== next.agentVoiceProfileId ||
            prev.agentVoiceStyle !== next.agentVoiceStyle ||
            prev.voiceVolume !== next.voiceVolume ||
            prev.voiceSpeed !== next.voiceSpeed ||
            prev.voicePitchSemitones !== next.voicePitchSemitones ||
            prev.proactiveVoiceAlerts !== next.proactiveVoiceAlerts ||
            prev.spokenToolUpdates !== next.spokenToolUpdates ||
            prev.soundFeedbackEnabled !== next.soundFeedbackEnabled ||
            prev.desktopAwarenessEnabled !== next.desktopAwarenessEnabled ||
            prev.preferredLanguage !== next.preferredLanguage ||
            prev.voiceLanguage !== next.voiceLanguage ||
            prev.voiceMoodDefault !== next.voiceMoodDefault)
        ) {
          void updateCloudUserProfile(activeUser.uid, {
            aiMode: next.aiMode,
            voiceName: next.voiceName,
            continuousMode: next.continuousMode,
            memoryEnabled: next.memoryEnabled,
            personaId: next.personaId,
            agentVoiceProfileId: next.agentVoiceProfileId,
            agentVoiceStyle: next.agentVoiceStyle,
            voiceVolume: next.voiceVolume,
            voiceSpeed: next.voiceSpeed,
            voicePitchSemitones: next.voicePitchSemitones,
            proactiveVoiceAlerts: next.proactiveVoiceAlerts,
            spokenToolUpdates: next.spokenToolUpdates,
            soundFeedbackEnabled: next.soundFeedbackEnabled,
            desktopAwarenessEnabled: next.desktopAwarenessEnabled,
            preferredLanguage: next.preferredLanguage || next.voiceLanguage,
            voiceMoodDefault: next.voiceMoodDefault || 'normal',
          }).catch((err) =>
            setCloudError(
              err instanceof Error ? err.message : 'Profile settings sync failed.'
            )
          );
        }
        return next;
      });
    }, []);

  const handleRecordSpokenTurn = useCallback(
    (
      speaker: 'user' | 'model',
      text: string,
      meta?: {
        aiMode?: AssistantConfig['aiMode'];
        memoriesUsed?: string[];
        citations?: KnowledgeCitation[];
        mood?: VoiceMood;
        scopeLabel?: AssistantMessage['scopeLabel'];
      }
    ) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_${speaker}`,
          role: speaker,
          text: cleaned,
          timestamp: formatTimeNow(),
          citations: meta?.citations,
          mood: meta?.mood,
          scopeLabel: meta?.scopeLabel,
        },
      ]);

      const activeUser = userRef.current;
      const aiMode = meta?.aiMode || configRef.current.aiMode;

      if (speaker === 'user') {
        const nowIso = new Date().toISOString();
        const normalized = cleaned.toLowerCase();
        const existing = assistantStateRef.current.searchHistory.find(
          (h) => h.query.trim().toLowerCase() === normalized
        );
        const id = existing?.id || `hist_${Date.now()}`;
        const runCount = (existing?.runCount || 0) + 1;

        setAssistantState((prev) => ({
          ...prev,
          searchHistory: [
            {
              id,
              query: cleaned,
              aiMode,
              memoriesUsed: meta?.memoriesUsed || existing?.memoriesUsed,
              createdAt: existing?.createdAt || nowIso,
              lastRunAt: nowIso,
              runCount,
            },
            ...prev.searchHistory.filter((h) => h.id !== id),
          ].slice(0, 50),
        }));

        if (activeUser) {
          void saveCloudHistoryItem(activeUser.uid, {
            id,
            query: cleaned,
            aiMode,
            memoriesUsed: meta?.memoriesUsed || existing?.memoriesUsed,
            runCount,
            isNew: !existing,
          }).catch((err) =>
            setCloudError(err instanceof Error ? err.message : 'History sync failed.')
          );
        }
      } else if (speaker === 'model') {
        const latestUserItem = assistantStateRef.current.searchHistory[0];
        if (latestUserItem) {
          const preview = cleaned.slice(0, 1500);
          setAssistantState((prev) => ({
            ...prev,
            searchHistory: prev.searchHistory.map((item, idx) =>
              idx === 0 ? { ...item, responsePreview: preview } : item
            ),
          }));
          if (activeUser) {
            void saveCloudHistoryItem(activeUser.uid, {
              id: latestUserItem.id,
              query: latestUserItem.query,
              responsePreview: preview,
              aiMode: latestUserItem.aiMode || aiMode,
              memoriesUsed: latestUserItem.memoriesUsed,
              runCount: latestUserItem.runCount,
              isNew: false,
            }).catch(() => {
              // ignore preview update failures if record was deleted
            });
          }
        }
      }
    },
    []
  );

  const handleAddTask = useCallback(
    (title: string, priority: TaskPriority, dueLabel?: string) => {
      const cleaned = title.trim();
      if (!cleaned) return;
      const nowIso = new Date().toISOString();
      const newTask: TaskItem = {
        id: `task_${Date.now()}`,
        title: cleaned,
        priority,
        completed: false,
        dueLabel: dueLabel?.trim() || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setAssistantState((prev) => ({
        ...prev,
        tasks: [newTask, ...prev.tasks],
      }));
      if (userRef.current) {
        void saveCloudTask(userRef.current.uid, { ...newTask, isNew: true }).catch((err) =>
          setCloudError(err instanceof Error ? err.message : 'Failed to save task.')
        );
      }
    },
    []
  );

  const handleToggleTask = useCallback((taskId: string) => {
    const existing = assistantStateRef.current.tasks.find((t) => t.id === taskId);
    if (!existing) return;
    const updated: TaskItem = {
      ...existing,
      completed: !existing.completed,
      updatedAt: new Date().toISOString(),
    };
    setAssistantState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === taskId ? updated : t)),
    }));
    if (userRef.current) {
      void saveCloudTask(userRef.current.uid, { ...updated, isNew: false }).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to update task.')
      );
    }
  }, []);

  const handleDeleteTask = useCallback((taskId: string) => {
    setAssistantState((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== taskId),
    }));
    if (userRef.current) {
      void deleteCloudTask(userRef.current.uid, taskId).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to delete task.')
      );
    }
  }, []);

  const handleAddOrUpdateMemory = useCallback(
    (fact: { id?: string; key: string; value: string; category: MemoryCategory }) => {
      const cleanedKey = fact.key.trim();
      const cleanedVal = fact.value.trim();
      if (!cleanedKey || !cleanedVal) return;

      const existing = fact.id
        ? assistantStateRef.current.memory.find((m) => m.id === fact.id)
        : assistantStateRef.current.memory.find(
            (m) => m.key.toLowerCase() === cleanedKey.toLowerCase()
          );

      const nowIso = new Date().toISOString();
      const target: MemoryFact = {
        id: existing?.id || `mem_${Date.now()}`,
        key: cleanedKey,
        value: cleanedVal,
        category: fact.category,
        approved: true,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      setAssistantState((prev) => ({
        ...prev,
        memory: [target, ...prev.memory.filter((m) => m.id !== target.id)],
      }));

      if (userRef.current) {
        void saveCloudMemory(userRef.current.uid, {
          ...target,
          isNew: !existing,
        }).catch((err) =>
          setCloudError(err instanceof Error ? err.message : 'Failed to save memory.')
        );
      }
    },
    []
  );

  const handleDeleteMemory = useCallback((memoryId: string) => {
    setAssistantState((prev) => ({
      ...prev,
      memory: prev.memory.filter((m) => m.id !== memoryId),
    }));
    if (userRef.current) {
      void deleteCloudMemory(userRef.current.uid, memoryId).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to delete memory.')
      );
    }
  }, []);

  const handleClearAllMemories = useCallback(() => {
    const ids = assistantStateRef.current.memory.map((m) => m.id);
    setAssistantState((prev) => ({
      ...prev,
      memory: [],
    }));
    if (userRef.current && ids.length > 0) {
      void clearAllCloudMemories(userRef.current.uid, ids).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to clear memories.')
      );
    }
  }, []);

  const handleDeleteHistoryItem = useCallback((historyId: string) => {
    setAssistantState((prev) => ({
      ...prev,
      searchHistory: prev.searchHistory.filter((h) => h.id !== historyId),
    }));
    if (userRef.current) {
      void deleteCloudHistoryItem(userRef.current.uid, historyId).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to delete history item.')
      );
    }
  }, []);

  const handleUpdateEnvironment = useCallback(
    (patch: Partial<AssistantState['environment']>) => {
      const nextEnv = {
        ...assistantStateRef.current.environment,
        ...patch,
      };
      setAssistantState((prev) => ({
        ...prev,
        environment: nextEnv,
      }));
      if (userRef.current) {
        void updateCloudUserProfile(userRef.current.uid, {
          environment: nextEnv,
        }).catch((err) =>
          setCloudError(
            err instanceof Error ? err.message : 'Failed to update environment.'
          )
        );
      }
    },
    []
  );

  const handleConsumePendingPrompt = useCallback(() => {
    setPendingVoicePrompt(null);
  }, []);

  const handleRequestNotificationPermission = useCallback(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    void window.Notification.requestPermission()
      .then((perm) => setNotificationPermission(perm))
      .catch(() => {});
  }, []);

  const handleCreateSchedule = useCallback(
    async (input: {
      kind: ScheduleKind;
      title: string;
      triggerAt: string;
      durationSeconds?: number;
      recurrence?: ScheduleRecurrence;
    }): Promise<{ item: ScheduledItem; duplicate: boolean } | null> => {
      try {
        const res = await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            item: ScheduledItem;
            duplicate: boolean;
            items?: ScheduledItem[];
          };
          if (Array.isArray(data.items)) {
            setSchedules(data.items);
          }
          return { item: data.item, duplicate: data.duplicate };
        }
      } catch {
        // offline fallback below
      }
      const nowIso = new Date().toISOString();
      const localItem: ScheduledItem = {
        id: `sched_loc_${Date.now()}`,
        kind: input.kind,
        title: input.title,
        triggerAt: input.triggerAt,
        durationSeconds: input.durationSeconds,
        recurrence: input.recurrence || 'once',
        status: 'scheduled',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setSchedules((prev) => [localItem, ...prev]);
      return { item: localItem, duplicate: false };
    },
    []
  );

  const handleUpdateSchedule = useCallback(
    async (
      id: string,
      patch: {
        title?: string;
        triggerAt?: string;
        snoozeMinutes?: number;
        status?: ScheduledItem['status'];
        paused?: boolean;
        restart?: boolean;
      }
    ) => {
      try {
        const res = await fetch(`/api/schedules/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const data = (await res.json()) as { items?: ScheduledItem[] };
          if (Array.isArray(data.items)) {
            setSchedules(data.items);
            return;
          }
        }
      } catch {
        // offline fallback
      }
      setSchedules((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          if (patch.restart && item.durationSeconds) {
            return {
              ...item,
              paused: false,
              remainingSecondsWhenPaused: undefined,
              status: 'scheduled',
              triggerAt: new Date(Date.now() + item.durationSeconds * 1000).toISOString(),
              updatedAt: new Date().toISOString(),
            };
          }
          if (typeof patch.paused === 'boolean') {
            if (patch.paused && !item.paused) {
              const remaining = Math.max(
                1,
                Math.ceil((new Date(item.triggerAt).getTime() - Date.now()) / 1000)
              );
              return {
                ...item,
                paused: true,
                remainingSecondsWhenPaused: remaining,
                updatedAt: new Date().toISOString(),
              };
            }
            if (!patch.paused && item.paused) {
              const remaining = item.remainingSecondsWhenPaused || item.durationSeconds || 60;
              return {
                ...item,
                paused: false,
                remainingSecondsWhenPaused: undefined,
                triggerAt: new Date(Date.now() + remaining * 1000).toISOString(),
                updatedAt: new Date().toISOString(),
              };
            }
          }
          const nextTrigger =
            patch.snoozeMinutes && patch.snoozeMinutes > 0
              ? new Date(Date.now() + patch.snoozeMinutes * 60_000).toISOString()
              : patch.triggerAt || item.triggerAt;
          return {
            ...item,
            title: patch.title ?? item.title,
            triggerAt: nextTrigger,
            status: patch.snoozeMinutes
              ? 'snoozed'
              : patch.status ?? item.status,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    },
    []
  );

  const handleDeleteSchedule = useCallback(async (id: string) => {
    setSchedules((prev) => prev.filter((item) => item.id !== id));
    try {
      const res = await fetch(`/api/schedules/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = (await res.json()) as { items?: ScheduledItem[] };
        if (Array.isArray(data.items)) setSchedules(data.items);
      }
    } catch {
      // ignore offline
    }
  }, []);

  const handleRecordExecutionLog = useCallback(
    (entry: {
      command: string;
      intent: string;
      source: ExecutionLogEntry['source'];
      status: ExecutionLogEntry['status'];
      detail: string;
      verified: boolean;
    }) => {
      const optimistic: ExecutionLogEntry = {
        ...entry,
        id: `log_loc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        createdAt: new Date().toISOString(),
      };
      setExecutionLogs((prev) => [optimistic, ...prev].slice(0, 120));
      if (userRef.current) {
        void saveCloudAuditLog(userRef.current.uid, optimistic).catch(() => {});
      }
      void fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
        .then(async (r) => {
          if (r.ok) {
            const data = (await r.json()) as { entry?: ExecutionLogEntry };
            if (data.entry) {
              setExecutionLogs((prev) => [
                data.entry!,
                ...prev.filter((item) => item.id !== optimistic.id && item.id !== data.entry!.id),
              ].slice(0, 120));
            }
          }
        })
        .catch(() => {});
    },
    []
  );

  const handleClearExecutionLogs = useCallback(() => {
    setExecutionLogs([]);
    void fetch('/api/logs', { method: 'DELETE' }).catch(() => {});
  }, []);

  const getOptionalAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // optional auth
    }
    return headers;
  }, []);

  const handleUploadKnowledgeFile = useCallback(
    async (file: File) => {
      setKnowledgeUploading(true);
      setKnowledgeError(null);
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        const contentBase64 = btoa(binary);
        const headers = await getOptionalAuthHeaders();
        const res = await fetch('/api/knowledge/extract-embed', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'text/plain',
            byteSize: file.size,
            contentBase64,
          }),
        });
        const data = (await res.json()) as {
          doc?: KnowledgeDocItem;
          chunks?: KnowledgeChunkItem[];
          error?: string;
        };
        if (!res.ok || !data.doc || !Array.isArray(data.chunks)) {
          throw new Error(data.error || 'Failed to index document.');
        }

        const activeUser = userRef.current;
        const docItem: KnowledgeDocItem = {
          ...data.doc,
          userId: activeUser?.uid,
        };
        const chunkItems: KnowledgeChunkItem[] = data.chunks.map((c) => ({
          ...c,
          userId: activeUser?.uid,
        }));

        if (activeUser) {
          // Security invariant: create KnowledgeDoc BEFORE KnowledgeChunk batch so rules exist() passes
          await saveCloudKnowledgeDoc(activeUser.uid, docItem);
          await saveCloudKnowledgeChunksBatch(activeUser.uid, chunkItems);
        } else {
          setKnowledgeDocs((prev) => [docItem, ...prev.filter((d) => d.id !== docItem.id)]);
          setKnowledgeChunks((prev) => [
            ...chunkItems,
            ...prev.filter((c) => c.docId !== docItem.id),
          ]);
        }
      } catch (err) {
        setKnowledgeError(err instanceof Error ? err.message : 'Document indexing failed.');
      } finally {
        setKnowledgeUploading(false);
      }
    },
    [getOptionalAuthHeaders]
  );

  const handleToggleKnowledgeDoc = useCallback(async (docId: string, enabled: boolean) => {
    setKnowledgeDocs((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, enabled } : d))
    );
    if (userRef.current) {
      await toggleCloudKnowledgeDoc(userRef.current.uid, docId, enabled).catch((err) =>
        setKnowledgeError(err instanceof Error ? err.message : 'Toggle failed.')
      );
    }
  }, []);

  const handleDeleteKnowledgeDoc = useCallback(
    async (docId: string) => {
      const chunkIds = knowledgeChunks.filter((c) => c.docId === docId).map((c) => c.id);
      setKnowledgeDocs((prev) => prev.filter((d) => d.id !== docId));
      setKnowledgeChunks((prev) => prev.filter((c) => c.docId !== docId));
      if (userRef.current) {
        await deleteCloudKnowledgeDocWithChunks(userRef.current.uid, docId, chunkIds).catch(
          (err) => setKnowledgeError(err instanceof Error ? err.message : 'Delete failed.')
        );
      }
    },
    [knowledgeChunks]
  );

  const handleConnectHomeAssistant = useCallback(
    async (baseUrl: string, token: string) => {
      setHaBusy(true);
      setHaError(null);
      try {
        const headers = await getOptionalAuthHeaders();
        const res = await fetch('/api/home-assistant/validate', {
          method: 'POST',
          headers,
          body: JSON.stringify({ baseUrl, token }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          entities?: HomeAssistantEntity[];
          message?: string;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || data.message || 'Unable to connect Home Assistant.');
        }
        haTokenRef.current = token.trim();
        setHaBaseUrl(baseUrl.trim());
        setHaConnected(true);
        setHaEntities(Array.isArray(data.entities) ? data.entities : []);

        if (userRef.current) {
          await saveCloudIntegrationStatus(userRef.current.uid, {
            id: 'ha_primary',
            userId: userRef.current.uid,
            provider: 'home_assistant',
            label: 'Home Assistant',
            baseUrl: baseUrl.trim(),
            status: 'connected',
            entityCount: Array.isArray(data.entities) ? data.entities.length : 0,
            lastVerifiedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        setHaError(err instanceof Error ? err.message : 'Home Assistant pairing failed.');
      } finally {
        setHaBusy(false);
      }
    },
    [getOptionalAuthHeaders]
  );

  const handleRefreshHomeAssistant = useCallback(async () => {
    if (!haTokenRef.current || !haBaseUrl) return;
    setHaBusy(true);
    setHaError(null);
    try {
      const headers = await getOptionalAuthHeaders();
      const res = await fetch('/api/home-assistant/states', {
        method: 'POST',
        headers,
        body: JSON.stringify({ baseUrl: haBaseUrl, token: haTokenRef.current }),
      });
      const data = (await res.json()) as { entities?: HomeAssistantEntity[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Sync failed.');
      if (Array.isArray(data.entities)) setHaEntities(data.entities);
    } catch (err) {
      setHaError(err instanceof Error ? err.message : 'Unable to refresh entities.');
    } finally {
      setHaBusy(false);
    }
  }, [getOptionalAuthHeaders, haBaseUrl]);

  const handleDisconnectHomeAssistant = useCallback(async () => {
    haTokenRef.current = '';
    setHaConnected(false);
    setHaEntities([]);
    setHaError(null);
    if (userRef.current) {
      await deleteCloudIntegrationStatus(userRef.current.uid, 'ha_primary').catch(() => {});
    }
  }, []);

  const handleToggleHomeAssistantEntity = useCallback(
    async (entity: HomeAssistantEntity) => {
      if (!haTokenRef.current || !haBaseUrl) {
        setHaError('Re-enter your Home Assistant token for this browser session.');
        return;
      }
      const isCurrentlyOn =
        entity.state === 'on' ||
        entity.state === 'heat' ||
        entity.state === 'cool' ||
        entity.state === 'open';
      const service =
        entity.domain === 'cover'
          ? isCurrentlyOn
            ? 'close_cover'
            : 'open_cover'
          : isCurrentlyOn
          ? 'turn_off'
          : 'turn_on';
      const headers = await getOptionalAuthHeaders();
      const res = await fetch('/api/home-assistant/service', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          baseUrl: haBaseUrl,
          token: haTokenRef.current,
          domain: entity.domain,
          service,
          entityId: entity.entityId,
        }),
      });
      if (res.ok) {
        await handleRefreshHomeAssistant();
      } else {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        setHaError(errBody.error || 'Failed to toggle device.');
      }
    },
    [getOptionalAuthHeaders, haBaseUrl, handleRefreshHomeAssistant]
  );

  const handleCallHomeAssistantService = useCallback(
    async (params: {
      domain: string;
      service: string;
      entityId: string;
      data?: Record<string, unknown>;
    }): Promise<{ ok: boolean; message: string }> => {
      if (!haTokenRef.current || !haBaseUrl) {
        return {
          ok: false,
          message: 'Home Assistant is not paired in this session. Open Smart Home panel to connect.',
        };
      }
      const headers = await getOptionalAuthHeaders();
      const res = await fetch('/api/home-assistant/service', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          baseUrl: haBaseUrl,
          token: haTokenRef.current,
          ...params,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && body.ok) {
        await handleRefreshHomeAssistant();
        return { ok: true, message: body.message || 'Smart home command executed.' };
      }
      return { ok: false, message: body.error || body.message || 'Smart home action failed.' };
    },
    [getOptionalAuthHeaders, haBaseUrl, handleRefreshHomeAssistant]
  );

  const handleCreateMonitor = useCallback(
    async (input: {
      query: string;
      officialOnly?: boolean;
      intervalMinutes?: number;
    }): Promise<{
      topic: MonitorTopic;
      duplicate: boolean;
      initialUpdate?: MonitorUpdateItem | null;
    } | null> => {
      try {
        const res = await fetch('/api/monitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          topic: MonitorTopic;
          duplicate: boolean;
          initialUpdate?: MonitorUpdateItem | null;
          topics?: MonitorTopic[];
          updates?: MonitorUpdateItem[];
        };
        if (Array.isArray(data.topics)) setMonitorTopics(data.topics);
        if (Array.isArray(data.updates)) setMonitorUpdates(data.updates);
        return {
          topic: data.topic,
          duplicate: data.duplicate,
          initialUpdate: data.initialUpdate,
        };
      } catch {
        return null;
      }
    },
    []
  );

  const handleUpdateMonitor = useCallback(
    async (
      id: string,
      patch: { status?: 'active' | 'paused'; officialOnly?: boolean; intervalMinutes?: number }
    ) => {
      try {
        const res = await fetch(`/api/monitors/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            topics?: MonitorTopic[];
            updates?: MonitorUpdateItem[];
          };
          if (Array.isArray(data.topics)) setMonitorTopics(data.topics);
          if (Array.isArray(data.updates)) setMonitorUpdates(data.updates);
        }
      } catch {
        // ignore network errors
      }
    },
    []
  );

  const handleDeleteMonitor = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/monitors/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = (await res.json()) as {
          topics?: MonitorTopic[];
          updates?: MonitorUpdateItem[];
        };
        if (Array.isArray(data.topics)) setMonitorTopics(data.topics);
        if (Array.isArray(data.updates)) setMonitorUpdates(data.updates);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleCheckMonitorNow = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/monitors/${encodeURIComponent(id)}/check`, {
        method: 'POST',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        update?: MonitorUpdateItem | null;
        topics?: MonitorTopic[];
        updates?: MonitorUpdateItem[];
      };
      if (Array.isArray(data.topics)) setMonitorTopics(data.topics);
      if (Array.isArray(data.updates)) setMonitorUpdates(data.updates);
      return data.update || null;
    } catch {
      return null;
    }
  }, []);

  const handlePauseAllMonitors = useCallback(async () => {
    const res = await fetch('/api/monitors/pause-all', { method: 'POST' }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { topics?: MonitorTopic[] };
      if (Array.isArray(data.topics)) setMonitorTopics(data.topics);
    }
  }, []);

  const handleResumeAllMonitors = useCallback(async () => {
    const res = await fetch('/api/monitors/resume-all', { method: 'POST' }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { topics?: MonitorTopic[] };
      if (Array.isArray(data.topics)) setMonitorTopics(data.topics);
    }
  }, []);

  const handleSetOfficialOnlyMonitors = useCallback(async (officialOnly: boolean) => {
    const res = await fetch('/api/monitors/official-only', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officialOnly }),
    }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { topics?: MonitorTopic[] };
      if (Array.isArray(data.topics)) setMonitorTopics(data.topics);
    }
  }, []);

  const handleExecuteBrowserAction = useCallback(
    async (req: {
      action: string;
      url?: string;
      engine?: 'google' | 'youtube' | 'bing' | 'duckduckgo';
      query?: string;
      resultIndex?: number;
      direction?: 'down' | 'up' | 'top' | 'bottom';
      targetText?: string;
      confirmedSensitive?: boolean;
    }): Promise<{ ok: boolean; message: string; state: BrowserAutomationSnapshot }> => {
      const res = await fetch('/api/browser/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      const data = (await res.json()) as {
        ok: boolean;
        spokenMessage?: string;
        message?: string;
        snapshot?: BrowserAutomationSnapshot;
        state?: BrowserAutomationSnapshot;
      };
      const snap = data.snapshot || data.state;
      if (snap) setBrowserSnapshot(snap);
      return {
        ok: Boolean(data.ok),
        message: data.spokenMessage || data.message || '',
        state: snap as BrowserAutomationSnapshot,
      };
    },
    []
  );

  const handleAbortBrowserAction = useCallback(async () => {
    const res = await fetch('/api/browser/abort', { method: 'POST' }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as {
        snapshot?: BrowserAutomationSnapshot;
        state?: BrowserAutomationSnapshot;
      };
      const snap = data.snapshot || data.state;
      if (snap) setBrowserSnapshot(snap);
    }
  }, []);

  const handleTriggerLocalIncomingCall = useCallback(
    (callerName: string, appSource = 'Phone Link Bridge') => {
      const vips = (configRef.current.callConfig?.vipContacts || []).map((v) =>
        v.toLowerCase()
      );
      const isVip = vips.some((v) => callerName.toLowerCase().includes(v));
      const callObj: IncomingCallEvent = {
        id: `call_${Date.now()}`,
        callerName: callerName.trim() || 'Unknown Caller',
        appSource,
        status: 'ringing',
        isVip,
        receivedAt: new Date().toISOString(),
      };
      setIncomingCall(callObj);
      deliverProactiveAlert({
        id: callObj.id,
        title: `Incoming Call: ${callObj.callerName}`,
        spokenText: `Hasan, incoming call from ${callObj.callerName}.`,
        kind: 'call',
        createdAt: callObj.receivedAt,
      });
    },
    [deliverProactiveAlert]
  );

  // Studio CRUD Handlers (Optimistic Local + Firestore Sync)
  const handleSaveSkill = useCallback(async (skill: SkillDefinition, isUpdate = false) => {
    setSkills((prev) => [skill, ...prev.filter((s) => s.id !== skill.id)]);
    if (userRef.current) {
      await saveCloudSkill(userRef.current.uid, skill, isUpdate).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to save skill.')
      );
    }
  }, []);

  const handleSaveSkillVersion = useCallback(async (entry: SkillVersionEntry) => {
    if (userRef.current) {
      await saveCloudSkillVersion(userRef.current.uid, entry).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to save skill version.')
      );
    }
  }, []);

  const handleDeleteSkill = useCallback(async (skillId: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== skillId));
    if (userRef.current) {
      await deleteCloudSkill(userRef.current.uid, skillId).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to delete skill.')
      );
    }
  }, []);

  const handleSaveProject = useCallback(async (project: ProjectEntry, isUpdate = false) => {
    setProjects((prev) => [project, ...prev.filter((p) => p.id !== project.id)]);
    if (userRef.current) {
      await saveCloudProject(userRef.current.uid, project, isUpdate).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to save project.')
      );
    }
  }, []);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (userRef.current) {
      await deleteCloudProject(userRef.current.uid, projectId).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to delete project.')
      );
    }
  }, []);

  const handleSaveBugReport = useCallback(async (report: BugFixReport, isUpdate = false) => {
    setBugReports((prev) => [report, ...prev.filter((r) => r.id !== report.id)]);
    if (userRef.current) {
      await saveCloudBugReport(userRef.current.uid, report, isUpdate).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to save bug report.')
      );
    }
  }, []);

  const handleSaveCreativeAsset = useCallback(
    async (assetInput: Omit<CreativeAssetEntry, 'createdAt' | 'updatedAt'>) => {
      const nowIso = new Date().toISOString();
      let isUpdate = false;
      let fullAsset: CreativeAssetEntry = {
        ...assetInput,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setCreativeAssets((prev) => {
        const existing = prev.find((a) => a.id === assetInput.id);
        isUpdate = Boolean(existing);
        fullAsset = {
          ...assetInput,
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso,
        };
        return [fullAsset, ...prev.filter((a) => a.id !== assetInput.id)];
      });
      if (userRef.current) {
        await saveCloudCreativeAsset(userRef.current.uid, fullAsset, isUpdate).catch((err) =>
          setCloudError(err instanceof Error ? err.message : 'Failed to save creative asset.')
        );
      }
    },
    []
  );

  const handleDeleteCreativeAsset = useCallback(async (assetId: string) => {
    setCreativeAssets((prev) => prev.filter((a) => a.id !== assetId));
    if (userRef.current) {
      await deleteCloudCreativeAsset(userRef.current.uid, assetId).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to delete creative asset.')
      );
    }
  }, []);

  const handleSaveContact = useCallback(async (contact: ContactEntry, isUpdate = false) => {
    setContacts((prev) => [contact, ...prev.filter((c) => c.id !== contact.id)]);
    if (userRef.current) {
      await saveCloudContact(userRef.current.uid, contact, isUpdate).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to save contact.')
      );
    }
  }, []);

  const handleDeleteContact = useCallback(async (contactId: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
    if (userRef.current) {
      await deleteCloudContact(userRef.current.uid, contactId).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to delete contact.')
      );
    }
  }, []);

  const handleLogCall = useCallback(async (entry: CallLogEntry) => {
    setCallLogs((prev) => [entry, ...prev.filter((c) => c.id !== entry.id)].slice(0, 80));
    if (userRef.current) {
      await saveCloudCallLog(userRef.current.uid, entry).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to save call log.')
      );
    }
  }, []);

  const handleSaveWorkflow = useCallback(async (wf: AutomationWorkflow, isUpdate = false) => {
    setWorkflows((prev) => [wf, ...prev.filter((w) => w.id !== wf.id)]);
    if (userRef.current) {
      await saveCloudWorkflow(userRef.current.uid, wf, isUpdate).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to save workflow.')
      );
    }
  }, []);

  const handleDeleteWorkflow = useCallback(async (workflowId: string) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
    if (userRef.current) {
      await deleteCloudWorkflow(userRef.current.uid, workflowId).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to delete workflow.')
      );
    }
  }, []);

  const handleSaveAgentRun = useCallback(async (run: MultiAgentRun, isUpdate = false) => {
    setAgentRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)].slice(0, 40));
    if (userRef.current) {
      await saveCloudAgentRun(userRef.current.uid, run, isUpdate).catch((err) =>
        setCloudError(err instanceof Error ? err.message : 'Failed to save agent run.')
      );
    }
  }, []);

  const handleRunBriefing = () => {
    setActiveSection('sandbox');
    setPendingVoicePrompt(
      'Give me a crisp spoken status briefing covering my open high-priority tasks, active timers, stored memory context, and current room environment.'
    );
  };

  const handleOpenSandboxWithPrompt = (prompt: string) => {
    setActiveSection('sandbox');
    setPendingVoicePrompt(prompt);
  };

  const handleToggleGuideStep = (stepId: string) => {
    setCompletedStepIds((prev) =>
      prev.includes(stepId) ? prev.filter((id) => id !== stepId) : [...prev, stepId]
    );
  };

  const handleRestoreSession = (snapshot: AssistantSessionSnapshot) => {
    setMessages(snapshot.messages);
    handleUpdateConfig((prev) => ({
      ...normalizeLoadedConfig(snapshot.config),
      picovoiceAccessKey: prev.picovoiceAccessKey,
      companionUrl: prev.companionUrl,
    }));
    handleSyncState(normalizeLoadedState(snapshot.state));
  };

  return (
    <AppErrorBoundary>
      <div
        className={`min-h-screen flex flex-col ${
          activeSection === 'sandbox'
            ? 'bg-[#03060c] text-slate-100'
            : 'bg-slate-50 text-slate-900'
        }`}
      >
        {mapsQuotaExceeded && (
          <div className="sticky top-0 z-50 bg-amber-950/95 border-b border-amber-500/40 px-4 py-2 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-2">
            <span>
              Google Maps Platform preview quota reached. Interactive maps are paused; other offline &amp; AI features remain active.
            </span>
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline text-amber-200 hover:text-white whitespace-nowrap"
            >
              View Quota Guide
            </a>
          </div>
        )}

        <TopNav
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          onRunBriefing={handleRunBriefing}
          isBusy={false}
        />

        <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 sm:py-6">
          {activeSection === 'sandbox' && (
            <LiveSandbox
              user={user}
              authLoading={authLoading}
              cloudError={cloudError}
              onSignIn={handleSignIn}
              onSignOut={handleSignOut}
              messages={messages}
              state={assistantState}
              config={config}
              pendingVoicePrompt={pendingVoicePrompt}
              onConsumePendingPrompt={handleConsumePendingPrompt}
              onSyncState={handleSyncState}
              onRecordSpokenTurn={handleRecordSpokenTurn}
              onUpdateConfig={handleUpdateConfig}
              onRestoreSession={handleRestoreSession}
              onAddTask={handleAddTask}
              onToggleTask={handleToggleTask}
              onDeleteTask={handleDeleteTask}
              onAddOrUpdateMemory={handleAddOrUpdateMemory}
              onDeleteMemory={handleDeleteMemory}
              onClearAllMemories={handleClearAllMemories}
              onDeleteHistoryItem={handleDeleteHistoryItem}
              onUpdateEnvironment={handleUpdateEnvironment}
              latestAlert={latestAlert}
              onDismissAlert={() => setLatestAlert(null)}
              schedules={schedules}
              executionLogs={executionLogs}
              quotaStatus={quotaStatus}
              notificationPermission={notificationPermission}
              onRequestNotificationPermission={handleRequestNotificationPermission}
              onCreateSchedule={handleCreateSchedule}
              onUpdateSchedule={handleUpdateSchedule}
              onDeleteSchedule={handleDeleteSchedule}
              onSyncSchedulesFromServer={setSchedules}
              onUpdateQuotaStatus={setQuotaStatus}
              onRecordExecutionLog={handleRecordExecutionLog}
              onClearExecutionLogs={handleClearExecutionLogs}
              onDeliverAlert={deliverProactiveAlert}
              monitorTopics={monitorTopics}
              monitorUpdates={monitorUpdates}
              onCreateMonitor={handleCreateMonitor}
              onUpdateMonitor={handleUpdateMonitor}
              onDeleteMonitor={handleDeleteMonitor}
              onCheckMonitorNow={handleCheckMonitorNow}
              onPauseAllMonitors={handlePauseAllMonitors}
              onResumeAllMonitors={handleResumeAllMonitors}
              onSetOfficialOnlyMonitors={handleSetOfficialOnlyMonitors}
              browserSnapshot={browserSnapshot}
              onExecuteBrowserAction={handleExecuteBrowserAction}
              onAbortBrowserAction={handleAbortBrowserAction}
              incomingCall={incomingCall}
              onUpdateIncomingCall={setIncomingCall}
              onTriggerLocalIncomingCall={handleTriggerLocalIncomingCall}
              mapsApiKey={mapsApiKey}
              mapsQuotaExceeded={mapsQuotaExceeded}
              knowledgeDocs={knowledgeDocs}
              knowledgeChunks={knowledgeChunks}
              knowledgeUploading={knowledgeUploading}
              knowledgeError={knowledgeError}
              onUploadKnowledgeFile={handleUploadKnowledgeFile}
              onToggleKnowledgeDoc={handleToggleKnowledgeDoc}
              onDeleteKnowledgeDoc={handleDeleteKnowledgeDoc}
              integrations={integrations}
              haConnected={haConnected}
              haBaseUrl={haBaseUrl}
              haEntities={haEntities}
              haBusy={haBusy}
              haError={haError}
              onConnectHomeAssistant={handleConnectHomeAssistant}
              onRefreshHomeAssistant={handleRefreshHomeAssistant}
              onDisconnectHomeAssistant={handleDisconnectHomeAssistant}
              onToggleHomeAssistantEntity={handleToggleHomeAssistantEntity}
              onCallHomeAssistantService={handleCallHomeAssistantService}
              getAuthHeaders={getOptionalAuthHeaders}
              skills={skills}
              projects={projects}
              bugReports={bugReports}
              creativeAssets={creativeAssets}
              contacts={contacts}
              callLogs={callLogs}
              workflows={workflows}
              agentRuns={agentRuns}
              onSaveSkill={handleSaveSkill}
              onSaveSkillVersion={handleSaveSkillVersion}
              onDeleteSkill={handleDeleteSkill}
              onSaveProject={handleSaveProject}
              onDeleteProject={handleDeleteProject}
              onSaveBugReport={handleSaveBugReport}
              onSaveCreativeAsset={handleSaveCreativeAsset}
              onDeleteCreativeAsset={handleDeleteCreativeAsset}
              onSaveContact={handleSaveContact}
              onDeleteContact={handleDeleteContact}
              onLogCall={handleLogCall}
              onSaveWorkflow={handleSaveWorkflow}
              onDeleteWorkflow={handleDeleteWorkflow}
              onSaveAgentRun={handleSaveAgentRun}
            />
          )}

          {activeSection === 'architecture' && (
            <ArchitectureView
              onOpenSandboxPrompt={handleOpenSandboxWithPrompt}
              onNavigateCode={() => setActiveSection('code')}
            />
          )}

          {activeSection === 'guide' && (
            <BuildGuideView
              completedStepIds={completedStepIds}
              onToggleStep={handleToggleGuideStep}
              onResetProgress={() => setCompletedStepIds([])}
              onTestInSandbox={handleOpenSandboxWithPrompt}
            />
          )}

          {activeSection === 'code' && <CodeGeneratorView />}
        </main>

        <footer
          className={`border-t ${
            activeSection === 'sandbox'
              ? 'border-cyan-500/15 bg-[#050912] text-slate-400'
              : 'border-slate-200 bg-white text-slate-500'
          }`}
        >
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span>
              J.A.R.V.I.S. — Ultimate Intelligence System · Voice AI & Engineering Lab
            </span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setActiveSection('sandbox')}
                className="hover:text-cyan-400 transition-colors"
              >
                Live Sandbox
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('architecture')}
                className="hover:text-cyan-400 transition-colors"
              >
                Architecture
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('guide')}
                className="hover:text-cyan-400 transition-colors"
              >
                Build Guide
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('code')}
                className="hover:text-cyan-400 transition-colors"
              >
                Starter Code
              </button>
            </div>
          </div>
        </footer>
      </div>
    </AppErrorBoundary>
  );
}

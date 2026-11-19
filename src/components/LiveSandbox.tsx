import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlarmClock,
  ArrowDown,
  ArrowLeft,
  BookOpen,
  Bot,
  Box,
  Check,
  CloudSun,
  Code2,
  Compass,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Home,
  Laptop,
  Mail,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PanelLeft,
  PanelRight,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Plus,
  Radar,
  Radio,
  RotateCcw,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Timer,
  UserRound,
  Volume2,
  X,
} from 'lucide-react';
import type {
  AgenticStepItem,
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
  CoreAvatarMode,
  CreativeAssetEntry,
  DesktopAwarenessState,
  ExecutionLogEntry,
  GeminiQuotaStatus,
  HardwareTelemetry,
  HomeAssistantEntity,
  IncomingCallEvent,
  JarvisLogoState,
  KnowledgeChunkItem,
  KnowledgeCitation,
  KnowledgeDocItem,
  MapsPlaceItem,
  MapsRouteSummary,
  MemoryCategory,
  MonitorTopic,
  MonitorUpdateItem,
  MultiAgentRun,
  NewsBriefingItem,
  PendingConfirmationAction,
  PendingMemoryProposal,
  ProactiveAlert,
  ProjectEntry,
  ScheduleKind,
  ScheduleRecurrence,
  ScheduledItem,
  ScreenOcrSnapshot,
  SkillDefinition,
  SkillVersionEntry,
  StudioHubId,
  SystemTelemetry,
  TaskLifecycleState,
  TaskPriority,
  VoiceMood,
  WeatherBriefing,
} from '../types/assistant';
import {
  base64Int16ToAudioBuffer,
  float32ToInt16Base64,
  playStateCue,
  playTimerCompleteChime,
  playWakeChime,
} from '../utils/pcmAudio';
import { AgentVoiceSpeaker } from '../utils/agentVoicePlayer';
import {
  resolveActiveWakeEngine,
  startSpeechInterruptionMonitor,
  startWakeStandbyEngine,
  tryOneShotSpeechRecognition,
  type WakeStandbyController,
} from '../utils/wakeEngine';
import {
  attemptDirectLaunch,
  captureSingleScreenshot,
  createSubfolderInDirectory,
  DESKTOP_COMPANION_SCRIPT,
  DesktopCompanionBridge,
  listAndSearchDirectory,
  pickAndReadLocalFile,
  pickDirectoryHandle,
  readBrowserTelemetry,
  resolveClientLaunchIntent,
  type LocalFileEntry,
} from '../utils/computerControl';
import { parseLocalCommand } from '../utils/commandParsers';
import { Jarvis3DCore } from './Jarvis3DCore';
import {
  JarvisSidePanels,
  type LeftPanelTab,
  type RightPanelTab,
} from './JarvisSidePanels';
import { SessionBackupModal } from './SessionBackupModal';
import {
  MapsIntelligenceCard,
  WeatherNewsBriefingCard,
} from './UniversalIntelligenceCards';
import { CreationStudios } from './studios/CreationStudios';
import { DevBugStudio } from './studios/DevBugStudio';
import { SkillsAgentHub } from './studios/SkillsAgentHub';
import { PersonalCallHub } from './studios/PersonalCallHub';
import { SecurityAuditHub } from './studios/SecurityAuditHub';

interface LiveSandboxProps {
  user: User | null;
  authLoading: boolean;
  cloudError: string | null;
  onSignIn: () => void;
  onSignOut: () => void;

  messages: AssistantMessage[];
  state: AssistantState;
  config: AssistantConfig;
  pendingVoicePrompt: string | null;
  onConsumePendingPrompt: () => void;
  onSyncState: (nextState: AssistantState) => void;
  onRecordSpokenTurn: (
    speaker: 'user' | 'model',
    text: string,
    meta?: {
      aiMode?: AssistantConfig['aiMode'];
      memoriesUsed?: string[];
      citations?: KnowledgeCitation[];
      mood?: VoiceMood;
      scopeLabel?: AssistantMessage['scopeLabel'];
    }
  ) => void;
  onUpdateConfig: React.Dispatch<React.SetStateAction<AssistantConfig>>;
  onRestoreSession: (snapshot: AssistantSessionSnapshot) => void;

  onAddTask: (title: string, priority: TaskPriority, dueLabel?: string) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onAddOrUpdateMemory: (fact: {
    id?: string;
    key: string;
    value: string;
    category: MemoryCategory;
  }) => void;
  onDeleteMemory: (memoryId: string) => void;
  onClearAllMemories: () => void;
  onDeleteHistoryItem: (historyId: string) => void;
  onUpdateEnvironment: (patch: Partial<AssistantState['environment']>) => void;
  latestAlert?: ProactiveAlert | null;
  onDismissAlert?: () => void;

  schedules: ScheduledItem[];
  executionLogs: ExecutionLogEntry[];
  quotaStatus: GeminiQuotaStatus;
  notificationPermission: NotificationPermission | 'unsupported';
  onRequestNotificationPermission: () => void;
  onCreateSchedule: (input: {
    kind: ScheduleKind;
    title: string;
    triggerAt: string;
    durationSeconds?: number;
    recurrence?: ScheduleRecurrence;
  }) => Promise<{ item: ScheduledItem; duplicate: boolean } | null>;
  onUpdateSchedule: (
    id: string,
    patch: {
      title?: string;
      triggerAt?: string;
      snoozeMinutes?: number;
      status?: ScheduledItem['status'];
      paused?: boolean;
      restart?: boolean;
    }
  ) => Promise<void>;
  onDeleteSchedule: (id: string) => Promise<void>;
  onSyncSchedulesFromServer: (items: ScheduledItem[]) => void;
  onUpdateQuotaStatus: (status: GeminiQuotaStatus) => void;
  onRecordExecutionLog: (entry: {
    command: string;
    intent: string;
    source: ExecutionLogEntry['source'];
    status: ExecutionLogEntry['status'];
    detail: string;
    verified: boolean;
  }) => void;
  onClearExecutionLogs: () => void;
  onDeliverAlert: (alert: ProactiveAlert) => void;

  // Internet Monitoring
  monitorTopics: MonitorTopic[];
  monitorUpdates: MonitorUpdateItem[];
  onCreateMonitor: (input: {
    query: string;
    officialOnly?: boolean;
    intervalMinutes?: number;
  }) => Promise<{
    topic: MonitorTopic;
    duplicate: boolean;
    initialUpdate?: MonitorUpdateItem | null;
  } | null>;
  onUpdateMonitor: (
    id: string,
    patch: { status?: 'active' | 'paused'; officialOnly?: boolean; intervalMinutes?: number }
  ) => Promise<void>;
  onDeleteMonitor: (id: string) => Promise<void>;
  onCheckMonitorNow: (id: string) => Promise<MonitorUpdateItem | null>;
  onPauseAllMonitors: () => Promise<void>;
  onResumeAllMonitors: () => Promise<void>;
  onSetOfficialOnlyMonitors: (officialOnly: boolean) => Promise<void>;

  // Browser Automation
  browserSnapshot: BrowserAutomationSnapshot;
  onExecuteBrowserAction: (req: {
    action: string;
    url?: string;
    engine?: 'google' | 'youtube' | 'bing' | 'duckduckgo';
    query?: string;
    resultIndex?: number;
    direction?: 'down' | 'up' | 'top' | 'bottom';
    targetText?: string;
    confirmedSensitive?: boolean;
  }) => Promise<{ ok: boolean; message: string; state: BrowserAutomationSnapshot }>;
  onAbortBrowserAction: () => Promise<void>;

  // Incoming Calls
  incomingCall: IncomingCallEvent | null;
  onUpdateIncomingCall: React.Dispatch<React.SetStateAction<IncomingCallEvent | null>>;
  onTriggerLocalIncomingCall: (callerName: string, appSource?: string) => void;

  // Universal Intelligence Connectors
  mapsApiKey: string;
  mapsQuotaExceeded: boolean;
  knowledgeDocs: KnowledgeDocItem[];
  knowledgeChunks: KnowledgeChunkItem[];
  knowledgeUploading: boolean;
  knowledgeError: string | null;
  onUploadKnowledgeFile: (file: File) => Promise<void>;
  onToggleKnowledgeDoc: (docId: string, enabled: boolean) => Promise<void>;
  onDeleteKnowledgeDoc: (docId: string) => Promise<void>;

  integrations: ConnectedIntegrationItem[];
  haConnected: boolean;
  haBaseUrl: string;
  haEntities: HomeAssistantEntity[];
  haBusy: boolean;
  haError: string | null;
  onConnectHomeAssistant: (baseUrl: string, token: string) => Promise<void>;
  onRefreshHomeAssistant: () => Promise<void>;
  onDisconnectHomeAssistant: () => Promise<void>;
  onToggleHomeAssistantEntity: (entity: HomeAssistantEntity) => Promise<void>;
  onCallHomeAssistantService: (params: {
    domain: string;
    service: string;
    entityId: string;
    data?: Record<string, unknown>;
  }) => Promise<{ ok: boolean; message: string }>;
  getAuthHeaders: () => Promise<Record<string, string>>;

  // Autonomous Studios, Personal Workspace & Calling Collections
  skills: SkillDefinition[];
  projects: ProjectEntry[];
  bugReports: BugFixReport[];
  creativeAssets: CreativeAssetEntry[];
  contacts: ContactEntry[];
  callLogs: CallLogEntry[];
  workflows: AutomationWorkflow[];
  agentRuns: MultiAgentRun[];
  onSaveSkill: (skill: SkillDefinition, isUpdate?: boolean) => Promise<void>;
  onSaveSkillVersion: (entry: SkillVersionEntry) => Promise<void>;
  onDeleteSkill: (skillId: string) => Promise<void>;
  onSaveProject: (project: ProjectEntry, isUpdate?: boolean) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onSaveBugReport: (report: BugFixReport, isUpdate?: boolean) => Promise<void>;
  onSaveCreativeAsset: (asset: Omit<CreativeAssetEntry, 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDeleteCreativeAsset: (assetId: string) => Promise<void>;
  onSaveContact: (contact: ContactEntry, isUpdate?: boolean) => Promise<void>;
  onDeleteContact: (contactId: string) => Promise<void>;
  onLogCall: (entry: CallLogEntry) => Promise<void>;
  onSaveWorkflow: (wf: AutomationWorkflow, isUpdate?: boolean) => Promise<void>;
  onDeleteWorkflow: (workflowId: string) => Promise<void>;
  onSaveAgentRun: (run: MultiAgentRun, isUpdate?: boolean) => Promise<void>;
}

interface LaunchTarget {
  name: string;
  url: string;
  searchQuery?: string;
  popupBlocked?: boolean;
  launchedVia?: 'browser_tab' | 'companion' | 'blocked';
  copiedUrl?: boolean;
}

const WAKE_STORAGE_KEY = 'jarvis_wake_enabled_v1';

function detectResponseMood(
  responseText: string,
  userText: string,
  fallbackMood: VoiceMood = 'normal'
): VoiceMood {
  const combined = `${userText} ${responseText}`.toLowerCase();
  if (/\b(sorry|unfortunately|failed|offline|error|couldn't|unable|sad|apologize|দুঃখিত)\b/.test(combined)) {
    return 'sad';
  }
  if (/\b(warning|urgent|danger|security alert|critical|locked|unauthorized)\b/.test(combined)) {
    return 'angry';
  }
  if (/\b(good morning|good afternoon|good evening|welcome back|hello|hi|assalamu|কেমন আছেন)\b/.test(combined)) {
    return 'greeting';
  }
  if (/\b(congratulations|proud|well done|accomplished|completed|milestone|brilliant)\b/.test(combined)) {
    return 'proud';
  }
  if (/\b(great news|awesome|excited|fantastic|amazing|darun|দারুণ)\b/.test(combined)) {
    return 'excited';
  }
  if (/\b(briefing|report|deadline|diagnostic|audit|important)\b/.test(combined)) {
    return 'serious';
  }
  return fallbackMood;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function keywordOverlapScore(query: string, text: string, sectionLabel: string): number {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'about', 'into', 'your', 'does']);
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9\u0980-\u09ff]+/)
    .filter((w) => w.length >= 2 && !stopWords.has(w));
  if (tokens.length === 0) return 0;
  const hay = `${sectionLabel} ${text}`.toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hits += 1;
  }
  return hits / tokens.length;
}

async function searchKnowledgeVault(
  query: string,
  docs: KnowledgeDocItem[],
  chunks: KnowledgeChunkItem[],
  getAuthHeaders: () => Promise<Record<string, string>>
): Promise<{ citations: KnowledgeCitation[]; contextText: string; topScore: number }> {
  const enabledDocIds = new Set(docs.filter((d) => d.enabled).map((d) => d.id));
  const eligible = chunks.filter((c) => enabledDocIds.has(c.docId));
  if (eligible.length === 0) {
    return { citations: [], contextText: '', topScore: 0 };
  }

  let queryEmbedding: number[] = [];
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/knowledge/embed-query', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    });
    if (res.ok) {
      const body = (await res.json()) as { embedding?: number[] };
      if (Array.isArray(body.embedding)) {
        queryEmbedding = body.embedding;
      }
    }
  } catch {
    // offline fallback uses lexical overlap
  }

  const scored = eligible
    .map((chunk) => {
      const kw = keywordOverlapScore(query, chunk.text, chunk.sectionLabel);
      const vec =
        queryEmbedding.length > 0 && chunk.embedding.length === queryEmbedding.length
          ? Math.max(0, cosineSimilarity(queryEmbedding, chunk.embedding))
          : 0;
      const score = queryEmbedding.length > 0 && chunk.embedding.length > 0 ? 0.72 * vec + 0.28 * kw : kw;
      return { chunk, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .filter((item) => item.score >= 0.18);

  const citations: KnowledgeCitation[] = scored.map(({ chunk, score }) => ({
    docId: chunk.docId,
    docName: chunk.docName,
    sectionLabel: chunk.sectionLabel,
    excerpt: chunk.text.slice(0, 260),
    score: Math.round(score * 100) / 100,
  }));

  const contextText = scored
    .map(
      ({ chunk }) =>
        `[${chunk.docName} · ${chunk.sectionLabel}]: ${chunk.text}`
    )
    .join('\n\n');

  return {
    citations,
    contextText,
    topScore: scored[0]?.score || 0,
  };
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatTimerHud(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const LiveSandbox: React.FC<LiveSandboxProps> = ({
  user,
  authLoading,
  cloudError,
  onSignIn,
  onSignOut,
  messages,
  state,
  config,
  pendingVoicePrompt,
  onConsumePendingPrompt,
  onSyncState,
  onRecordSpokenTurn,
  onUpdateConfig,
  onRestoreSession,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onAddOrUpdateMemory,
  onDeleteMemory,
  onClearAllMemories,
  onDeleteHistoryItem,
  onUpdateEnvironment,
  latestAlert,
  onDismissAlert,
  schedules,
  executionLogs,
  quotaStatus,
  notificationPermission,
  onRequestNotificationPermission,
  onCreateSchedule,
  onUpdateSchedule,
  onDeleteSchedule,
  onSyncSchedulesFromServer,
  onUpdateQuotaStatus,
  onRecordExecutionLog,
  onClearExecutionLogs,
  onDeliverAlert,
  monitorTopics,
  monitorUpdates,
  onCreateMonitor,
  onUpdateMonitor,
  onDeleteMonitor,
  onCheckMonitorNow,
  onPauseAllMonitors,
  onResumeAllMonitors,
  onSetOfficialOnlyMonitors,
  browserSnapshot,
  onExecuteBrowserAction,
  onAbortBrowserAction,
  incomingCall,
  onUpdateIncomingCall,
  onTriggerLocalIncomingCall,
  mapsApiKey,
  mapsQuotaExceeded,
  knowledgeDocs,
  knowledgeChunks,
  knowledgeUploading,
  knowledgeError,
  onUploadKnowledgeFile,
  onToggleKnowledgeDoc,
  onDeleteKnowledgeDoc,
  integrations,
  haConnected,
  haBaseUrl,
  haEntities,
  haBusy,
  haError,
  onConnectHomeAssistant,
  onRefreshHomeAssistant,
  onDisconnectHomeAssistant,
  onToggleHomeAssistantEntity,
  onCallHomeAssistantService,
  getAuthHeaders,
  skills,
  projects,
  bugReports,
  creativeAssets,
  contacts,
  callLogs,
  workflows,
  agentRuns,
  onSaveSkill,
  onSaveSkillVersion,
  onDeleteSkill,
  onSaveProject,
  onDeleteProject,
  onSaveBugReport,
  onSaveCreativeAsset,
  onDeleteCreativeAsset,
  onSaveContact,
  onDeleteContact,
  onLogCall,
  onSaveWorkflow,
  onDeleteWorkflow,
  onSaveAgentRun,
}) => {
  const [activeStudio, setActiveStudio] = useState<StudioHubId>('core');
  const [devSubTab, setDevSubTab] = useState<'dev' | 'bugfix'>('dev');
  const [creativeSubTab, setCreativeSubTab] = useState<'3d' | '2d' | '1d'>('3d');
  const [skillsSubTab, setSkillsSubTab] = useState<'skills' | 'agents' | 'workflows'>('skills');
  const [personalSubTab, setPersonalSubTab] = useState<'workspace' | 'calls'>('workspace');
  const [studioNavSeq, setStudioNavSeq] = useState(0);
  const [avatarMode, setAvatarMode] = useState<CoreAvatarMode>(() => {
    try {
      const saved = localStorage.getItem('jarvis_avatar_mode_v1');
      return saved === 'character' ? 'character' : 'orb';
    } catch {
      return 'orb';
    }
  });

  const [wakeEnabled, setWakeEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(WAKE_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const [coreState, setCoreState] = useState<JarvisLogoState>('idle');
  const [taskState, setTaskState] = useState<TaskLifecycleState>('IDLE');
  const [commandInput, setCommandInput] = useState('');
  const [needsUserGesture, setNeedsUserGesture] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Adaptive context, timer HUD ticker, and modes
  const [hudNowMs, setHudNowMs] = useState<number>(() => Date.now());
  const [selectedTimerId, setSelectedTimerId] = useState<string | null>(null);
  const [userSleepMode, setUserSleepMode] = useState(false);
  const [careModeActive, setCareModeActive] = useState(false);
  const [recentCompletedFlash, setRecentCompletedFlash] = useState(false);
  const [desktopContext, setDesktopContext] = useState<DesktopAwarenessState>({
    enabled: Boolean(config.desktopAwarenessEnabled),
    activeApp: '',
    windowTitle: '',
    activity: 'idle',
    doNotDisturb: false,
    source: 'offline',
    updatedAt: new Date().toISOString(),
  });
  const [queuedAlerts, setQueuedAlerts] = useState<ProactiveAlert[]>([]);
  const [showBrowserHud, setShowBrowserHud] = useState(false);

  // Collapsible side panels & cinematic mode
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [activeLeftTab, setActiveLeftTab] = useState<LeftPanelTab>('alarms');
  const [activeRightTab, setActiveRightTab] = useState<RightPanelTab>('system');
  const [cinematicMode, setCinematicMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Subtitles, memory attribution, launch cards, approvals & screen capture
  const [userSubtitle, setUserSubtitle] = useState('');
  const [jarvisSubtitle, setJarvisSubtitle] = useState('');
  const [lastMemoriesUsed, setLastMemoriesUsed] = useState<string[]>([]);
  const [pendingProposals, setPendingProposals] = useState<PendingMemoryProposal[]>([]);
  const [launchTarget, setLaunchTarget] = useState<LaunchTarget | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmationAction | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<{
    dataUrl: string;
    width: number;
    height: number;
    analysis?: string;
    analyzing?: boolean;
  } | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [toolProgressText, setToolProgressText] = useState<string | null>(null);
  const [voicePipelineMode, setVoicePipelineMode] = useState<'live' | 'fallback'>('live');
  const [isFallbackRecording, setIsFallbackRecording] = useState(false);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [, setAnalyserRevision] = useState(0);

  // Universal Intelligence cards & PC Vision state
  const [weatherCard, setWeatherCard] = useState<WeatherBriefing | null>(null);
  const [newsCard, setNewsCard] = useState<{
    topic: string;
    summary: string;
    items: NewsBriefingItem[];
    fetchedAt: string;
  } | null>(null);
  const [mapsPlaces, setMapsPlaces] = useState<MapsPlaceItem[]>([]);
  const [mapsRoute, setMapsRoute] = useState<MapsRouteSummary | null>(null);
  const [showMapsCard, setShowMapsCard] = useState(false);
  const [activeCitations, setActiveCitations] = useState<KnowledgeCitation[]>([]);
  const [activeScopeLabel, setActiveScopeLabel] =
    useState<AssistantMessage['scopeLabel'] | null>(null);
  const [pcHardwareTelemetry, setPcHardwareTelemetry] = useState<HardwareTelemetry | null>(null);
  const [screenOcrSnapshot, setScreenOcrSnapshot] = useState<ScreenOcrSnapshot | null>(null);
  const [agenticSteps, setAgenticSteps] = useState<AgenticStepItem[]>([]);

  // Computer Control local folder & telemetry
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [folderEntries, setFolderEntries] = useState<LocalFileEntry[]>([]);
  const companionRef = useRef<DesktopCompanionBridge | null>(null);
  const [companionBridgeState, setCompanionBridgeState] = useState<DesktopCompanionBridge>(
    () => new DesktopCompanionBridge(config.companionUrl || 'ws://127.0.0.1:4849', () => {})
  );

  const [telemetry, setTelemetry] = useState<SystemTelemetry>(() => ({
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    micPermission: 'unknown',
    companionConnected: false,
    companionEndpoint: config.companionUrl || 'ws://127.0.0.1:4849',
    crossOriginIsolated:
      typeof window !== 'undefined' ? Boolean(window.crossOriginIsolated) : false,
    activeWakeEngineLabel: resolveActiveWakeEngine(
      config.wakeEngine,
      config.picovoiceAccessKey
    ).label,
  }));

  // Audio, wake & WebSocket refs
  const stageRootRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wakeControllerRef = useRef<WakeStandbyController | null>(null);
  const interruptionStopRef = useRef<{ stop: () => void } | null>(null);
  const agentSpeakerRef = useRef<AgentVoiceSpeaker | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fallbackChunksRef = useRef<Blob[]>([]);
  const fallbackSilenceTimerRef = useRef<number | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const fallbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const standbyAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const handledAlertIdRef = useRef<string | null>(null);

  const standbyReturnTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(false);
  const wakeEnabledRef = useRef<boolean>(wakeEnabled);
  const coreStateRef = useRef<JarvisLogoState>('idle');
  const singleCommandModeRef = useRef<boolean>(!config.continuousMode);
  const modelRespondedRef = useRef<boolean>(false);
  const turnCompletedRef = useRef<boolean>(false);
  const interactionIdleRef = useRef<boolean>(false);

  const userTranscriptRef = useRef<string>('');
  const jarvisTranscriptRef = useRef<string>('');
  const memoriesUsedRef = useRef<string[]>([]);
  const lastUserCommandRef = useRef<string>('');
  const turnLaunchDispatchedRef = useRef<boolean>(false);
  const midTurnRecoveryLockRef = useRef<boolean>(false);
  const lastExecutedCmdRef = useRef<{ key: string; ts: number }>({ key: '', ts: 0 });
  const schedulesRef = useRef(schedules);
  schedulesRef.current = schedules;
  const quotaStatusRef = useRef(quotaStatus);
  quotaStatusRef.current = quotaStatus;
  const monitorTopicsRef = useRef(monitorTopics);
  monitorTopicsRef.current = monitorTopics;
  const monitorUpdatesRef = useRef(monitorUpdates);
  monitorUpdatesRef.current = monitorUpdates;
  const incomingCallRef = useRef(incomingCall);
  incomingCallRef.current = incomingCall;
  const desktopContextRef = useRef(desktopContext);
  desktopContextRef.current = desktopContext;

  const stateRef = useRef(state);
  stateRef.current = state;
  const configRef = useRef(config);
  configRef.current = config;
  const knowledgeDocsRef = useRef(knowledgeDocs);
  knowledgeDocsRef.current = knowledgeDocs;
  const knowledgeChunksRef = useRef(knowledgeChunks);
  knowledgeChunksRef.current = knowledgeChunks;
  const haConnectedRef = useRef(haConnected);
  haConnectedRef.current = haConnected;
  const haEntitiesRef = useRef(haEntities);
  haEntitiesRef.current = haEntities;
  const getAuthHeadersRef = useRef(getAuthHeaders);
  getAuthHeadersRef.current = getAuthHeaders;
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;
  const skillsRef = useRef(skills);
  skillsRef.current = skills;
  const onLogCallRef = useRef(onLogCall);
  onLogCallRef.current = onLogCall;

  useEffect(() => {
    try {
      localStorage.setItem('jarvis_avatar_mode_v1', avatarMode);
    } catch {
      // ignore
    }
  }, [avatarMode]);

  useEffect(() => {
    wakeEnabledRef.current = wakeEnabled;
    try {
      localStorage.setItem(WAKE_STORAGE_KEY, String(wakeEnabled));
    } catch {
      // ignore
    }
  }, [wakeEnabled]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    coreStateRef.current = coreState;
  }, [coreState]);

  useEffect(() => {
    singleCommandModeRef.current = !config.continuousMode;
  }, [config.continuousMode]);

  useEffect(() => {
    if (
      outputGainRef.current &&
      outputAudioCtxRef.current &&
      outputAudioCtxRef.current.state !== 'closed'
    ) {
      outputGainRef.current.gain.setValueAtTime(
        Math.max(0, Math.min(1, config.voiceVolume)),
        outputAudioCtxRef.current.currentTime
      );
    }
    agentSpeakerRef.current?.updateVolume(config.voiceVolume);
  }, [config.voiceVolume]);

  const getAgentSpeaker = useCallback(() => {
    if (!agentSpeakerRef.current) {
      agentSpeakerRef.current = new AgentVoiceSpeaker();
    }
    return agentSpeakerRef.current;
  }, []);

  // Refresh browser telemetry periodically and on wake engine changes
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const stats = await readBrowserTelemetry();
      if (!active) return;
      const engineMeta = resolveActiveWakeEngine(
        config.wakeEngine,
        config.picovoiceAccessKey
      );
      setTelemetry((prev) => ({
        ...prev,
        online: navigator.onLine,
        micPermission: stats.micPermission,
        batteryLevel: stats.batteryLevel,
        batteryCharging: stats.batteryCharging,
        storageUsedMb: stats.storageUsedMb,
        storageQuotaMb: stats.storageQuotaMb,
        hardwareThreads: stats.hardwareThreads,
        companionEndpoint: config.companionUrl || 'ws://127.0.0.1:4849',
        activeWakeEngineLabel:
          wakeControllerRef.current?.engineLabel || engineMeta.label,
      }));
    };
    void refresh();
    const id = window.setInterval(() => void refresh(), 25000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [config.wakeEngine, config.picovoiceAccessKey, config.companionUrl]);

  // Desktop Companion WebSocket initialization + background schedule_due & desktop_context listener
  useEffect(() => {
    const endpoint = config.companionUrl || 'ws://127.0.0.1:4849';
    const bridge = new DesktopCompanionBridge(
      endpoint,
      (connected) => {
        setTelemetry((prev) => ({
          ...prev,
          companionConnected: connected,
          pythonAgentConnected: connected ? prev.pythonAgentConnected : false,
        }));
        if (connected) {
          if (configRef.current.desktopAwarenessEnabled) {
            void bridge.sendCommand('desktop_awareness_toggle', { enabled: true });
          }
          void bridge.getHardwareTelemetry().then((res) => {
            if (res.ok && res.data) {
              const hw = res.data as unknown as HardwareTelemetry;
              setPcHardwareTelemetry(hw);
              setTelemetry((prev) => ({
                ...prev,
                pythonAgentConnected: Boolean(hw.pythonAgentReady),
              }));
            }
          });
        }
      },
      (eventName, payload) => {
        if (eventName === 'schedule_due') {
          const alertData = (payload.alert as Record<string, unknown>) || payload;
          const id = String(alertData.id || `cmp_alert_${Date.now()}`);
          const title = String(alertData.title || 'Scheduled Reminder');
          const kindRaw = String(alertData.kind || 'reminder');
          const kind =
            kindRaw === 'alarm' || kindRaw === 'timer' ? kindRaw : 'reminder';
          onDeliverAlert({
            id: `cmp_${id}`,
            scheduleId: id,
            title: `${kind === 'alarm' ? 'Alarm' : 'Reminder'}: ${title}`,
            spokenText: `Sir, your ${kind} for ${title} is due.`,
            kind,
            createdAt: new Date().toISOString(),
          });
        } else if (eventName === 'desktop_context' && configRef.current.desktopAwarenessEnabled) {
          const actRaw = String(payload.activity || 'desktop');
          const activity: DesktopAwarenessState['activity'] =
            actRaw === 'gaming' ||
            actRaw === 'video' ||
            actRaw === 'browser' ||
            actRaw === 'call' ||
            actRaw === 'dnd' ||
            actRaw === 'idle'
              ? actRaw
              : 'desktop';
          setDesktopContext({
            enabled: true,
            activeApp: String(payload.activeApp || 'Desktop'),
            windowTitle: String(payload.windowTitle || ''),
            activity,
            doNotDisturb: Boolean(payload.doNotDisturb),
            source: 'companion',
            updatedAt: String(payload.updatedAt || new Date().toISOString()),
          });
        } else if (eventName === 'incoming_call') {
          onTriggerLocalIncomingCall(
            String(payload.callerName || 'Unknown Caller'),
            String(payload.appSource || 'Phone Companion')
          );
        }
      }
    );
    bridge.setPairingToken(configRef.current.companionPairingToken);
    companionRef.current = bridge;
    setCompanionBridgeState(bridge);
    return () => {
      bridge.disconnect();
      if (companionRef.current === bridge) {
        companionRef.current = null;
      }
    };
  }, [config.companionUrl, onDeliverAlert, onTriggerLocalIncomingCall]);

  useEffect(() => {
    companionRef.current?.setPairingToken(config.companionPairingToken);
  }, [config.companionPairingToken]);

  // Keep Desktop Companion synced with persistent schedules so alarms work if browser closes
  useEffect(() => {
    if (!telemetry.companionConnected || !companionRef.current?.connected) return;
    void companionRef.current
      .sendCommand('companion_sync_schedules', { items: schedules })
      .catch(() => {});
  }, [telemetry.companionConnected, schedules]);

  // 1-second timestamp ticker for accurate floating Timer HUDs
  useEffect(() => {
    const id = window.setInterval(() => setHudNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-open floating Browser HUD when Playwright/browser automation runs or requests confirmation
  useEffect(() => {
    if (
      browserSnapshot.status === 'running' ||
      browserSnapshot.status === 'awaiting_confirmation'
    ) {
      setShowBrowserHud(true);
    } else if (browserSnapshot.status === 'idle') {
      setShowBrowserHud(false);
    }
  }, [browserSnapshot.status]);

  // Track Fullscreen API state
  useEffect(() => {
    const handleFsChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const isLiveConnected =
    coreState === 'waking' ||
    coreState === 'listening' ||
    coreState === 'thinking' ||
    coreState === 'speaking';

  // Active Live elapsed timer
  useEffect(() => {
    if (!isLiveConnected || coreState === 'waking') {
      setElapsedSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isLiveConnected, coreState]);

  const clearReturnToStandbyTimer = useCallback(() => {
    if (standbyReturnTimerRef.current !== null) {
      window.clearTimeout(standbyReturnTimerRef.current);
      standbyReturnTimerRef.current = null;
    }
  }, []);

  const stopQueuedOutputAudio = useCallback(() => {
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const stopFallbackRecorder = useCallback(() => {
    if (fallbackSilenceTimerRef.current !== null) {
      window.clearTimeout(fallbackSilenceTimerRef.current);
      fallbackSilenceTimerRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.onstop = null;
        rec.stop();
      } catch {
        // ignore
      }
    }
    fallbackChunksRef.current = [];
    setIsFallbackRecording(false);
  }, []);

  const stopWakeStandby = useCallback(async () => {
    if (wakeControllerRef.current) {
      const ctrl = wakeControllerRef.current;
      wakeControllerRef.current = null;
      await ctrl.stop();
    }
    standbyAnalyserRef.current = null;
  }, []);

  const cleanupLiveSession = useCallback(() => {
    clearReturnToStandbyTimer();
    stopQueuedOutputAudio();
    stopFallbackRecorder();
    setToolProgressText(null);

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      void inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
      inputAnalyserRef.current = null;
    }

    if (outputAudioCtxRef.current) {
      void outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
      outputGainRef.current = null;
      outputAnalyserRef.current = null;
    }

    if (wsRef.current) {
      const socket = wsRef.current;
      wsRef.current = null;
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }
    }

    setIsMuted(false);
    isMutedRef.current = false;
    setAnalyserRevision((r) => r + 1);
  }, [clearReturnToStandbyTimer, stopFallbackRecorder, stopQueuedOutputAudio]);

  // Sync live state changes to active server session
  useEffect(() => {
    if (
      isLiveConnected &&
      coreState !== 'waking' &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      wsRef.current.send(JSON.stringify({ type: 'state_update', state }));
    }
  }, [state, isLiveConnected, coreState]);

  const armWakeStandbyRef = useRef<(isAutoAttempt: boolean) => Promise<void>>(
    async () => {}
  );

  const returnToStandbyOrIdle = useCallback(() => {
    if (userTranscriptRef.current.trim()) {
      onRecordSpokenTurn('user', userTranscriptRef.current.trim(), {
        aiMode: configRef.current.aiMode,
        memoriesUsed: memoriesUsedRef.current,
      });
    }
    if (jarvisTranscriptRef.current.trim()) {
      onRecordSpokenTurn('model', jarvisTranscriptRef.current.trim(), {
        aiMode: configRef.current.aiMode,
      });
    }
    cleanupLiveSession();

    const engineMeta = resolveActiveWakeEngine(
      configRef.current.wakeEngine,
      configRef.current.picovoiceAccessKey
    );

    if (wakeEnabledRef.current && engineMeta.type !== 'manual_only') {
      setCoreState('standby');
      void armWakeStandbyRef.current(false);
    } else {
      setCoreState('idle');
    }
  }, [cleanupLiveSession, onRecordSpokenTurn]);

  const scheduleSingleCommandReturnCheck = useCallback(() => {
    if (!singleCommandModeRef.current || !wakeEnabledRef.current) return;
    if (!modelRespondedRef.current) return;
    if (activeSourcesRef.current.size > 0) return;
    if (!turnCompletedRef.current && !interactionIdleRef.current) return;

    clearReturnToStandbyTimer();
    standbyReturnTimerRef.current = window.setTimeout(() => {
      standbyReturnTimerRef.current = null;
      if (
        activeSourcesRef.current.size === 0 &&
        coreStateRef.current !== 'standby' &&
        coreStateRef.current !== 'idle' &&
        coreStateRef.current !== 'disconnected'
      ) {
        returnToStandbyOrIdle();
      }
    }, 900);
  }, [clearReturnToStandbyTimer, returnToStandbyOrIdle]);

  const playPcmChunk = useCallback(
    (base64Audio: string) => {
      const ctx = outputAudioCtxRef.current;
      const gainNode = outputGainRef.current;
      if (!ctx || !gainNode || ctx.state === 'closed') return;

      const scheduleChunk = () => {
        if (!outputAudioCtxRef.current || !outputGainRef.current || ctx.state === 'closed') {
          return;
        }
        clearReturnToStandbyTimer();
        setToolProgressText(null);
        modelRespondedRef.current = true;

        const buffer = base64Int16ToAudioBuffer(base64Audio, ctx);
        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const speed = Math.max(0.75, Math.min(1.4, configRef.current.voiceSpeed));
        const pitchSt = Math.max(-6, Math.min(6, configRef.current.voicePitchSemitones));
        source.playbackRate.value = speed;
        if ('detune' in source) {
          source.detune.value = pitchSt * 100;
        }
        source.connect(gainNode);

        const now = ctx.currentTime;
        const startAt = Math.max(now + 0.01, nextStartTimeRef.current);
        source.start(startAt);
        nextStartTimeRef.current = startAt + buffer.duration / speed;

        activeSourcesRef.current.add(source);
        setCoreState('speaking');

        source.onended = () => {
          activeSourcesRef.current.delete(source);
          if (activeSourcesRef.current.size === 0) {
            if (
              coreStateRef.current === 'speaking' ||
              coreStateRef.current === 'thinking'
            ) {
              setCoreState('listening');
            }
            scheduleSingleCommandReturnCheck();
          }
        };
      };

      if (ctx.state === 'suspended') {
        void ctx.resume().then(scheduleChunk).catch(() => {});
      } else {
        scheduleChunk();
      }
    },
    [clearReturnToStandbyTimer, scheduleSingleCommandReturnCheck]
  );

  const executeFallbackVoiceCommandRef = useRef<(spokenText: string) => Promise<void>>(
    async () => {}
  );

  const stopSpeechInterruption = useCallback(() => {
    if (interruptionStopRef.current) {
      interruptionStopRef.current.stop();
      interruptionStopRef.current = null;
    }
  }, []);

  const stopAllSpeaking = useCallback(() => {
    stopSpeechInterruption();
    stopQueuedOutputAudio();
    agentSpeakerRef.current?.stop();
    if (coreStateRef.current === 'speaking') {
      const meta = resolveActiveWakeEngine(
        configRef.current.wakeEngine,
        configRef.current.picovoiceAccessKey
      );
      if (wakeEnabledRef.current && meta.type !== 'manual_only') {
        setCoreState('standby');
        void armWakeStandbyRef.current(false);
      } else {
        setCoreState('idle');
      }
    }
  }, [stopQueuedOutputAudio, stopSpeechInterruption]);

  const speakWithAgentVoice = useCallback(
    async (text: string, opts?: { updateCoreState?: boolean; mood?: VoiceMood }) => {
      const speaker = getAgentSpeaker();
      const cfg = configRef.current;
      const computedMood =
        opts?.mood ||
        detectResponseMood(
          text,
          lastUserCommandRef.current,
          cfg.voiceMoodDefault || 'normal'
        );

      // Keep voice responsive to "August stop" / "Stop speaking" or follow-up commands while speaking
      if (opts?.updateCoreState && !wsRef.current) {
        stopSpeechInterruption();
        interruptionStopRef.current = startSpeechInterruptionMonitor({
          language: cfg.preferredLanguage || cfg.voiceLanguage,
          onStopRequested: () => {
            stopAllSpeaking();
            setTaskState('COMPLETED');
            setActionNotice('Speech stopped.');
          },
          onNewCommandWhileSpeaking: (cmd) => {
            stopAllSpeaking();
            void executeFallbackVoiceCommandRef.current(cmd);
          },
        });
      }

      await speaker.speak(text, {
        voiceName: cfg.voiceName,
        stylePrompt: cfg.agentVoiceStyle,
        useVoiceDesign: cfg.agentVoiceProfileId === 'custom_designer',
        mood: computedMood,
        language: cfg.preferredLanguage || cfg.voiceLanguage || 'en-US',
        volume: cfg.voiceVolume,
        speed: cfg.voiceSpeed,
        pitchSemitones: cfg.voicePitchSemitones,
        onAnalyserReady: (analyser) => {
          fallbackAnalyserRef.current = analyser;
          setAnalyserRevision((r) => r + 1);
        },
        onSpeakingChange: (speaking) => {
          if (!speaking) {
            stopSpeechInterruption();
          }
          if (!opts?.updateCoreState) return;
          if (speaking) {
            setCoreState('speaking');
          } else if (coreStateRef.current === 'speaking') {
            const meta = resolveActiveWakeEngine(
              configRef.current.wakeEngine,
              configRef.current.picovoiceAccessKey
            );
            if (wakeEnabledRef.current && meta.type !== 'manual_only') {
              setCoreState('standby');
              void armWakeStandbyRef.current(false);
            } else {
              setCoreState('idle');
            }
          }
        },
      });
    },
    [getAgentSpeaker, stopAllSpeaking, stopSpeechInterruption]
  );

  const dispatchLaunchTarget = useCallback((target: LaunchTarget) => {
    turnLaunchDispatchedRef.current = true;
    const directRes = attemptDirectLaunch(target.url);
    setLaunchTarget({
      ...target,
      popupBlocked: directRes.blocked,
      launchedVia: directRes.blocked ? 'blocked' : 'browser_tab',
      copiedUrl: false,
    });

    if (directRes.blocked && companionRef.current?.connected) {
      void companionRef.current
        .sendCommand('companion_open_url', { url: target.url })
        .then((res) => {
          if (res.ok) {
            setLaunchTarget((prev) =>
              prev && prev.url === target.url
                ? { ...prev, popupBlocked: false, launchedVia: 'companion' }
                : prev
            );
            setActionNotice(`Opened ${target.name} in your desktop browser via Companion.`);
          }
        });
    } else if (directRes.blocked) {
      setActionNotice(`Browser blocked auto-popup — click Open ${target.name} below.`);
    }
  }, []);

  // Computer Control dispatcher from voice tool calls or UI
  const executeBrowserOrCompanionControl = useCallback(
    async (
      actionType: PendingConfirmationAction['actionType'],
      args: Record<string, unknown>
    ) => {
      try {
        if (actionType === 'clear_all_memories') {
          onClearAllMemories();
          setActionNotice('All personal memories have been cleared.');
          return;
        }
        if (actionType === 'capture_screenshot') {
          if (companionRef.current?.connected) {
            const res = await companionRef.current.captureScreenOcr();
            if (res.ok && res.data) {
              const snap: ScreenOcrSnapshot = {
                capturedAt: new Date().toISOString(),
                width: typeof res.data.width === 'number' ? res.data.width : undefined,
                height: typeof res.data.height === 'number' ? res.data.height : undefined,
                activeApp: typeof res.data.activeApp === 'string' ? res.data.activeApp : undefined,
                windowTitle:
                  typeof res.data.windowTitle === 'string' ? res.data.windowTitle : undefined,
                ocrText: String(res.data.ocrText || ''),
                imageBase64:
                  typeof res.data.imageBase64 === 'string' ? res.data.imageBase64 : undefined,
              };
              setScreenOcrSnapshot(snap);
              setShowRightPanel(true);
              setActiveRightTab('pcvision');
              setActionNotice('Captured desktop screen with Python OCR Vision.');
              setTaskState('COMPLETED');
              return;
            }
          }
          const shot = await captureSingleScreenshot();
          setScreenshotPreview(shot);
          setActionNotice(`Captured screen frame (${shot.width}×${shot.height}).`);
          return;
        }
        if (actionType === 'place_outgoing_call') {
          const contactName = String(args.contactName || args.target || 'Contact');
          const phone = String(args.phone || '').trim();
          const cleaned = phone.replace(/[^0-9+*#]/g, '');
          if (!cleaned) {
            throw new Error('No valid phone number provided for outgoing call.');
          }
          let method: CallLogEntry['method'] = 'tel_uri';
          let note = `Opened OS tel: handoff for ${contactName}`;
          if (companionRef.current?.connected) {
            const callRes = await companionRef.current.placeCall(cleaned, contactName);
            if (callRes.ok) {
              method = 'phone_link';
              note = callRes.message;
            }
          } else {
            window.location.href = `tel:${cleaned}`;
          }
          await onLogCallRef.current({
            id: `call_out_${Date.now()}`,
            contactName,
            phone,
            direction: 'outgoing',
            method,
            status: 'initiated',
            note,
            createdAt: new Date().toISOString(),
          });
          setActionNotice(note);
          setJarvisSubtitle(note);
          setTaskState('COMPLETED');
          onRecordExecutionLog({
            command: `call ${contactName}`,
            intent: 'place_outgoing_call',
            source: 'calling',
            status: 'COMPLETED',
            detail: note,
            verified: true,
          });
          await speakWithAgentVoice(`Initiating call to ${contactName}, Sir.`, { updateCoreState: true });
          return;
        }
        if (actionType === 'companion_clipboard_write') {
          const textToCopy = String(args.text || args.value || '');
          let wrote = false;
          if (companionRef.current?.connected) {
            const res = await companionRef.current.writeClipboard(textToCopy);
            wrote = res.ok;
          }
          if (!wrote && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(textToCopy);
            wrote = true;
          }
          const msg = wrote
            ? 'Copied text to your clipboard, Sir.'
            : 'Clipboard write unavailable.';
          setActionNotice(msg);
          setJarvisSubtitle(msg);
          setTaskState(wrote ? 'COMPLETED' : 'FAILED');
          return;
        }
        if (actionType === 'create_local_folder') {
          const handle =
            dirHandleRef.current || (await pickDirectoryHandle());
          dirHandleRef.current = handle;
          setSelectedFolderName(handle.name);
          const created = await createSubfolderInDirectory(
            handle,
            String(args.target || 'Jarvis_Folder')
          );
          const entries = await listAndSearchDirectory(handle);
          setFolderEntries(entries);
          setActionNotice(`Created folder "${created}" inside ${handle.name}.`);
          return;
        }
        if (actionType.startsWith('companion_')) {
          const bridge = companionRef.current;
          if (!bridge || !bridge.connected) {
            const offlineMsg = `Desktop Companion is offline — cannot execute ${actionType.replace('companion_', '')} on PC.`;
            setErrorMessage(offlineMsg);
            setJarvisSubtitle(offlineMsg);
            setTaskState('FAILED');
            onRecordExecutionLog({
              command: String(args.target || actionType),
              intent: actionType,
              source: 'companion',
              status: 'FAILED',
              detail: offlineMsg,
              verified: false,
            });
            return;
          }
          setTaskState('EXECUTING');
          setAgenticSteps([
            { index: 1, label: `Dispatch ${actionType.replace('companion_', '')}`, status: 'running' },
            { index: 2, label: 'Verify PC execution', status: 'pending' },
          ]);
          const res = await bridge.sendCommand(actionType, args);
          if (!res.ok) {
            setAgenticSteps([
              { index: 1, label: `Dispatch ${actionType.replace('companion_', '')}`, status: 'failed', detail: res.message },
              { index: 2, label: 'Verify PC execution', status: 'failed' },
            ]);
            setErrorMessage(res.message);
            setJarvisSubtitle(res.message);
            setTaskState('FAILED');
            onRecordExecutionLog({
              command: String(args.target || actionType),
              intent: actionType,
              source: 'companion',
              status: 'FAILED',
              detail: res.message,
              verified: false,
            });
            await speakWithAgentVoice(res.message, { updateCoreState: true });
          } else {
            let finalDetail = res.message;
            if (
              telemetry.pythonAgentConnected &&
              (actionType === 'companion_launch_app' ||
                actionType === 'companion_window_control' ||
                actionType === 'companion_mouse_action' ||
                actionType === 'companion_keyboard_action')
            ) {
              const ocrRes = await bridge.captureScreenOcr().catch(() => null);
              if (ocrRes?.ok && ocrRes.data) {
                const snap: ScreenOcrSnapshot = {
                  capturedAt: new Date().toISOString(),
                  activeApp:
                    typeof ocrRes.data.activeApp === 'string'
                      ? ocrRes.data.activeApp
                      : undefined,
                  windowTitle:
                    typeof ocrRes.data.windowTitle === 'string'
                      ? ocrRes.data.windowTitle
                      : undefined,
                  ocrText: String(ocrRes.data.ocrText || ''),
                  imageBase64:
                    typeof ocrRes.data.imageBase64 === 'string'
                      ? ocrRes.data.imageBase64
                      : undefined,
                };
                setScreenOcrSnapshot(snap);
              }
            }
            setAgenticSteps([
              { index: 1, label: `Dispatch ${actionType.replace('companion_', '')}`, status: 'completed' },
              { index: 2, label: 'Verified native OS response', status: 'completed', detail: finalDetail },
            ]);
            setActionNotice(finalDetail);
            setJarvisSubtitle(finalDetail);
            setActiveScopeLabel('PC Companion');
            setTaskState('COMPLETED');
            onRecordExecutionLog({
              command: String(args.target || actionType),
              intent: actionType,
              source: 'companion',
              status: 'COMPLETED',
              detail: finalDetail,
              verified: true,
            });
            await speakWithAgentVoice(finalDetail, { updateCoreState: true });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Computer control action failed.';
        setErrorMessage(msg);
        setTaskState('FAILED');
      }
    },
    [onClearAllMemories, onRecordExecutionLog, speakWithAgentVoice, telemetry.pythonAgentConnected]
  );

  const handleComputerActionSignal = useCallback(
    (payload: {
      action?: string;
      target?: string;
      value?: string;
      subAction?: string;
      x?: number;
      y?: number;
      keys?: string[];
      requiresConfirmation?: boolean;
      callId?: string;
    }) => {
      const action = payload.action || 'system_info';
      const target = payload.target || '';
      const value = payload.value || '';

      if (action === 'open_local_file') {
        void pickAndReadLocalFile()
          .then((f) => {
            setActionNotice(`Loaded file "${f.name}" (${f.size} bytes).`);
            setTaskState('COMPLETED');
          })
          .catch((err) => {
            setErrorMessage(
              err instanceof Error ? err.message : 'Unable to open local file.'
            );
            setTaskState('FAILED');
          });
        return;
      }

      if (action === 'search_local_files') {
        if (!dirHandleRef.current) {
          setShowRightPanel(true);
          setActiveRightTab('system');
          setActionNotice(
            'Grant access to a local folder in System Status to search files.'
          );
          return;
        }
        void listAndSearchDirectory(dirHandleRef.current, target || value)
          .then((entries) => {
            setFolderEntries(entries);
            setShowRightPanel(true);
            setActiveRightTab('system');
            setActionNotice(
              `Found ${entries.length} matching item(s) in ${dirHandleRef.current?.name}.`
            );
            setTaskState('COMPLETED');
          })
          .catch((err) => {
            setErrorMessage(err instanceof Error ? err.message : 'Search failed.');
            setTaskState('FAILED');
          });
        return;
      }

      if (action === 'system_info') {
        setShowRightPanel(true);
        setActiveRightTab('pcvision');
        if (companionRef.current?.connected) {
          void companionRef.current.getHardwareTelemetry().then((res) => {
            if (res.ok && res.data) {
              const hw = res.data as unknown as HardwareTelemetry;
              setPcHardwareTelemetry(hw);
              setTelemetry((prev) => ({
                ...prev,
                pythonAgentConnected: Boolean(hw.pythonAgentReady),
              }));
            }
            setActionNotice(res.message);
            setJarvisSubtitle(res.message);
            setTaskState(res.ok ? 'COMPLETED' : 'FAILED');
            void speakWithAgentVoice(res.message, { updateCoreState: true });
          });
        } else {
          setActionNotice('Opened PC & Vision telemetry.');
          setTaskState('COMPLETED');
        }
        return;
      }

      // Safe read-only Windows Agent discovery & OCR Vision
      if (
        action === 'companion_list_apps' ||
        action === 'companion_list_windows' ||
        action === 'companion_file_duplicates' ||
        action === 'companion_screen_ocr'
      ) {
        const bridge = companionRef.current;
        if (!bridge || !bridge.connected) {
          const offlineMsg = 'Desktop Companion is offline. Connect Companion in System Status to inspect apps, windows, or Screen OCR.';
          setErrorMessage(offlineMsg);
          setJarvisSubtitle(offlineMsg);
          setTaskState('FAILED');
          void speakWithAgentVoice(offlineMsg, { updateCoreState: true });
          return;
        }
        setShowRightPanel(true);
        setActiveRightTab('pcvision');
        setTaskState('EXECUTING');
        void bridge
          .sendCommand(action, { target, value, subAction: payload.subAction })
          .then(async (res) => {
            if (action === 'companion_screen_ocr' && res.ok && res.data) {
              const snap: ScreenOcrSnapshot = {
                capturedAt: new Date().toISOString(),
                activeApp:
                  typeof res.data.activeApp === 'string' ? res.data.activeApp : undefined,
                windowTitle:
                  typeof res.data.windowTitle === 'string' ? res.data.windowTitle : undefined,
                ocrText: String(res.data.ocrText || ''),
                imageBase64:
                  typeof res.data.imageBase64 === 'string' ? res.data.imageBase64 : undefined,
              };
              setScreenOcrSnapshot(snap);
              // Optional server AI analysis when user explicitly invoked OCR vision
              if (!quotaStatusRef.current.limited && (snap.imageBase64 || snap.ocrText)) {
                try {
                  const headers = await getAuthHeadersRef.current();
                  const vRes = await fetch('/api/pc/verify-screen', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                      goal: target || 'Summarize active screen context and visible UI controls.',
                      imageBase64: snap.imageBase64,
                      ocrText: snap.ocrText,
                    }),
                  });
                  if (vRes.ok) {
                    const vData = (await vRes.json()) as { summary?: string };
                    if (vData.summary) {
                      snap.verificationSummary = vData.summary;
                      setScreenOcrSnapshot({ ...snap });
                    }
                  }
                } catch {
                  // non-fatal
                }
              }
            }
            const spoken =
              (screenOcrSnapshot?.verificationSummary && action === 'companion_screen_ocr')
                ? screenOcrSnapshot.verificationSummary
                : res.message;
            setActionNotice(res.message);
            setJarvisSubtitle(spoken);
            setActiveScopeLabel('PC Companion');
            setTaskState(res.ok ? 'COMPLETED' : 'FAILED');
            onRecordExecutionLog({
              command: target || action,
              intent: action,
              source: 'companion',
              status: res.ok ? 'COMPLETED' : 'FAILED',
              detail: res.message,
              verified: res.ok,
            });
            await speakWithAgentVoice(spoken, { updateCoreState: true });
          });
        return;
      }

      // Low-risk immediate execution when Companion is already connected and confirmation not required
      if (
        !payload.requiresConfirmation &&
        (action === 'companion_media_control' || action === 'companion_read_file')
      ) {
        const mappedImmediate: PendingConfirmationAction['actionType'] =
          action === 'companion_media_control'
            ? 'companion_media_control'
            : 'companion_read_file';
        void executeBrowserOrCompanionControl(mappedImmediate, { target, value });
        return;
      }

      // Privileged / sensitive actions always open Confirmation Gate
      const mappedType: PendingConfirmationAction['actionType'] =
        action === 'create_local_folder'
          ? 'create_local_folder'
          : action === 'capture_screenshot'
          ? 'capture_screenshot'
          : action === 'companion_launch_app'
          ? 'companion_launch_app'
          : action === 'companion_close_app'
          ? 'companion_close_app'
          : action === 'companion_media_control'
          ? 'companion_media_control'
          : action === 'companion_write_file'
          ? 'companion_write_file'
          : action === 'companion_run_command'
          ? 'companion_run_command'
          : action === 'companion_window_control'
          ? 'companion_window_control'
          : action === 'companion_mouse_action'
          ? 'companion_mouse_action'
          : action === 'companion_keyboard_action'
          ? 'companion_keyboard_action'
          : action === 'companion_file_organize'
          ? 'companion_file_organize'
          : action === 'companion_lock_system'
          ? 'companion_lock_system'
          : 'companion_system_setting';

      setPendingConfirmation({
        id: payload.callId || `conf_${Date.now()}`,
        toolName: 'computer_control',
        title:
          mappedType === 'capture_screenshot'
            ? 'Confirm Screen Capture'
            : mappedType === 'create_local_folder'
            ? 'Confirm Local Folder Creation'
            : mappedType === 'companion_launch_app'
            ? 'Confirm Desktop App Launch'
            : mappedType === 'companion_close_app'
            ? 'Confirm Close Application'
            : mappedType === 'companion_window_control'
            ? 'Confirm Window Management'
            : mappedType === 'companion_mouse_action'
            ? 'Confirm Mouse Input'
            : mappedType === 'companion_keyboard_action'
            ? 'Confirm Keyboard Typing / Shortcut'
            : mappedType === 'companion_file_organize'
            ? 'Confirm File Organization'
            : mappedType === 'companion_lock_system'
            ? 'Confirm Lock Workstation'
            : mappedType === 'companion_media_control'
            ? 'Confirm Media Playback Control'
            : mappedType === 'companion_write_file'
            ? 'Confirm File / Note Write'
            : mappedType === 'companion_run_command'
            ? 'Confirm System Command'
            : 'Confirm System Setting Change',
        description:
          mappedType === 'capture_screenshot'
            ? 'August is requesting permission to capture one frame from your screen.'
            : mappedType === 'create_local_folder'
            ? `Create subfolder "${target || 'Jarvis_Folder'}" in your approved workspace directory.`
            : `Execute "${target || action}" ${
                value || payload.subAction ? `(${payload.subAction || value})` : ''
              } via your Windows Desktop Companion.`,
        target: target || action,
        actionType: mappedType,
        args: {
          target,
          value,
          subAction: payload.subAction,
          x: payload.x,
          y: payload.y,
          keys: payload.keys,
        },
        riskLevel:
          mappedType === 'create_local_folder' ||
          mappedType === 'companion_close_app' ||
          mappedType === 'companion_run_command' ||
          mappedType === 'companion_lock_system' ||
          mappedType === 'companion_file_organize'
            ? 'high'
            : 'medium',
        callId: payload.callId,
      });
    },
    [executeBrowserOrCompanionControl, onRecordExecutionLog, screenOcrSnapshot?.verificationSummary, speakWithAgentVoice]
  );

  // Client-side local deterministic executor so essential commands run offline & even at 429 quota cooldown
  const tryExecuteLocalCommand = useCallback(
    async (rawCommand: string): Promise<boolean> => {
      const localCmd = parseLocalCommand(rawCommand);
      if (!localCmd) return false;

      if (localCmd.type === 'stop_speaking') {
        stopAllSpeaking();
        setJarvisSubtitle('Speech stopped.');
        setTaskState('COMPLETED');
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'stop_speaking',
          source: 'local',
          status: 'COMPLETED',
          detail: 'Stopped active speech playback.',
          verified: true,
        });
        return true;
      }

      if (localCmd.type === 'create_schedule') {
        setCoreState('executing');
        setTaskState('EXECUTING');
        const created = await onCreateSchedule({
          kind: localCmd.kind,
          title: localCmd.title,
          triggerAt: localCmd.triggerAtIso,
          durationSeconds: localCmd.durationSeconds,
          recurrence: localCmd.recurrence,
        });

        if (localCmd.kind === 'timer' && localCmd.durationSeconds && created) {
          onSyncState({
            ...stateRef.current,
            timers: [
              {
                id: created.item.id,
                label: created.item.title,
                durationSeconds: localCmd.durationSeconds,
                remainingSeconds: localCmd.durationSeconds,
                running: true,
                createdAt: created.item.createdAt,
              },
              ...stateRef.current.timers,
            ],
          });
        }

        const msg = created?.duplicate
          ? `You already have that active ${localCmd.kind} scheduled.`
          : localCmd.spokenConfirmation;
        setJarvisSubtitle(msg);
        setActionNotice(msg);
        setTaskState('SCHEDULED');
        onRecordSpokenTurn('model', msg, { aiMode: configRef.current.aiMode });
        onRecordExecutionLog({
          command: rawCommand,
          intent: `create_${localCmd.kind}`,
          source: 'local',
          status: 'SCHEDULED',
          detail: msg,
          verified: Boolean(created),
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'list_schedules') {
        const active = schedulesRef.current.filter(
          (s) => s.status === 'scheduled' || s.status === 'snoozed'
        );
        const filtered = localCmd.kind
          ? active.filter((s) => s.kind === localCmd.kind)
          : active;
        const msg =
          filtered.length === 0
            ? `You have no active ${localCmd.kind ? `${localCmd.kind}s` : 'alarms or reminders'}.`
            : `You have ${filtered.length} active schedule${filtered.length === 1 ? '' : 's'}: ${filtered
                .slice(0, 4)
                .map((s) => {
                  const when = new Date(s.snoozedUntil || s.triggerAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  });
                  return `${s.kind} ${s.title} at ${when}`;
                })
                .join('; ')}.`;
        setShowLeftPanel(true);
        setActiveLeftTab('alarms');
        setJarvisSubtitle(msg);
        setTaskState('COMPLETED');
        onRecordSpokenTurn('model', msg, { aiMode: configRef.current.aiMode });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'cancel_schedule') {
        const active = schedulesRef.current.filter(
          (s) =>
            (s.status === 'scheduled' || s.status === 'snoozed') &&
            (!localCmd.kind || s.kind === localCmd.kind)
        );
        const q = localCmd.query?.toLowerCase() || '';
        const matches = q
          ? active.filter((s) => s.title.toLowerCase().includes(q))
          : active;
        for (const item of matches) {
          await onUpdateSchedule(item.id, { status: 'cancelled' });
        }
        const ok = matches.length > 0;
        const msg = ok
          ? `Cancelled ${matches.map((m) => `${m.kind} ${m.title}`).join(', ')}.`
          : `No matching active ${localCmd.kind || 'schedule'} found to cancel.`;
        setJarvisSubtitle(msg);
        setTaskState(ok ? 'COMPLETED' : 'FAILED');
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'cancel_schedule',
          source: 'local',
          status: ok ? 'COMPLETED' : 'FAILED',
          detail: msg,
          verified: ok,
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'snooze_schedule') {
        const candidates = schedulesRef.current.filter(
          (s) => s.status === 'triggered' || s.status === 'scheduled' || s.status === 'snoozed'
        );
        const q = localCmd.query?.toLowerCase() || '';
        const target =
          (q ? candidates.find((s) => s.title.toLowerCase().includes(q)) : candidates[0]) ||
          null;
        if (target) {
          await onUpdateSchedule(target.id, { snoozeMinutes: localCmd.minutes });
        }
        const ok = Boolean(target);
        const msg = target
          ? `Snoozed ${target.title} for ${localCmd.minutes} minutes.`
          : 'No active or recent alarm or reminder found to snooze.';
        setJarvisSubtitle(msg);
        setTaskState(ok ? 'SCHEDULED' : 'FAILED');
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'snooze_schedule',
          source: 'local',
          status: ok ? 'SCHEDULED' : 'FAILED',
          detail: msg,
          verified: ok,
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'list_tasks') {
        const allTasks = stateRef.current.tasks;
        const filtered =
          localCmd.filter === 'completed'
            ? allTasks.filter((t) => t.completed)
            : localCmd.filter === 'all'
            ? allTasks
            : allTasks.filter((t) => !t.completed);
        const labelWord =
          localCmd.filter === 'completed'
            ? 'completed'
            : localCmd.filter === 'all'
            ? 'total'
            : 'pending';
        const msg =
          filtered.length === 0
            ? `You have no ${labelWord} tasks right now.`
            : `You have ${filtered.length} ${labelWord} task${filtered.length === 1 ? '' : 's'}: ${filtered
                .slice(0, 5)
                .map((t) => `${t.title}${t.dueLabel ? ` (${t.dueLabel})` : ''}`)
                .join('; ')}.`;
        setShowLeftPanel(true);
        setActiveLeftTab('tasks');
        setJarvisSubtitle(msg);
        setTaskState('COMPLETED');
        onRecordSpokenTurn('model', msg, { aiMode: configRef.current.aiMode });
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'list_tasks',
          source: 'local',
          status: 'COMPLETED',
          detail: msg,
          verified: true,
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'add_task') {
        setCoreState('executing');
        setTaskState('EXECUTING');
        onAddTask(localCmd.title, localCmd.priority || 'medium');
        const msg = `Added task "${localCmd.title}".`;
        setShowLeftPanel(true);
        setActiveLeftTab('tasks');
        setJarvisSubtitle(msg);
        setTaskState('COMPLETED');
        onRecordSpokenTurn('model', msg, { aiMode: configRef.current.aiMode });
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'add_task',
          source: 'local',
          status: 'COMPLETED',
          detail: msg,
          verified: true,
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'complete_task') {
        const q = localCmd.query.toLowerCase();
        const match = stateRef.current.tasks.find(
          (t) => !t.completed && t.title.toLowerCase().includes(q)
        );
        if (match) {
          onToggleTask(match.id);
        }
        const ok = Boolean(match);
        const msg = match
          ? `Marked task "${match.title}" as completed.`
          : `No matching open task found for "${localCmd.query}".`;
        setShowLeftPanel(true);
        setActiveLeftTab('tasks');
        setJarvisSubtitle(msg);
        setTaskState(ok ? 'COMPLETED' : 'FAILED');
        onRecordSpokenTurn('model', msg, { aiMode: configRef.current.aiMode });
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'complete_task',
          source: 'local',
          status: ok ? 'COMPLETED' : 'FAILED',
          detail: msg,
          verified: ok,
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'environment') {
        setCoreState('executing');
        setTaskState('EXECUTING');
        onUpdateEnvironment(localCmd.patch);
        setJarvisSubtitle(localCmd.spokenConfirmation);
        setTaskState('COMPLETED');
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'environment_control',
          source: 'local',
          status: 'COMPLETED',
          detail: localCmd.spokenConfirmation,
          verified: true,
        });
        await speakWithAgentVoice(localCmd.spokenConfirmation, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'open_web') {
        setCoreState('executing');
        setTaskState('EXECUTING');
        const directRes = attemptDirectLaunch(localCmd.url);
        let openedVia: LaunchTarget['launchedVia'] = directRes.blocked ? 'blocked' : 'browser_tab';
        let stillBlocked = directRes.blocked;
        if (directRes.blocked && companionRef.current?.connected) {
          const cmp = await companionRef.current.sendCommand('companion_open_url', {
            url: localCmd.url,
          });
          if (cmp.ok) {
            openedVia = 'companion';
            stillBlocked = false;
          }
        }
        setLaunchTarget({
          name: localCmd.name,
          url: localCmd.url,
          searchQuery: localCmd.searchQuery,
          popupBlocked: stillBlocked,
          launchedVia: openedVia,
          copiedUrl: false,
        });
        const msg = stillBlocked
          ? `Auto-popup was blocked by your browser. Click Open ${localCmd.name} below.`
          : `Opened ${localCmd.name} for you.`;
        setJarvisSubtitle(msg);
        setTaskState('COMPLETED');
        onRecordSpokenTurn('model', msg, { aiMode: configRef.current.aiMode });
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'open_web_app',
          source: openedVia === 'companion' ? 'companion' : 'local',
          status: 'COMPLETED',
          detail: `${msg} (${localCmd.url})`,
          verified: true,
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'computer_action') {
        setCoreState('executing');
        setTaskState('EXECUTING');
        const needsCompanion = localCmd.action.startsWith('companion_');
        if (needsCompanion && !companionRef.current?.connected) {
          const failMsg = `Desktop Companion is offline on your PC, Sir, so I could not execute "${localCmd.label}". Connect Desktop Companion in System Status first.`;
          setErrorMessage(failMsg);
          setJarvisSubtitle(failMsg);
          setTaskState('FAILED');
          onRecordExecutionLog({
            command: rawCommand,
            intent: localCmd.action,
            source: 'companion',
            status: 'FAILED',
            detail: failMsg,
            verified: false,
          });
          await speakWithAgentVoice(failMsg, { updateCoreState: true });
          return true;
        }
        handleComputerActionSignal({
          action: localCmd.action,
          target: localCmd.target,
          value: localCmd.value,
          subAction: localCmd.subAction,
          x: localCmd.x,
          y: localCmd.y,
          keys: localCmd.keys,
          requiresConfirmation: localCmd.requiresConfirmation,
        });
        if (localCmd.requiresConfirmation) {
          const msg = `Confirmation card is ready on screen to ${localCmd.label}, Sir.`;
          setJarvisSubtitle(msg);
          setTaskState('SCHEDULED');
          await speakWithAgentVoice(msg, { updateCoreState: true });
        }
        return true;
      }

      if (localCmd.type === 'browser_automation') {
        if (localCmd.action === 'stop_automation') {
          await onAbortBrowserAction();
          stopAllSpeaking();
          const msg = 'Stopped browser automation.';
          setJarvisSubtitle(msg);
          setActionNotice(msg);
          setTaskState('COMPLETED');
          onRecordExecutionLog({
            command: rawCommand,
            intent: 'browser_abort',
            source: 'local',
            status: 'COMPLETED',
            detail: msg,
            verified: true,
          });
          return true;
        }

        setCoreState('executing');
        setTaskState('EXECUTING');
        setShowBrowserHud(true);
        if (configRef.current.soundFeedbackEnabled !== false) {
          playStateCue('searching', Math.max(0.05, configRef.current.voiceVolume * 0.16));
        }

        // If user asked for desktop tab/scroll actions while Companion is connected, dispatch to real Chrome too
        let desktopOpenedMsg = '';
        const companionTabAction =
          localCmd.action === 'scroll'
            ? localCmd.direction === 'up' || localCmd.direction === 'top'
              ? 'scroll_up'
              : 'scroll_down'
            : localCmd.action;
        if (
          companionRef.current?.connected &&
          (companionTabAction === 'scroll_down' ||
            companionTabAction === 'scroll_up' ||
            companionTabAction === 'back' ||
            companionTabAction === 'forward' ||
            companionTabAction === 'new_tab' ||
            companionTabAction === 'close_tab')
        ) {
          const cmp = await companionRef.current.sendCommand('companion_browser_action', {
            action: companionTabAction,
            url: localCmd.url,
          });
          if (cmp.ok) {
            desktopOpenedMsg = cmp.message;
          }
        }

        const res = await onExecuteBrowserAction({
          action: localCmd.action,
          url: localCmd.url,
          engine: localCmd.engine,
          query: localCmd.query,
          resultIndex: localCmd.resultIndex,
          direction: localCmd.direction,
          targetText: localCmd.targetText,
        });

        // If Companion is connected and we navigated/opened a concrete result URL, mirror in desktop browser cleanly
        if (
          res.ok &&
          res.state?.currentUrl &&
          companionRef.current?.connected &&
          (localCmd.action === 'navigate' ||
            localCmd.action === 'open_result' ||
            localCmd.action === 'search')
        ) {
          void companionRef.current
            .sendCommand('companion_browser_action', {
              action: 'navigate',
              url: res.state.currentUrl,
            })
            .catch(() => {});
        }

        const replyMsg = res.ok ? desktopOpenedMsg || res.message : res.message;
        setJarvisSubtitle(replyMsg);
        setActionNotice(res.ok ? replyMsg : null);
        if (!res.ok) setErrorMessage(replyMsg);
        setTaskState(res.ok ? 'COMPLETED' : 'FAILED');
        if (res.ok && configRef.current.soundFeedbackEnabled !== false) {
          playStateCue('completed', Math.max(0.05, configRef.current.voiceVolume * 0.16));
          setRecentCompletedFlash(true);
          window.setTimeout(() => setRecentCompletedFlash(false), 3200);
        }
        onRecordSpokenTurn('model', replyMsg, { aiMode: configRef.current.aiMode });
        onRecordExecutionLog({
          command: rawCommand,
          intent: `browser_${localCmd.action}`,
          source: 'local',
          status: res.ok ? 'COMPLETED' : 'FAILED',
          detail: replyMsg,
          verified: res.ok,
        });
        await speakWithAgentVoice(replyMsg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'monitor_command') {
        setCoreState('executing');
        setTaskState('EXECUTING');
        let msg = '';
        let ok = true;

        if (localCmd.action === 'add' && localCmd.topic) {
          const created = await onCreateMonitor({
            query: localCmd.topic,
            officialOnly: localCmd.officialOnly,
          });
          if (created) {
            setShowLeftPanel(true);
            setActiveLeftTab('monitors');
            msg = created.duplicate
              ? `I am already monitoring ${created.topic.label}.`
              : created.initialUpdate
              ? `Monitoring ${created.topic.label}. Latest update: ${created.initialUpdate.headline}.`
              : `Now monitoring ${created.topic.label} every ${created.topic.intervalMinutes} minutes.`;
          } else {
            ok = false;
            msg = `Unable to create monitor for "${localCmd.topic}".`;
          }
        } else if (localCmd.action === 'list') {
          setShowLeftPanel(true);
          setActiveLeftTab('monitors');
          const list = monitorTopicsRef.current;
          msg =
            list.length === 0
              ? 'You are not monitoring any topics right now.'
              : `Monitoring ${list.length} topic${list.length === 1 ? '' : 's'}: ${list
                  .map((m) => `${m.label} (${m.status})`)
                  .join(', ')}.`;
        } else if (localCmd.action === 'stop' && localCmd.topic) {
          const q = localCmd.topic.toLowerCase();
          const match = monitorTopicsRef.current.find(
            (m) => m.label.toLowerCase().includes(q) || m.query.toLowerCase().includes(q)
          );
          if (match) {
            await onDeleteMonitor(match.id);
            msg = `Stopped monitoring ${match.label}.`;
          } else {
            ok = false;
            msg = `No active monitor matched "${localCmd.topic}".`;
          }
        } else if (localCmd.action === 'pause_all') {
          await onPauseAllMonitors();
          msg = 'Paused all proactive internet monitors.';
        } else if (localCmd.action === 'resume_all') {
          await onResumeAllMonitors();
          msg = 'Resumed all internet monitors.';
        } else if (localCmd.action === 'official_only') {
          await onSetOfficialOnlyMonitors(true);
          msg = 'Updated all monitors to notify only on confirmed official announcements.';
        } else if (localCmd.action === 'updates_today') {
          setShowLeftPanel(true);
          setActiveLeftTab('monitors');
          const recent = monitorUpdatesRef.current.slice(0, 4);
          msg =
            recent.length === 0
              ? 'No new verified topic updates have been discovered today.'
              : `Today's updates: ${recent
                  .map((u) => `${u.topicTitle}: ${u.headline} (${u.verification})`)
                  .join('; ')}.`;
        } else {
          ok = false;
          msg = 'Unsupported monitoring command.';
        }

        setJarvisSubtitle(msg);
        if (ok) setActionNotice(msg);
        else setErrorMessage(msg);
        setTaskState(ok ? 'COMPLETED' : 'FAILED');
        onRecordSpokenTurn('model', msg, { aiMode: configRef.current.aiMode });
        onRecordExecutionLog({
          command: rawCommand,
          intent: `monitor_${localCmd.action}`,
          source: 'local',
          status: ok ? 'COMPLETED' : 'FAILED',
          detail: msg,
          verified: ok,
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'call_command') {
        let msg = '';
        let ok = true;
        const baseCallCfg = configRef.current.callConfig || {
          enabled: true,
          handlingMode: 'notify_wait' as const,
          busyMode: false,
          busyReplyText: 'Hasan is busy right now and will get back to you shortly.',
          vipContacts: [],
          autoAnswerEnabled: false,
        };

        if (localCmd.action === 'busy_on' || localCmd.action === 'busy_off') {
          const nextBusy = localCmd.action === 'busy_on';
          onUpdateConfig((prev) => ({
            ...prev,
            callConfig: { ...baseCallCfg, busyMode: nextBusy },
          }));
          msg = nextBusy
            ? 'Busy mode is now enabled. Non-urgent notifications will wait quietly.'
            : 'Busy mode is turned off.';
        } else if (
          localCmd.action === 'dnd_on' ||
          localCmd.action === 'dnd_off' ||
          localCmd.action === 'silence_notifications'
        ) {
          const nextDnd = localCmd.action !== 'dnd_off';
          onUpdateConfig((prev) => ({
            ...prev,
            callConfig: {
              ...baseCallCfg,
              handlingMode: nextDnd ? 'silent_dnd' : 'notify_wait',
            },
          }));
          setDesktopContext((prev) => ({ ...prev, doNotDisturb: nextDnd }));
          msg = nextDnd
            ? 'Notifications silenced in Do Not Disturb mode.'
            : 'Notifications restored.';
        } else if (localCmd.action === 'who_calling') {
          const activeCall = incomingCallRef.current;
          msg = activeCall
            ? `${activeCall.callerName} is calling via ${activeCall.appSource}.`
            : 'There is no active incoming call right now.';
        } else if (localCmd.action === 'answer_call') {
          const activeCall = incomingCallRef.current;
          if (!activeCall) {
            ok = false;
            msg = 'No active incoming call to answer.';
          } else {
            onUpdateIncomingCall((prev) =>
              prev ? { ...prev, status: 'answered', actionNote: 'Answered by voice' } : prev
            );
            if (companionRef.current?.connected) {
              void companionRef.current.sendCommand('incoming_call_action', {
                callAction: 'answer',
                callerName: activeCall.callerName,
              });
            }
            msg = `Answering call from ${activeCall.callerName}.`;
          }
        } else if (localCmd.action === 'decline_call') {
          const activeCall = incomingCallRef.current;
          if (!activeCall) {
            ok = false;
            msg = 'No active incoming call right now.';
          } else {
            const useBusy = Boolean(baseCallCfg.busyMode);
            onUpdateIncomingCall((prev) =>
              prev
                ? {
                    ...prev,
                    status: useBusy ? 'busy_replied' : 'declined',
                    actionNote: useBusy ? baseCallCfg.busyReplyText : 'Declined by voice',
                  }
                : prev
            );
            if (companionRef.current?.connected) {
              void companionRef.current.sendCommand('incoming_call_action', {
                callAction: useBusy ? 'busy_reply' : 'decline',
                replyText: baseCallCfg.busyReplyText,
              });
            }
            msg = useBusy
              ? `Informed caller "${baseCallCfg.busyReplyText}".`
              : `Declined incoming call from ${activeCall.callerName}.`;
          }
        }

        setJarvisSubtitle(msg);
        setActionNotice(ok ? msg : null);
        setTaskState(ok ? 'COMPLETED' : 'FAILED');
        onRecordSpokenTurn('model', msg, { aiMode: configRef.current.aiMode });
        onRecordExecutionLog({
          command: rawCommand,
          intent: `call_${localCmd.action}`,
          source: 'local',
          status: ok ? 'COMPLETED' : 'FAILED',
          detail: msg,
          verified: ok,
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'mode_command') {
        let msg = '';
        if (localCmd.mode === 'sleep') {
          setUserSleepMode(true);
          stopAllSpeaking();
          msg = 'Entering quiet sleep mode. Say "Hey August" whenever you need me.';
          setJarvisSubtitle(msg);
          setTaskState('COMPLETED');
          return true;
        }
        if (localCmd.mode === 'wake') {
          setUserSleepMode(false);
          msg = 'Awake and standing by, Hasan.';
        } else {
          setCareModeActive(true);
          window.setTimeout(() => setCareModeActive(false), 20000);
          msg = "I'm right here, Hasan. Take a breath—tell me what's on your mind.";
        }
        setJarvisSubtitle(msg);
        setTaskState('COMPLETED');
        onRecordSpokenTurn('model', msg, { aiMode: configRef.current.aiMode });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'time_query') {
        let timeReply = `It is ${new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })} on ${new Date().toLocaleDateString([], {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })}, Sir.`;
        try {
          const res = await fetch('/api/intelligence/time');
          if (res.ok) {
            const data = (await res.json()) as {
              timeFormatted?: string;
              dateFormatted?: string;
              timezone?: string;
            };
            if (data.timeFormatted && data.dateFormatted) {
              timeReply = `It is ${data.timeFormatted} on ${data.dateFormatted}, Sir.`;
            }
          }
        } catch {
          // use local Date fallback above
        }
        setActiveScopeLabel('Local Execution');
        setJarvisSubtitle(timeReply);
        setTaskState('COMPLETED');
        onRecordSpokenTurn('model', timeReply, {
          aiMode: configRef.current.aiMode,
          scopeLabel: 'Local Execution',
        });
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'time_query',
          source: 'local',
          status: 'COMPLETED',
          detail: timeReply,
          verified: true,
        });
        await speakWithAgentVoice(timeReply, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'weather_briefing') {
        setCoreState('executing');
        setTaskState('EXECUTING');
        try {
          const headers = await getAuthHeadersRef.current();
          const res = await fetch('/api/intelligence/weather', {
            method: 'POST',
            headers,
            body: JSON.stringify({ location: localCmd.location || 'Dhaka, Bangladesh' }),
          });
          const data = (await res.json()) as {
            weather?: WeatherBriefing;
            quotaStatus?: GeminiQuotaStatus;
            error?: string;
          };
          if (data.quotaStatus) onUpdateQuotaStatus(data.quotaStatus);
          if (!res.ok || !data.weather) {
            throw new Error(data.error || 'Weather lookup unavailable right now.');
          }
          setWeatherCard(data.weather);
          setActiveScopeLabel('Verified Internet');
          const msg = `Weather for ${data.weather.location}, Sir: ${
            data.weather.temperatureC || ''
          } ${data.weather.condition}. ${data.weather.summary}`;
          setJarvisSubtitle(msg);
          setTaskState('COMPLETED');
          onRecordSpokenTurn('model', msg, {
            aiMode: configRef.current.aiMode,
            scopeLabel: 'Verified Internet',
          });
          onRecordExecutionLog({
            command: rawCommand,
            intent: 'weather_briefing',
            source: 'intelligence',
            status: 'COMPLETED',
            detail: msg,
            verified: true,
          });
          await speakWithAgentVoice(msg, { updateCoreState: true });
          return true;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unable to fetch weather right now, Sir.';
          setErrorMessage(errMsg);
          setJarvisSubtitle(errMsg);
          setTaskState('FAILED');
          await speakWithAgentVoice(errMsg, { updateCoreState: true, mood: 'sad' });
          return true;
        }
      }

      if (localCmd.type === 'news_briefing') {
        setCoreState('executing');
        setTaskState('EXECUTING');
        try {
          const headers = await getAuthHeadersRef.current();
          const res = await fetch('/api/intelligence/news', {
            method: 'POST',
            headers,
            body: JSON.stringify({ topic: localCmd.topic || 'top world & technology headlines' }),
          });
          const data = (await res.json()) as {
            topic?: string;
            summary?: string;
            items?: NewsBriefingItem[];
            fetchedAt?: string;
            quotaStatus?: GeminiQuotaStatus;
            error?: string;
          };
          if (data.quotaStatus) onUpdateQuotaStatus(data.quotaStatus);
          if (!res.ok) {
            throw new Error(data.error || 'News briefing unavailable.');
          }
          const card = {
            topic: data.topic || localCmd.topic || 'Headlines',
            summary: data.summary || 'Latest verified briefing.',
            items: Array.isArray(data.items) ? data.items : [],
            fetchedAt: data.fetchedAt || new Date().toISOString(),
          };
          setNewsCard(card);
          setActiveScopeLabel('Verified Internet');
          const msg = `${card.summary} ${
            card.items.length > 0
              ? `Top story via ${card.items[0].publisher}: ${card.items[0].headline}.`
              : ''
          }`;
          setJarvisSubtitle(msg);
          setTaskState('COMPLETED');
          onRecordSpokenTurn('model', msg, {
            aiMode: configRef.current.aiMode,
            scopeLabel: 'Verified Internet',
          });
          onRecordExecutionLog({
            command: rawCommand,
            intent: 'news_briefing',
            source: 'intelligence',
            status: 'COMPLETED',
            detail: msg,
            verified: true,
          });
          await speakWithAgentVoice(msg, { updateCoreState: true });
          return true;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unable to retrieve news right now, Sir.';
          setErrorMessage(errMsg);
          setJarvisSubtitle(errMsg);
          setTaskState('FAILED');
          await speakWithAgentVoice(errMsg, { updateCoreState: true, mood: 'sad' });
          return true;
        }
      }

      if (localCmd.type === 'maps_query') {
        setCoreState('executing');
        setTaskState('EXECUTING');
        try {
          const headers = await getAuthHeadersRef.current();
          if (localCmd.mode === 'directions') {
            const res = await fetch('/api/maps/routes', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                origin: localCmd.origin || 'Dhaka, Bangladesh',
                destination: localCmd.destination || localCmd.query,
                travelMode: localCmd.travelMode || 'DRIVE',
              }),
            });
            const data = (await res.json()) as {
              route?: MapsRouteSummary;
              quotaExceeded?: boolean;
              error?: string;
            };
            if (res.status === 429 || data.quotaExceeded) {
              window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            }
            if (!res.ok || !data.route) {
              throw new Error(data.error || 'Could not compute that route, Sir.');
            }
            setMapsRoute(data.route);
            setMapsPlaces([]);
            setShowMapsCard(true);
            setActiveScopeLabel('Verified Internet');
            const km = (data.route.distanceMeters / 1000).toFixed(1);
            const msg = `Route from ${data.route.originLabel} to ${data.route.destinationLabel}, Sir: ${km} km, approximately ${data.route.durationText}.`;
            setJarvisSubtitle(msg);
            setTaskState('COMPLETED');
            onRecordSpokenTurn('model', msg, {
              aiMode: configRef.current.aiMode,
              scopeLabel: 'Verified Internet',
            });
            onRecordExecutionLog({
              command: rawCommand,
              intent: 'maps_routes',
              source: 'maps',
              status: 'COMPLETED',
              detail: msg,
              verified: true,
            });
            await speakWithAgentVoice(msg, { updateCoreState: true });
            return true;
          }

          const res = await fetch('/api/maps/places-search', {
            method: 'POST',
            headers,
            body: JSON.stringify({ query: localCmd.query }),
          });
          const data = (await res.json()) as {
            places?: MapsPlaceItem[];
            quotaExceeded?: boolean;
            error?: string;
          };
          if (res.status === 429 || data.quotaExceeded) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
          if (!res.ok) {
            throw new Error(data.error || 'Places search unavailable.');
          }
          const found = Array.isArray(data.places) ? data.places : [];
          setMapsPlaces(found);
          setMapsRoute(null);
          setShowMapsCard(true);
          setActiveScopeLabel('Verified Internet');
          const msg =
            found.length === 0
              ? `I couldn't find matching places on Google Maps for "${localCmd.query}", Sir.`
              : `Found ${found.length} place${found.length === 1 ? '' : 's'} for "${localCmd.query}", Sir. Top match: ${found[0].name} at ${found[0].address}.`;
          setJarvisSubtitle(msg);
          setTaskState('COMPLETED');
          onRecordSpokenTurn('model', msg, {
            aiMode: configRef.current.aiMode,
            scopeLabel: 'Verified Internet',
          });
          onRecordExecutionLog({
            command: rawCommand,
            intent: 'maps_places',
            source: 'maps',
            status: 'COMPLETED',
            detail: msg,
            verified: found.length > 0,
          });
          await speakWithAgentVoice(msg, { updateCoreState: true });
          return true;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Google Maps query failed, Sir.';
          setErrorMessage(errMsg);
          setJarvisSubtitle(errMsg);
          setTaskState('FAILED');
          await speakWithAgentVoice(errMsg, { updateCoreState: true, mood: 'sad' });
          return true;
        }
      }

      if (localCmd.type === 'knowledge_query') {
        setCoreState('thinking');
        setTaskState('THINKING');
        const rag = await searchKnowledgeVault(
          localCmd.query,
          knowledgeDocsRef.current,
          knowledgeChunksRef.current,
          getAuthHeadersRef.current
        );
        if (rag.citations.length === 0) {
          setShowLeftPanel(true);
          setActiveLeftTab('knowledge');
          const emptyMsg =
            knowledgeDocsRef.current.length === 0
              ? 'Your Knowledge Vault is currently empty, Sir. Upload PDFs, notes, or Markdown documents in the Knowledge tab first.'
              : `No matching sections were found in your active Knowledge Vault documents for "${localCmd.query}", Sir.`;
          setJarvisSubtitle(emptyMsg);
          setActiveScopeLabel('Internal Knowledge');
          setActiveCitations([]);
          setTaskState('COMPLETED');
          await speakWithAgentVoice(emptyMsg, { updateCoreState: true });
          return true;
        }
        setActiveCitations(rag.citations);
        setActiveScopeLabel('Internal Knowledge');
        const top = rag.citations[0];
        const citationSummary = `From your Knowledge Vault [${top.docName} · ${top.sectionLabel}], Sir: ${top.excerpt}`;
        setJarvisSubtitle(citationSummary);
        setTaskState('COMPLETED');
        onRecordSpokenTurn('model', citationSummary, {
          aiMode: configRef.current.aiMode,
          citations: rag.citations,
          scopeLabel: 'Internal Knowledge',
        });
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'knowledge_rag',
          source: 'rag',
          status: 'COMPLETED',
          detail: `Cited ${rag.citations.map((c) => `${c.docName} · ${c.sectionLabel}`).join(', ')}`,
          verified: true,
        });
        await speakWithAgentVoice(citationSummary, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'home_assistant') {
        if (!haConnectedRef.current) {
          setShowLeftPanel(true);
          setActiveLeftTab('smarthome');
          const msg =
            'Home Assistant is not paired in this session yet, Sir. Please open the Smart Home tab to connect your instance.';
          setJarvisSubtitle(msg);
          setTaskState('FAILED');
          await speakWithAgentVoice(msg, { updateCoreState: true });
          return true;
        }
        const entities = haEntitiesRef.current;
        if (localCmd.action === 'list' || localCmd.action === 'status') {
          setShowLeftPanel(true);
          setActiveLeftTab('smarthome');
          const msg =
            entities.length === 0
              ? 'Home Assistant is connected, Sir, but no controllable devices were returned.'
              : `You have ${entities.length} smart home devices connected, Sir, including ${entities
                  .slice(0, 4)
                  .map((e) => `${e.friendlyName} (${e.state})`)
                  .join(', ')}.`;
          setActiveScopeLabel('Smart Home');
          setJarvisSubtitle(msg);
          setTaskState('COMPLETED');
          await speakWithAgentVoice(msg, { updateCoreState: true });
          return true;
        }

        const hint = (localCmd.entityHint || '').toLowerCase();
        const match =
          entities.find(
            (e) =>
              hint &&
              (e.friendlyName.toLowerCase().includes(hint) ||
                e.entityId.toLowerCase().includes(hint))
          ) || entities.find((e) => e.domain === 'light' || e.domain === 'switch');

        if (!match) {
          const msg = `No matching Home Assistant device was found for "${localCmd.entityHint || 'device'}", Sir.`;
          setJarvisSubtitle(msg);
          setTaskState('FAILED');
          await speakWithAgentVoice(msg, { updateCoreState: true, mood: 'sad' });
          return true;
        }

        setCoreState('executing');
        setTaskState('EXECUTING');
        const service =
          localCmd.action === 'set_temperature'
            ? 'set_temperature'
            : localCmd.action === 'turn_off'
            ? match.domain === 'cover'
              ? 'close_cover'
              : 'turn_off'
            : match.domain === 'cover'
            ? 'open_cover'
            : 'turn_on';
        const dataPayload =
          localCmd.action === 'set_temperature' && localCmd.value !== undefined
            ? { temperature: localCmd.value }
            : localCmd.action === 'set_brightness' && localCmd.value !== undefined
            ? { brightness_pct: localCmd.value }
            : undefined;
        const result = await onCallHomeAssistantService({
          domain: match.domain,
          service,
          entityId: match.entityId,
          data: dataPayload,
        });
        const msg = result.ok
          ? `${match.friendlyName} updated (${service.replace('_', ' ')}), Sir.`
          : result.message;
        setActiveScopeLabel('Smart Home');
        setJarvisSubtitle(msg);
        setTaskState(result.ok ? 'COMPLETED' : 'FAILED');
        onRecordSpokenTurn('model', msg, {
          aiMode: configRef.current.aiMode,
          scopeLabel: 'Smart Home',
        });
        onRecordExecutionLog({
          command: rawCommand,
          intent: `ha_${service}`,
          source: 'home_assistant',
          status: result.ok ? 'COMPLETED' : 'FAILED',
          detail: `${match.entityId}: ${msg}`,
          verified: result.ok,
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'studio_switch') {
        setActiveStudio(localCmd.studio);
        if (localCmd.subTab === 'dev' || localCmd.subTab === 'bugfix') {
          setDevSubTab(localCmd.subTab);
        } else if (localCmd.subTab === '3d' || localCmd.subTab === '2d' || localCmd.subTab === '1d') {
          setCreativeSubTab(localCmd.subTab);
        } else if (
          localCmd.subTab === 'skills' ||
          localCmd.subTab === 'agents' ||
          localCmd.subTab === 'workflows'
        ) {
          setSkillsSubTab(localCmd.subTab);
        } else if (localCmd.subTab === 'workspace' || localCmd.subTab === 'calls') {
          setPersonalSubTab(localCmd.subTab);
        }
        setStudioNavSeq((n) => n + 1);
        const label = localCmd.subTab
          ? `${localCmd.studio.toUpperCase()} · ${localCmd.subTab.toUpperCase()}`
          : localCmd.studio.toUpperCase();
        const msg = `Switched to ${label} Studio, Sir.`;
        setActionNotice(msg);
        setJarvisSubtitle(msg);
        setTaskState('COMPLETED');
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'studio_switch',
          source: 'local',
          status: 'COMPLETED',
          detail: msg,
          verified: true,
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'outgoing_call') {
        const q = localCmd.contactQuery.toLowerCase().trim();
        const matches = contactsRef.current.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.aliases || '').toLowerCase().includes(q) ||
            (c.relation || '').toLowerCase().includes(q) ||
            c.phone.replace(/\s+/g, '').includes(q.replace(/\s+/g, ''))
        );
        if (matches.length === 1 && matches[0].consentToCall) {
          const target = matches[0];
          setPendingConfirmation({
            id: `call_conf_${Date.now()}`,
            toolName: 'smart_calling',
            title: `Confirm Call to ${target.name}`,
            description: `Hand off outgoing call to ${target.name} (${target.phone}) via Windows Phone Link / OS dialer?`,
            target: target.name,
            actionType: 'place_outgoing_call',
            args: { contactName: target.name, phone: target.phone },
            riskLevel: 'high',
          });
          const msg = `Confirmation card is ready to call ${target.name}, Sir.`;
          setJarvisSubtitle(msg);
          setTaskState('SCHEDULED');
          await speakWithAgentVoice(msg, { updateCoreState: true });
          return true;
        }
        setActiveStudio('personal');
        setPersonalSubTab('calls');
        setStudioNavSeq((n) => n + 1);
        const msg =
          matches.length > 1
            ? `Found ${matches.length} contacts matching "${localCmd.contactQuery}". Please pick the right contact in the Calling Hub.`
            : matches.length === 1 && !matches[0].consentToCall
            ? `${matches[0].name} does not have voice calling consent enabled yet. Enable consent in the Calling Hub.`
            : `No saved contact matched "${localCmd.contactQuery}". Opened the Smart Calling Hub so you can add or sync contacts.`;
        setJarvisSubtitle(msg);
        setActionNotice(msg);
        setTaskState('COMPLETED');
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'outgoing_call_lookup',
          source: 'calling',
          status: 'COMPLETED',
          detail: msg,
          verified: true,
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      if (localCmd.type === 'clipboard_command') {
        if (localCmd.action === 'read') {
          let clipText = '';
          if (companionRef.current?.connected) {
            const res = await companionRef.current.readClipboard();
            if (res.ok && res.data && typeof res.data.text === 'string') {
              clipText = res.data.text;
            }
          }
          if (!clipText && navigator.clipboard?.readText) {
            clipText = await navigator.clipboard.readText().catch(() => '');
          }
          const msg = clipText
            ? `Clipboard contents: "${clipText.slice(0, 180)}"`
            : 'Your clipboard appears empty or browser clipboard read permission was not granted.';
          setJarvisSubtitle(msg);
          setActionNotice(msg);
          setTaskState(clipText ? 'COMPLETED' : 'FAILED');
          await speakWithAgentVoice(msg, { updateCoreState: true });
          return true;
        }
        if (localCmd.action === 'write') {
          const textToCopy = localCmd.text || '';
          let ok = false;
          if (companionRef.current?.connected) {
            const res = await companionRef.current.writeClipboard(textToCopy);
            ok = res.ok;
          }
          if (!ok && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(textToCopy).then(() => {
              ok = true;
            }).catch(() => {});
          }
          const msg = ok
            ? `Copied "${textToCopy.slice(0, 80)}" to your clipboard, Sir.`
            : 'Unable to write to clipboard right now.';
          setJarvisSubtitle(msg);
          setActionNotice(msg);
          setTaskState(ok ? 'COMPLETED' : 'FAILED');
          await speakWithAgentVoice(msg, { updateCoreState: true });
          return true;
        }
      }

      if (localCmd.type === 'skill_command') {
        const enabledSkills = skillsRef.current.filter((s) => s.enabled);
        if (localCmd.action === 'list') {
          setActiveStudio('skills');
          setSkillsSubTab('skills');
          setStudioNavSeq((n) => n + 1);
          const msg =
            enabledSkills.length === 0
              ? 'You have no enabled skills yet. Opened the Skills Library so you can create or install skills.'
              : `You have ${enabledSkills.length} active skill${enabledSkills.length === 1 ? '' : 's'}: ${enabledSkills
                  .slice(0, 5)
                  .map((s) => s.name)
                  .join(', ')}.`;
          setJarvisSubtitle(msg);
          setTaskState('COMPLETED');
          await speakWithAgentVoice(msg, { updateCoreState: true });
          return true;
        }
        const q = (localCmd.query || '').toLowerCase();
        const match = enabledSkills.find(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.triggerPattern.toLowerCase().includes(q)
        );
        setActiveStudio('skills');
        setSkillsSubTab(match ? 'agents' : 'skills');
        setStudioNavSeq((n) => n + 1);
        const msg = match
          ? `Triggered skill "${match.name}" (v${match.activeVersion}), Sir. Instructions loaded in Skills & Agents.`
          : `No active skill matched "${localCmd.query}". Opened Skills Library.`;
        setJarvisSubtitle(msg);
        setActionNotice(msg);
        setTaskState(match ? 'COMPLETED' : 'FAILED');
        onRecordExecutionLog({
          command: rawCommand,
          intent: 'skill_command',
          source: 'skills',
          status: match ? 'COMPLETED' : 'FAILED',
          detail: msg,
          verified: Boolean(match),
        });
        await speakWithAgentVoice(msg, { updateCoreState: true });
        return true;
      }

      return false;
    },
    [
      handleComputerActionSignal,
      onAbortBrowserAction,
      onAddTask,
      onCallHomeAssistantService,
      onCreateMonitor,
      onCreateSchedule,
      onDeleteMonitor,
      onExecuteBrowserAction,
      onPauseAllMonitors,
      onRecordExecutionLog,
      onRecordSpokenTurn,
      onResumeAllMonitors,
      onSetOfficialOnlyMonitors,
      onSyncState,
      onToggleTask,
      onUpdateConfig,
      onUpdateEnvironment,
      onUpdateIncomingCall,
      onUpdateQuotaStatus,
      onUpdateSchedule,
      speakWithAgentVoice,
      stopAllSpeaking,
    ]
  );

  // Fallback Text+Tool+TTS Command Runner (used automatically when Gemini Live drops or text bar submitted)
  const executeFallbackVoiceCommand = useCallback(
    async (spokenText: string) => {
      const cleaned = spokenText.trim();
      if (!cleaned) {
        const meta = resolveActiveWakeEngine(
          configRef.current.wakeEngine,
          configRef.current.picovoiceAccessKey
        );
        if (wakeEnabledRef.current && meta.type !== 'manual_only') {
          setCoreState('standby');
          void armWakeStandbyRef.current(false);
        } else {
          setCoreState('idle');
        }
        return;
      }

      // 1800ms deduplication window for rapid duplicate transcripts
      const dedupeKey = cleaned.toLowerCase();
      const nowMs = Date.now();
      if (
        lastExecutedCmdRef.current.key === dedupeKey &&
        nowMs - lastExecutedCmdRef.current.ts < 1800
      ) {
        return;
      }
      lastExecutedCmdRef.current = { key: dedupeKey, ts: nowMs };

      lastUserCommandRef.current = cleaned;
      setVoicePipelineMode('fallback');
      setErrorMessage(null);
      setUserSubtitle(cleaned);
      setJarvisSubtitle('');
      setTaskState('THINKING');
      setCoreState('thinking');

      onRecordSpokenTurn('user', cleaned, {
        aiMode: configRef.current.aiMode,
      });

      // Local deterministic fast-path works with 0 latency and 0 Gemini quota
      const handledLocally = await tryExecuteLocalCommand(cleaned);
      if (handledLocally) {
        return;
      }

      // Guard if Gemini quota cooldown is active (complex AI queries wait cleanly; voice standby stays armed!)
      if (quotaStatusRef.current.limited && quotaStatusRef.current.retryAfterSeconds > 0) {
        const cooldownMsg = `AI reasoning is cooling down for ${quotaStatusRef.current.retryAfterSeconds} seconds. Local voice commands for apps, websites, timers, alarms, browser search, and monitoring remain active.`;
        setErrorMessage(cooldownMsg);
        setJarvisSubtitle(cooldownMsg);
        setTaskState('FAILED');
        onRecordExecutionLog({
          command: cleaned,
          intent: 'gemini_chat',
          source: 'local',
          status: 'FAILED',
          detail: cooldownMsg,
          verified: false,
        });
        await speakWithAgentVoice(cooldownMsg, { updateCoreState: true });
        if (wakeEnabledRef.current) {
          setCoreState('standby');
          void armWakeStandbyRef.current(false);
        }
        return;
      }

      setToolProgressText(
        configRef.current.spokenToolUpdates
          ? 'Processing request via Gemini Brain & Agent Voice...'
          : null
      );

      const localIntent = resolveClientLaunchIntent(cleaned);

      try {
        // Automatic Internal Knowledge RAG grounding if relevant uploaded doc chunks exist
        let ragResult: {
          citations: KnowledgeCitation[];
          contextText: string;
          topScore: number;
        } = { citations: [], contextText: '', topScore: 0 };
        if (knowledgeChunksRef.current.length > 0 && knowledgeDocsRef.current.some((d) => d.enabled)) {
          ragResult = await searchKnowledgeVault(
            cleaned,
            knowledgeDocsRef.current,
            knowledgeChunksRef.current,
            getAuthHeadersRef.current
          );
        }

        const recentHistory = messages
          .slice(-6)
          .map((m) => ({ role: m.role, text: m.text }));
        const finalUserText =
          ragResult.topScore >= 0.42 && ragResult.contextText
            ? `${cleaned}\n\n[Internal Knowledge Context — cite as [Doc · Section] when relevant]:\n${ragResult.contextText}`
            : cleaned;
        recentHistory.push({ role: 'user', text: finalUserText });

        const headers = await getAuthHeadersRef.current();
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages: recentHistory,
            state: stateRef.current,
            config: {
              personaPrompt: configRef.current.systemInstruction,
              enabledTools: configRef.current.enabledTools,
              aiMode: configRef.current.aiMode,
              memoryEnabled: configRef.current.memoryEnabled,
              preferredLanguage:
                configRef.current.preferredLanguage || configRef.current.voiceLanguage,
              voiceMoodDefault: configRef.current.voiceMoodDefault || 'normal',
            },
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          updatedState?: AssistantState;
          trace?: Array<{ toolName: string }>;
          launchTarget?: LaunchTarget;
          memoryProposals?: PendingMemoryProposal[];
          computerActions?: Array<{
            action?: string;
            target?: string;
            value?: string;
            requiresConfirmation?: boolean;
            callId?: string;
          }>;
          memoriesUsed?: string[];
          schedules?: ScheduledItem[];
          quotaStatus?: GeminiQuotaStatus;
          quotaLimited?: boolean;
          retryAfterSeconds?: number;
          error?: string;
        };

        if (data.quotaStatus) {
          onUpdateQuotaStatus(data.quotaStatus);
        } else if (data.quotaLimited && data.retryAfterSeconds) {
          onUpdateQuotaStatus({
            limited: true,
            retryAfterSeconds: data.retryAfterSeconds,
            lastError: data.error,
          });
        }

        if (!res.ok) {
          throw new Error(data.error || 'Voice fallback request failed.');
        }

        if (Array.isArray(data.schedules)) {
          onSyncSchedulesFromServer(data.schedules);
        }
        if (data.updatedState) {
          onSyncState(data.updatedState);
        }
        if (Array.isArray(data.memoriesUsed)) {
          setLastMemoriesUsed(data.memoriesUsed);
        }
        if (data.launchTarget?.url) {
          dispatchLaunchTarget(data.launchTarget);
        } else if (localIntent?.kind === 'web' && localIntent.url) {
          dispatchLaunchTarget({
            name: localIntent.name,
            url: localIntent.url,
            searchQuery: localIntent.searchQuery,
          });
        }
        if (Array.isArray(data.memoryProposals) && data.memoryProposals.length > 0) {
          setPendingProposals((prev) => [...data.memoryProposals!, ...prev]);
        }
        if (Array.isArray(data.computerActions)) {
          for (const act of data.computerActions) {
            handleComputerActionSignal(act);
          }
        }
        if (
          configRef.current.spokenToolUpdates &&
          Array.isArray(data.trace) &&
          data.trace.length > 0
        ) {
          const toolNames = data.trace.map((t) => t.toolName).join(', ');
          setActionNotice(`Executed: ${toolNames}`);
        }
        setTaskState('COMPLETED');
        setToolProgressText(null);

        const reply = data.reply?.trim() || 'Completed your request, Sir.';
        const usedCitations = ragResult.topScore >= 0.42 ? ragResult.citations : [];
        const scopeLabel: AssistantMessage['scopeLabel'] =
          usedCitations.length > 0 ? 'Internal Knowledge' : 'General Reasoning';
        const computedMood = detectResponseMood(
          reply,
          cleaned,
          configRef.current.voiceMoodDefault || 'normal'
        );
        setActiveCitations(usedCitations);
        setActiveScopeLabel(scopeLabel);
        setJarvisSubtitle(reply);
        onRecordSpokenTurn('model', reply, {
          aiMode: configRef.current.aiMode,
          citations: usedCitations,
          mood: computedMood,
          scopeLabel,
        });

        await speakWithAgentVoice(reply, { updateCoreState: true, mood: computedMood });
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : 'Unable to complete command.';
        setErrorMessage(errMsg);
        setJarvisSubtitle(errMsg);
        setTaskState('FAILED');
        setCoreState('error');
        onRecordExecutionLog({
          command: cleaned,
          intent: 'gemini_chat',
          source: 'brain',
          status: 'FAILED',
          detail: errMsg,
          verified: false,
        });
      } finally {
        setToolProgressText(null);
      }
    },
    [
      dispatchLaunchTarget,
      handleComputerActionSignal,
      messages,
      onRecordExecutionLog,
      onRecordSpokenTurn,
      onSyncSchedulesFromServer,
      onSyncState,
      onUpdateQuotaStatus,
      speakWithAgentVoice,
      tryExecuteLocalCommand,
    ]
  );

  executeFallbackVoiceCommandRef.current = executeFallbackVoiceCommand;

  const acquireMicStream = useCallback(async (): Promise<MediaStream> => {
    const preferredId = configRef.current.preferredMicDeviceId;
    const baseAudio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (preferredId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...baseAudio, deviceId: { exact: preferredId } },
        });
      } catch {
        // Selected device may have been unplugged; fall back cleanly to system default
      }
    }
    return navigator.mediaDevices.getUserMedia({ audio: baseAudio });
  }, []);

  // Record a command via MediaRecorder -> Gemini 3.5 Transcribe -> Brain -> Agent Voice TTS
  const startFallbackVoiceCapture = useCallback(async () => {
    try {
      await stopWakeStandby();
      cleanupLiveSession();
      setVoicePipelineMode('fallback');
      setErrorMessage(null);
      setActionNotice('Direct Microphone Capture active. Speak your command, then tap Send.');
      setUserSubtitle('');
      setJarvisSubtitle('');
      setTaskState('LISTENING');
      setCoreState('listening');

      const stream = await acquireMicStream();
      micStreamRef.current = stream;

      const inputCtx = new AudioContext();
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      inputAudioCtxRef.current = inputCtx;
      const inputAnalyser = inputCtx.createAnalyser();
      inputAnalyser.fftSize = 256;
      inputAnalyser.smoothingTimeConstant = 0.78;
      inputAnalyserRef.current = inputAnalyser;
      const src = inputCtx.createMediaStreamSource(stream);
      src.connect(inputAnalyser);
      setAnalyserRevision((r) => r + 1);

      const mimeCandidate = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
      const recorder = mimeCandidate
        ? new MediaRecorder(stream, { mimeType: mimeCandidate })
        : new MediaRecorder(stream);

      fallbackChunksRef.current = [];
      mediaRecorderRef.current = recorder;
      setIsFallbackRecording(true);

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          fallbackChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const chunks = fallbackChunksRef.current;
        fallbackChunksRef.current = [];
        setIsFallbackRecording(false);
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach((t) => t.stop());
          micStreamRef.current = null;
        }
        if (inputAudioCtxRef.current) {
          void inputAudioCtxRef.current.close().catch(() => {});
          inputAudioCtxRef.current = null;
          inputAnalyserRef.current = null;
        }

        if (chunks.length === 0) {
          setCoreState('idle');
          return;
        }

        const blob = new Blob(chunks, {
          type: recorder.mimeType || 'audio/webm',
        });

        setCoreState('thinking');
        setToolProgressText('Transcribing voice command...');
        const reader = new FileReader();
        reader.onloadend = () => {
          const resultStr = typeof reader.result === 'string' ? reader.result : '';
          const b64 = resultStr.split(',')[1] || '';
          if (!b64) {
            setToolProgressText(null);
            setCoreState('idle');
            return;
          }
          void (async () => {
            try {
              const tRes = await fetch('/api/assistant/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  audioBase64: b64,
                  mimeType: recorder.mimeType || 'audio/webm',
                }),
              });
              const tData = (await tRes.json()) as {
                transcript?: string;
                error?: string;
              };
              if (!tRes.ok) {
                throw new Error(tData.error || 'Voice transcription failed.');
              }
              const transcript = (tData.transcript || '').trim();
              if (!transcript) {
                setToolProgressText(null);
                setActionNotice('No speech detected. Tap to Talk to try again.');
                setCoreState(wakeEnabledRef.current ? 'standby' : 'idle');
                if (wakeEnabledRef.current) {
                  void armWakeStandbyRef.current(false);
                }
                return;
              }
              await executeFallbackVoiceCommand(transcript);
            } catch (err) {
              setToolProgressText(null);
              setErrorMessage(
                err instanceof Error ? err.message : 'Unable to transcribe audio.'
              );
              setCoreState('error');
            }
          })();
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      // Automatically close capture after 8s so single-command mode feels effortless
      fallbackSilenceTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 8000);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Microphone access failed for fallback capture.'
      );
      setCoreState('error');
    }
  }, [cleanupLiveSession, executeFallbackVoiceCommand, stopWakeStandby]);

  const handleFinishFallbackRecording = useCallback(() => {
    if (fallbackSilenceTimerRef.current !== null) {
      window.clearTimeout(fallbackSilenceTimerRef.current);
      fallbackSilenceTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const captureLocalVoiceDuringCooldown = useCallback(async () => {
    await stopWakeStandby();
    setErrorMessage(null);
    setTaskState('LISTENING');
    setCoreState('listening');
    setActionNotice('Listening for your local voice command...');

    const res = await tryOneShotSpeechRecognition({
      language: configRef.current.voiceLanguage,
      onInterim: (partial) => setUserSubtitle(partial),
    });

    if (res.transcript) {
      setActionNotice(null);
      await executeFallbackVoiceCommand(res.transcript);
      return;
    }

    // If browser speech hit 'network' or unsupported AND Desktop Companion is connected on Windows, try OS speech
    if (companionRef.current?.connected) {
      const cmp = await companionRef.current.sendCommand('companion_listen_once', {});
      const cmpText = typeof cmp.data?.transcript === 'string' ? cmp.data.transcript.trim() : '';
      if (cmp.ok && cmpText) {
        setActionNotice(null);
        await executeFallbackVoiceCommand(cmpText);
        return;
      }
    }

    setTaskState('IDLE');
    if (res.error === 'network') {
      setActionNotice(
        'Browser speech recognition reported a network issue. Say "Hey August, <command>" directly or connect Desktop Companion.'
      );
    } else if (res.error === 'not-allowed') {
      setErrorMessage('Microphone permission denied. Allow microphone access in browser settings.');
    } else {
      setActionNotice('No voice command detected. Standing by for "Hey August"...');
    }

    const meta = resolveActiveWakeEngine(
      configRef.current.wakeEngine,
      configRef.current.picovoiceAccessKey
    );
    if (wakeEnabledRef.current && meta.type !== 'manual_only') {
      setCoreState('standby');
      void armWakeStandbyRef.current(false);
    } else {
      setCoreState('idle');
    }
  }, [executeFallbackVoiceCommand, stopWakeStandby]);

  const startVoiceSession = useCallback(
    async (initialPrompt?: string, singleCommand?: boolean) => {
      // Route local deterministic commands BEFORE checking Gemini Live quota cooldown!
      if (initialPrompt && initialPrompt.trim()) {
        if (
          parseLocalCommand(initialPrompt) ||
          (quotaStatusRef.current.limited && quotaStatusRef.current.retryAfterSeconds > 0)
        ) {
          await executeFallbackVoiceCommand(initialPrompt);
          return;
        }
      } else if (quotaStatusRef.current.limited && quotaStatusRef.current.retryAfterSeconds > 0) {
        // Cooldown active and user woke assistant without trailing command -> capture locally by voice cleanly!
        await captureLocalVoiceDuringCooldown();
        return;
      }

      if (wakeLockRef.current) return;
      wakeLockRef.current = true;

      try {
        await stopWakeStandby();
        stopSpeechInterruption();
        cleanupLiveSession();

        singleCommandModeRef.current =
          singleCommand !== undefined
            ? singleCommand
            : !configRef.current.continuousMode;
        modelRespondedRef.current = false;
        turnCompletedRef.current = false;
        interactionIdleRef.current = false;
        turnLaunchDispatchedRef.current = false;
        midTurnRecoveryLockRef.current = false;
        lastUserCommandRef.current = initialPrompt?.trim() || '';

        setErrorMessage(null);
        setActionNotice(null);
        setNeedsUserGesture(false);
        setUserSubtitle(initialPrompt || '');
        setJarvisSubtitle('');
        userTranscriptRef.current = initialPrompt || '';
        jarvisTranscriptRef.current = '';
        memoriesUsedRef.current = [];
        setTaskState('LISTENING');
        setCoreState('waking');

      const stream = await acquireMicStream();
      micStreamRef.current = stream;

        const inputCtx = new AudioContext();
        const outputCtx = new AudioContext({ sampleRate: 24000 });
        if (inputCtx.state === 'suspended') await inputCtx.resume();
        if (outputCtx.state === 'suspended') await outputCtx.resume();

        inputAudioCtxRef.current = inputCtx;
        outputAudioCtxRef.current = outputCtx;

        const inputAnalyser = inputCtx.createAnalyser();
        inputAnalyser.fftSize = 256;
        inputAnalyser.smoothingTimeConstant = 0.78;
        inputAnalyserRef.current = inputAnalyser;

        const outputGain = outputCtx.createGain();
        outputGain.gain.setValueAtTime(
          Math.max(0, Math.min(1, configRef.current.voiceVolume)),
          outputCtx.currentTime
        );
        const outputAnalyser = outputCtx.createAnalyser();
        outputAnalyser.fftSize = 256;
        outputAnalyser.smoothingTimeConstant = 0.78;
        outputGain.connect(outputAnalyser);
        outputAnalyser.connect(outputCtx.destination);
        outputGainRef.current = outputGain;
        outputAnalyserRef.current = outputAnalyser;
        setAnalyserRevision((r) => r + 1);

        const micSource = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        micSource.connect(inputAnalyser);
        inputAnalyser.connect(processor);
        const silentGain = inputCtx.createGain();
        silentGain.gain.value = 0;
        processor.connect(silentGain);
        silentGain.connect(inputCtx.destination);

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/api/live`);
        wsRef.current = ws;

        ws.onopen = () => {
          setVoicePipelineMode('live');
          ws.send(
            JSON.stringify({
              type: 'init',
              state: stateRef.current,
              config: {
                personaPrompt: configRef.current.systemInstruction,
                voiceName: configRef.current.voiceName,
                agentVoiceStyle: configRef.current.agentVoiceStyle,
                aiMode: configRef.current.aiMode,
                memoryEnabled: configRef.current.memoryEnabled,
                enabledTools: configRef.current.enabledTools,
              },
              initialPrompt,
            })
          );
        };

        processor.onaudioprocess = (event) => {
          if (
            isMutedRef.current ||
            ws.readyState !== WebSocket.OPEN ||
            coreStateRef.current === 'standby' ||
            coreStateRef.current === 'idle' ||
            coreStateRef.current === 'disconnected'
          ) {
            return;
          }
          const samples = event.inputBuffer.getChannelData(0);
          const base64 = float32ToInt16Base64(samples, inputCtx.sampleRate);
          ws.send(JSON.stringify({ type: 'audio', data: base64 }));
        };

        ws.onmessage = (event) => {
          let payload: {
            type?: string;
            data?: string;
            speaker?: 'user' | 'jarvis';
            text?: string;
            message?: string;
            toolName?: string;
            status?: 'in_progress' | 'idle';
            state?: AssistantState;
            schedules?: ScheduledItem[];
            target?: LaunchTarget;
            memoriesUsed?: string[];
            proposal?: PendingMemoryProposal;
            action?: string;
            value?: string;
            requiresConfirmation?: boolean;
            callId?: string;
            fallbackRecommended?: boolean;
            quotaLimited?: boolean;
            retryAfterSeconds?: number;
            error?: string;
          };
          try {
            payload = JSON.parse(String(event.data));
          } catch {
            return;
          }

          if (payload.type === 'ready') {
            if (Array.isArray(payload.memoriesUsed)) {
              memoriesUsedRef.current = payload.memoriesUsed;
              setLastMemoriesUsed(payload.memoriesUsed);
            }
            setCoreState(initialPrompt ? 'thinking' : 'listening');
            return;
          }

          if (payload.type === 'tool_progress' && payload.message) {
            setToolProgressText(payload.message);
            if (
              configRef.current.spokenToolUpdates &&
              activeSourcesRef.current.size === 0 &&
              coreStateRef.current !== 'speaking'
            ) {
              void speakWithAgentVoice(payload.message);
            }
            return;
          }

          if (payload.type === 'audio' && payload.data) {
            playPcmChunk(payload.data);
            return;
          }

          if (payload.type === 'open_url' && payload.target?.url) {
            dispatchLaunchTarget(payload.target);
            return;
          }

          if (payload.type === 'memory_proposal' && payload.proposal) {
            setPendingProposals((prev) => [
              payload.proposal!,
              ...prev.filter((p) => p.key !== payload.proposal!.key),
            ]);
            return;
          }

          if (payload.type === 'computer_action') {
            turnLaunchDispatchedRef.current = true;
            handleComputerActionSignal({
              action: payload.action,
              target:
                typeof payload.target === 'string'
                  ? payload.target
                  : payload.target?.name,
              value: payload.value,
              requiresConfirmation: payload.requiresConfirmation,
              callId: payload.callId,
            });
            return;
          }

          if (payload.type === 'interrupted') {
            clearReturnToStandbyTimer();
            stopQueuedOutputAudio();
            if (jarvisTranscriptRef.current.trim()) {
              onRecordSpokenTurn('model', jarvisTranscriptRef.current.trim(), {
                aiMode: configRef.current.aiMode,
              });
            }
            jarvisTranscriptRef.current = '';
            setJarvisSubtitle('');
            setCoreState('listening');
            return;
          }

          if (payload.type === 'subtitle' && payload.text) {
            if (payload.speaker === 'user') {
              clearReturnToStandbyTimer();
              if (turnCompletedRef.current) {
                if (userTranscriptRef.current.trim()) {
                  onRecordSpokenTurn('user', userTranscriptRef.current.trim(), {
                    aiMode: configRef.current.aiMode,
                    memoriesUsed: memoriesUsedRef.current,
                  });
                }
                if (jarvisTranscriptRef.current.trim()) {
                  onRecordSpokenTurn('model', jarvisTranscriptRef.current.trim(), {
                    aiMode: configRef.current.aiMode,
                  });
                }
                userTranscriptRef.current = '';
                jarvisTranscriptRef.current = '';
                setJarvisSubtitle('');
                turnCompletedRef.current = false;
                turnLaunchDispatchedRef.current = false;
                midTurnRecoveryLockRef.current = false;
              }
              userTranscriptRef.current += payload.text;
              const trimmedUser = userTranscriptRef.current.trim();
              if (trimmedUser) {
                lastUserCommandRef.current = trimmedUser;
              }
              setUserSubtitle(trimmedUser);
            } else if (payload.speaker === 'jarvis') {
              clearReturnToStandbyTimer();
              modelRespondedRef.current = true;
              jarvisTranscriptRef.current += payload.text;
              setJarvisSubtitle(jarvisTranscriptRef.current.trim());
              turnCompletedRef.current = false;
            }
            return;
          }

          if (payload.type === 'turn_complete') {
            turnCompletedRef.current = true;
            setToolProgressText(null);

            const spokenText = jarvisTranscriptRef.current.trim();
            const failedLaunchSpeech =
              /\b(system error occurred|error occurred|unable to (?:open|launch|complete)|couldn't (?:open|launch)|failed to (?:open|launch))\b/i.test(
                spokenText
              );
            const activeCmd =
              lastUserCommandRef.current.trim() ||
              userTranscriptRef.current.trim() ||
              initialPrompt?.trim() ||
              '';

            if (
              failedLaunchSpeech &&
              activeCmd &&
              !turnLaunchDispatchedRef.current &&
              !midTurnRecoveryLockRef.current
            ) {
              midTurnRecoveryLockRef.current = true;
              cleanupLiveSession();
              if (parseLocalCommand(activeCmd)) {
                setActionNotice(null);
                void executeFallbackVoiceCommand(activeCmd);
              } else {
                setActionNotice('Switching to Gemini Brain & Agent Voice...');
                void executeFallbackVoiceCommand(activeCmd);
              }
              return;
            }

            if (activeSourcesRef.current.size === 0) {
              setCoreState('listening');
              scheduleSingleCommandReturnCheck();
            }
            return;
          }

          if (payload.type === 'status') {
            if (payload.status === 'in_progress') {
              clearReturnToStandbyTimer();
              interactionIdleRef.current = false;
              setCoreState((prev) => (prev === 'speaking' ? 'speaking' : 'thinking'));
            } else if (payload.status === 'idle') {
              interactionIdleRef.current = true;
              if (activeSourcesRef.current.size === 0) {
                setCoreState('listening');
                scheduleSingleCommandReturnCheck();
              }
            }
            return;
          }

          if (payload.type === 'schedules_sync' && Array.isArray(payload.schedules)) {
            onSyncSchedulesFromServer(payload.schedules);
            setTaskState('SCHEDULED');
            return;
          }

          if (payload.type === 'state_sync' && payload.state) {
            onSyncState(payload.state);
            return;
          }

          if (payload.type === 'error') {
            if (payload.quotaLimited && payload.retryAfterSeconds) {
              onUpdateQuotaStatus({
                limited: true,
                retryAfterSeconds: payload.retryAfterSeconds,
                lastError: payload.error,
              });
            }
            const recoverableCmd =
              initialPrompt?.trim() ||
              lastUserCommandRef.current.trim() ||
              userTranscriptRef.current.trim() ||
              '';
            cleanupLiveSession();
            if (payload.fallbackRecommended) {
              if (recoverableCmd) {
                setActionNotice('Gemini Live unavailable — running via Agent Voice Fallback.');
                void executeFallbackVoiceCommand(recoverableCmd);
              } else {
                setActionNotice(
                  payload.quotaLimited
                    ? `Gemini quota cooldown (${payload.retryAfterSeconds || 45}s). Use local voice/text commands.`
                    : 'Gemini Live interrupted — switched to Agent Voice Fallback.'
                );
                if (!payload.quotaLimited) {
                  void startFallbackVoiceCapture();
                } else {
                  setCoreState('standby');
                  void armWakeStandbyRef.current(false);
                }
              }
            } else {
              setErrorMessage(
                payload.error || 'Live voice session encountered an unexpected error.'
              );
              setTaskState('FAILED');
              setCoreState('error');
            }
            return;
          }

          if (payload.type === 'closed') {
            cleanupLiveSession();
            const engineMeta = resolveActiveWakeEngine(
              configRef.current.wakeEngine,
              configRef.current.picovoiceAccessKey
            );
            if (wakeEnabledRef.current && engineMeta.type !== 'manual_only') {
              setCoreState('standby');
              void armWakeStandbyRef.current(false);
            } else {
              setCoreState('disconnected');
            }
          }
        };

        ws.onerror = () => {
          const recoverableCmd =
            initialPrompt?.trim() ||
            lastUserCommandRef.current.trim() ||
            userTranscriptRef.current.trim() ||
            '';
          cleanupLiveSession();
          if (recoverableCmd) {
            setActionNotice('Gemini Live unreachable — executing via Agent Voice Fallback.');
            void executeFallbackVoiceCommand(recoverableCmd);
          } else {
            setActionNotice('Live bridge interrupted — switched to Agent Voice Fallback.');
            void startFallbackVoiceCapture();
          }
        };

        ws.onclose = () => {
          if (wsRef.current) {
            cleanupLiveSession();
            setCoreState('disconnected');
          }
        };
      } catch (err) {
        const isNotAllowed =
          err instanceof Error &&
          (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        if (isNotAllowed) {
          setNeedsUserGesture(true);
          setCoreState('idle');
        } else {
          setErrorMessage(
            err instanceof Error ? err.message : 'Unable to start voice session.'
          );
          setCoreState('error');
        }
        cleanupLiveSession();
      } finally {
        wakeLockRef.current = false;
      }
    },
    [
      acquireMicStream,
      captureLocalVoiceDuringCooldown,
      cleanupLiveSession,
      clearReturnToStandbyTimer,
      dispatchLaunchTarget,
      executeFallbackVoiceCommand,
      handleComputerActionSignal,
      onRecordSpokenTurn,
      onSyncSchedulesFromServer,
      onSyncState,
      onUpdateQuotaStatus,
      playPcmChunk,
      scheduleSingleCommandReturnCheck,
      speakWithAgentVoice,
      startFallbackVoiceCapture,
      stopQueuedOutputAudio,
      stopSpeechInterruption,
      stopWakeStandby,
    ]
  );

  const armWakeStandby = useCallback(
    async (isAutoAttempt: boolean) => {
      await stopWakeStandby();
      setErrorMessage(null);

      const engineMeta = resolveActiveWakeEngine(
        configRef.current.wakeEngine,
        configRef.current.picovoiceAccessKey
      );
      if (engineMeta.type === 'manual_only') {
        setCoreState('idle');
        return;
      }

      const controller = await startWakeStandbyEngine({
        preference: configRef.current.wakeEngine,
        picovoiceAccessKey: configRef.current.picovoiceAccessKey,
        language: configRef.current.voiceLanguage,
        sensitivity: configRef.current.wakeSensitivity,
        isAutoAttempt,
        onInterimSubtitle: (text) => {
          setUserSubtitle(text);
        },
        onWakeDetected: (trailingCommand) => {
          playWakeChime(Math.max(0.04, configRef.current.voiceVolume * 0.12));
          void startVoiceSession(
            trailingCommand,
            !configRef.current.continuousMode
          );
        },
        onNeedsGesture: () => {
          setNeedsUserGesture(true);
          setCoreState('idle');
        },
        onError: (msg) => {
          setErrorMessage(msg);
        },
      });

      if (controller) {
        wakeControllerRef.current = controller;
        setNeedsUserGesture(false);
        setCoreState('standby');
        setTelemetry((prev) => ({
          ...prev,
          activeWakeEngineLabel: controller.engineLabel,
        }));
      }
    },
    [startVoiceSession, stopWakeStandby]
  );

  armWakeStandbyRef.current = armWakeStandby;

  // Auto-arm on mount and cleanly pause/resume on browser tab visibility changes
  useEffect(() => {
    const engineMeta = resolveActiveWakeEngine(
      configRef.current.wakeEngine,
      configRef.current.picovoiceAccessKey
    );
    if (
      wakeEnabled &&
      engineMeta.type !== 'manual_only' &&
      !pendingVoicePrompt
    ) {
      void armWakeStandby(true);
    }

    const onVisibilityChange = () => {
      if (document.hidden && coreStateRef.current === 'standby') {
        void stopWakeStandby();
      } else if (
        !document.hidden &&
        wakeEnabledRef.current &&
        coreStateRef.current === 'standby' &&
        !wakeControllerRef.current
      ) {
        void armWakeStandbyRef.current(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopSpeechInterruption();
      void stopWakeStandby();
      cleanupLiveSession();
      agentSpeakerRef.current?.stop();
    };
  }, []); // Mount lifecycle

  // Proactive Spoken Agent Alerts & Completed Timers (respecting gaming/call/busy DND queue)
  useEffect(() => {
    if (!latestAlert || handledAlertIdRef.current === latestAlert.id) return;
    handledAlertIdRef.current = latestAlert.id;

    const busyOrGaming =
      desktopContextRef.current.activity === 'gaming' ||
      desktopContextRef.current.activity === 'call' ||
      desktopContextRef.current.doNotDisturb ||
      Boolean(configRef.current.callConfig?.busyMode) ||
      configRef.current.callConfig?.handlingMode === 'silent_dnd' ||
      userSleepMode;

    // Defer non-urgent updates (e.g. RSS monitor updates) while gaming, in a call, or DND
    if (
      busyOrGaming &&
      latestAlert.kind !== 'alarm' &&
      latestAlert.kind !== 'call' &&
      latestAlert.kind !== 'timer'
    ) {
      setQueuedAlerts((prev) => [latestAlert, ...prev].slice(0, 10));
      return;
    }

    if (
      configRef.current.callConfig?.handlingMode === 'silent_dnd' &&
      latestAlert.kind === 'call'
    ) {
      setQueuedAlerts((prev) => [latestAlert, ...prev].slice(0, 10));
      return;
    }

    if (!configRef.current.proactiveVoiceAlerts) return;
    if (configRef.current.soundFeedbackEnabled !== false) {
      playTimerCompleteChime(Math.max(0.05, configRef.current.voiceVolume * 0.22));
    }
    if (coreStateRef.current !== 'speaking' && !isLiveConnected) {
      setJarvisSubtitle(latestAlert.spokenText);
      void speakWithAgentVoice(latestAlert.spokenText, { updateCoreState: true });
    } else if (coreStateRef.current !== 'speaking') {
      void speakWithAgentVoice(latestAlert.spokenText, { updateCoreState: false });
    }
  }, [latestAlert, isLiveConnected, speakWithAgentVoice, userSleepMode]);

  // Flush queued spoken updates once user exits gaming/call/busy/DND
  useEffect(() => {
    const busyNow =
      desktopContext.activity === 'gaming' ||
      desktopContext.activity === 'call' ||
      desktopContext.doNotDisturb ||
      Boolean(config.callConfig?.busyMode) ||
      config.callConfig?.handlingMode === 'silent_dnd' ||
      userSleepMode;
    if (!busyNow && queuedAlerts.length > 0 && configRef.current.proactiveVoiceAlerts) {
      const batch = queuedAlerts.slice(0, 3);
      setQueuedAlerts([]);
      const summary = `While you were busy, you received ${batch.length} update${
        batch.length === 1 ? '' : 's'
      }: ${batch.map((a) => a.spokenText).join(' ')}`;
      setJarvisSubtitle(summary);
      void speakWithAgentVoice(summary, { updateCoreState: !isLiveConnected });
    }
  }, [
    config.callConfig?.busyMode,
    config.callConfig?.handlingMode,
    desktopContext.activity,
    desktopContext.doNotDisturb,
    isLiveConnected,
    queuedAlerts,
    speakWithAgentVoice,
    userSleepMode,
  ]);

  // Re-arm standby if wakeEngine / Picovoice key changes while not in an active call
  useEffect(() => {
    if (!isLiveConnected && wakeEnabled && !needsUserGesture) {
      const meta = resolveActiveWakeEngine(
        config.wakeEngine,
        config.picovoiceAccessKey
      );
      if (meta.type === 'manual_only') {
        void stopWakeStandby();
        setCoreState('idle');
      } else if (coreState === 'standby' || coreState === 'idle') {
        void armWakeStandby(true);
      }
    }
  }, [config.wakeEngine, config.picovoiceAccessKey]);

  // Handle cross-tab or History prompt triggers ("Run Briefing", History "Re-run")
  useEffect(() => {
    if (!pendingVoicePrompt) return;
    const prompt = pendingVoicePrompt;
    onConsumePendingPrompt();

    if (
      isLiveConnected &&
      coreStateRef.current !== 'waking' &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      clearReturnToStandbyTimer();
      modelRespondedRef.current = false;
      turnCompletedRef.current = false;
      interactionIdleRef.current = false;
      turnLaunchDispatchedRef.current = false;
      midTurnRecoveryLockRef.current = false;
      lastUserCommandRef.current = prompt.trim();
      setUserSubtitle(prompt);
      setJarvisSubtitle('');
      userTranscriptRef.current = prompt;
      jarvisTranscriptRef.current = '';
      setCoreState('thinking');
      wsRef.current.send(JSON.stringify({ type: 'text_prompt', text: prompt }));
    } else {
      void startVoiceSession(prompt, !configRef.current.continuousMode);
    }
  }, [
    pendingVoicePrompt,
    onConsumePendingPrompt,
    isLiveConnected,
    clearReturnToStandbyTimer,
    startVoiceSession,
  ]);

  const handleEnableAutoVoice = () => {
    setWakeEnabled(true);
    setNeedsUserGesture(false);
    const meta = resolveActiveWakeEngine(
      config.wakeEngine,
      config.picovoiceAccessKey
    );
    if (meta.type !== 'manual_only') {
      void armWakeStandby(false);
    } else {
      void startVoiceSession(undefined, !config.continuousMode);
    }
  };

  const handleStopListening = () => {
    setWakeEnabled(false);
    agentSpeakerRef.current?.stop();
    void stopWakeStandby();
    cleanupLiveSession();
    setCoreState('idle');
  };

  const handleWakeNow = () => {
    agentSpeakerRef.current?.stop();
    setUserSleepMode(false);
    playWakeChime(Math.max(0.04, configRef.current.voiceVolume * 0.12));

    if (quotaStatusRef.current.limited && quotaStatusRef.current.retryAfterSeconds > 0) {
      void captureLocalVoiceDuringCooldown();
      return;
    }

    void startVoiceSession(undefined, !configRef.current.continuousMode);
  };

  const handleTestAgentVoice = useCallback(() => {
    setIsTestingVoice(true);
    agentSpeakerRef.current?.stop();
    const sample =
      'J.A.R.V.I.S. Agent Voice calibrated. Tasks, timers, and voice telemetry are standing by.';
    setJarvisSubtitle(sample);
    void speakWithAgentVoice(sample, {
      updateCoreState: !isLiveConnected,
    }).finally(() => {
      setIsTestingVoice(false);
    });
  }, [isLiveConnected, speakWithAgentVoice]);

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && stageRootRef.current) {
        await stageRootRef.current.requestFullscreen();
        setCinematicMode(true);
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        setCinematicMode(false);
      } else {
        setCinematicMode((prev) => !prev);
      }
    } catch {
      setCinematicMode((prev) => !prev);
    }
  };

  const handleAnalyzeScreenshot = async () => {
    if (!screenshotPreview) return;
    setScreenshotPreview((prev) => (prev ? { ...prev, analyzing: true } : prev));
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              text: 'Briefly describe what is visible on this captured screen and highlight any actionable context.',
            },
          ],
          state,
          imageBase64: screenshotPreview.dataUrl,
          config: {
            personaPrompt: config.systemInstruction,
            enabledTools: ['search'],
            aiMode: config.aiMode,
            memoryEnabled: config.memoryEnabled,
          },
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Analysis failed.');
      setScreenshotPreview((prev) =>
        prev
          ? { ...prev, analyzing: false, analysis: data.reply || 'Analyzed.' }
          : prev
      );
    } catch (err) {
      setScreenshotPreview((prev) =>
        prev ? { ...prev, analyzing: false } : prev
      );
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to analyze screenshot.'
      );
    }
  };

  const handleDownloadCompanion = () => {
    const blob = new Blob([DESKTOP_COMPANION_SCRIPT], {
      type: 'text/javascript;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jarvis-companion.mjs';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleToggleDesktopAwareness = useCallback(
    (enabled: boolean) => {
      onUpdateConfig((prev) => ({
        ...prev,
        desktopAwarenessEnabled: enabled,
      }));
      setDesktopContext((prev) => ({
        ...prev,
        enabled,
        activity: enabled ? prev.activity : 'idle',
        source: enabled && telemetry.companionConnected ? 'companion' : 'offline',
      }));
      if (companionRef.current?.connected) {
        void companionRef.current
          .sendCommand('desktop_awareness_toggle', { enabled })
          .then((res) => {
            if (res.ok && enabled && res.data?.activity) {
              setDesktopContext({
                enabled: true,
                activeApp: String(res.data.activeApp || 'Desktop'),
                windowTitle: String(res.data.windowTitle || ''),
                activity: res.data.activity as DesktopAwarenessState['activity'],
                doNotDisturb: res.data.activity === 'dnd',
                source: 'companion',
                updatedAt: new Date().toISOString(),
              });
            }
          });
      }
      setActionNotice(
        enabled
          ? 'Opt-in desktop window awareness enabled.'
          : 'Desktop window awareness paused (Privacy Kill Switch).'
      );
    },
    [onUpdateConfig, telemetry.companionConnected]
  );

  const statusTextMap: Record<JarvisLogoState, string> = {
    idle: 'IDLE',
    standby: 'WAKE STANDBY',
    waking: 'WAKING',
    listening: isMuted ? 'MUTED' : 'LISTENING',
    thinking: 'PROCESSING',
    executing: 'EXECUTING',
    speaking: 'SPEAKING',
    timer: 'TIMER ACTIVE',
    alarm: 'ALARM RINGING',
    reminder: 'REMINDER',
    searching: 'SEARCHING WEB',
    browser: 'BROWSER CONTROL',
    gaming: 'GAMING MODE',
    focus: 'FOCUS MODE',
    care: 'CARE MODE',
    sleep: 'SLEEP MODE',
    completed: 'COMPLETED',
    error: 'ERROR',
    disconnected: 'DISCONNECTED',
  };

  // Compute live timers cleanly from persistent schedules (survives refreshes!) + legacy state.timers
  const activeTimersList = schedules
    .filter(
      (s) =>
        s.kind === 'timer' &&
        (s.status === 'scheduled' || s.status === 'snoozed')
    )
    .map((s) => {
      const total = Math.max(1, s.durationSeconds || 60);
      const remaining = s.paused
        ? Math.max(0, s.remainingSecondsWhenPaused ?? total)
        : Math.max(
            0,
            Math.ceil((new Date(s.snoozedUntil || s.triggerAt).getTime() - hudNowMs) / 1000)
          );
      return {
        id: s.id,
        label: s.title,
        totalSeconds: total,
        remainingSeconds: remaining,
        paused: Boolean(s.paused),
      };
    });

  const focusedTimer =
    activeTimersList.find((t) => t.id === selectedTimerId) ||
    activeTimersList[0] ||
    null;

  const ringingAlarm = schedules.find(
    (s) =>
      (s.kind === 'alarm' || s.kind === 'timer') &&
      s.status === 'triggered' &&
      s.triggeredAt &&
      hudNowMs - new Date(s.triggeredAt).getTime() < 90_000
  );

  // 16-State priority resolver for the 3D AI Entity
  const effectiveCoreState: JarvisLogoState = (() => {
    if (
      coreState === 'error' ||
      coreState === 'listening' ||
      coreState === 'speaking' ||
      coreState === 'thinking' ||
      coreState === 'waking' ||
      coreState === 'executing'
    ) {
      return coreState;
    }
    if (ringingAlarm && ringingAlarm.kind === 'alarm') return 'alarm';
    if (browserSnapshot.status === 'running') {
      return /search/i.test(browserSnapshot.steps[0]?.step || '')
        ? 'searching'
        : 'browser';
    }
    if (latestAlert?.kind === 'reminder') return 'reminder';
    if (focusedTimer && !focusedTimer.paused && focusedTimer.remainingSeconds > 0) {
      return 'timer';
    }
    if (recentCompletedFlash) return 'completed';
    if (config.desktopAwarenessEnabled && desktopContext.activity === 'gaming') {
      return 'gaming';
    }
    if (careModeActive) return 'care';
    if (state.environment.focusMode) return 'focus';
    if (userSleepMode) return 'sleep';
    return coreState;
  })();

  const activeTimerProgress = focusedTimer
    ? focusedTimer.remainingSeconds / Math.max(1, focusedTimer.totalSeconds)
    : 0;

  const micPrivacyStatus = isMuted
    ? 'MUTED'
    : isLiveConnected
    ? 'ACTIVE (LIVE)'
    : coreState === 'standby'
    ? 'STANDBY (WAKE)'
    : 'OFF';

  const hostnameLabel = (() => {
    if (!launchTarget) return '';
    try {
      return new URL(launchTarget.url).hostname;
    } catch {
      return launchTarget.url;
    }
  })();

  const voiceStatusDetail =
    voicePipelineMode === 'fallback'
      ? 'Agent Voice Fallback (Transcribe + TTS)'
      : isLiveConnected
      ? `Gemini Live (${config.voiceName})`
      : 'Gemini Live + TTS Fallback Ready';

  const activeApprovedMemoryKeys = new Set(
    state.memory.filter((m) => m.approved !== false).map((m) => m.key)
  );
  const visibleMemoriesUsed = lastMemoriesUsed.filter((k) =>
    activeApprovedMemoryKeys.has(k)
  );

  const panelsVisible = !cinematicMode && (showLeftPanel || showRightPanel);
  const activeSchedulesCount = schedules.filter(
    (s) => s.status === 'scheduled' || s.status === 'snoozed'
  ).length;
  const activeMonitorsCount = monitorTopics.filter((m) => m.status === 'active').length;

  return (
    <div
      ref={stageRootRef}
      className={`relative rounded-2xl overflow-hidden bg-[#04070d] text-slate-100 border border-cyan-500/20 shadow-[0_24px_80px_-20px_rgba(6,182,212,0.18)] ${
        isFullscreen ? 'min-h-screen rounded-none border-0' : 'min-h-[760px]'
      } flex flex-col`}
    >
      {/* Ambient cinematic backdrop lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(6,182,212,0.13),rgba(15,23,42,0.35)_45%,rgba(4,7,13,0.98)_82%)]"
      />

      {/* Compact Top HUD Strip */}
      <div className="relative z-20 px-4 sm:px-6 py-3 border-b border-cyan-500/15 bg-[#060c18]/92 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          <span className="font-hud font-semibold text-cyan-300 tracking-wider">
            {statusTextMap[effectiveCoreState]}
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="font-mono text-slate-200">Task: {taskState}</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="font-mono text-slate-300">{config.aiMode} Mode</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            {micPrivacyStatus === 'OFF' || micPrivacyStatus === 'MUTED' ? (
              <MicOff className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span className="font-mono tabular-nums">Mic: {micPrivacyStatus}</span>
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-slate-300">
            <Laptop className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              PC:{' '}
              {telemetry.companionConnected
                ? telemetry.pythonAgentConnected
                  ? 'Node+Py'
                  : 'Node'
                : 'Offline'}
            </span>
          </span>
          {haConnected && (
            <>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <button
                type="button"
                onClick={() => {
                  setCinematicMode(false);
                  setShowLeftPanel(true);
                  setActiveLeftTab('smarthome');
                }}
                className="inline-flex items-center gap-1 font-mono text-emerald-300 hover:text-emerald-200"
              >
                <Home className="w-3 h-3" />
                <span>HA ({haEntities.length})</span>
              </button>
            </>
          )}
          {config.desktopAwarenessEnabled && (
            <>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="font-mono text-cyan-300">
                Context: {desktopContext.activity.toUpperCase()}
              </span>
            </>
          )}
          {quotaStatus.limited && quotaStatus.retryAfterSeconds > 0 && (
            <>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="font-mono tabular-nums text-amber-300">
                Gemini Cooldown: {quotaStatus.retryAfterSeconds}s (Local Voice Ready)
              </span>
            </>
          )}
          {isLiveConnected && coreState !== 'waking' && (
            <>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="font-mono tabular-nums text-cyan-300">
                {formatElapsed(elapsedSeconds)}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowMapsCard((prev) => !prev);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              showMapsCard
                ? 'bg-sky-500/20 border-sky-400/40 text-sky-200'
                : 'border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-sky-400" />
            <span>Maps</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCinematicMode(false);
              setShowLeftPanel(true);
              setActiveLeftTab('knowledge');
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>Knowledge ({knowledgeDocs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCinematicMode(false);
              setShowRightPanel(true);
              setActiveRightTab('pcvision');
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <span>PC &amp; Vision</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const order: Array<'low' | 'balanced' | 'high'> = ['low', 'balanced', 'high'];
              const current = config.visualQuality || 'balanced';
              const next = order[(order.indexOf(current) + 1) % order.length];
              onUpdateConfig((prev) => ({ ...prev, visualQuality: next }));
            }}
            title="Cycle 3D WebGL core rendering quality"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono rounded-lg border border-cyan-500/25 bg-cyan-950/45 text-cyan-200 hover:bg-cyan-900/50 transition-colors whitespace-nowrap shrink-0"
          >
            <span>3D: {(config.visualQuality || 'balanced').toUpperCase()}</span>
          </button>

          {!cinematicMode && (
            <>
              <button
                type="button"
                onClick={() => setShowLeftPanel((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  showLeftPanel
                    ? 'bg-cyan-500/15 border-cyan-400/35 text-cyan-200'
                    : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <PanelLeft className="w-3.5 h-3.5" />
                <span>Workspace</span>
              </button>
              <button
                type="button"
                onClick={() => setShowRightPanel((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  showRightPanel
                    ? 'bg-cyan-500/15 border-cyan-400/35 text-cyan-200'
                    : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <PanelRight className="w-3.5 h-3.5" />
                <span>System</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setCinematicMode((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>{cinematicMode ? 'Show Panels' : 'Hide Panels'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleToggleFullscreen()}
            aria-label={isFullscreen ? 'Exit fullscreen mode' : 'Enter fullscreen mode'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Fullscreen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Obsidian Studio Rail — Grouped Modules + Orb / Character Toggle */}
      <div className="relative z-20 px-4 sm:px-6 py-2 border-b border-slate-800/80 bg-[#050914]/95 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'core', label: 'Core & Awareness', Icon: Sparkles },
              { id: 'dev', label: 'Dev & Bugs', Icon: Code2 },
              { id: 'creative', label: '3D / 2D / 1D', Icon: Box },
              { id: 'skills', label: 'Skills & Agents', Icon: Bot },
              { id: 'personal', label: 'Personal & Calls', Icon: Mail },
              { id: 'system', label: 'System & Audit', Icon: ShieldCheck },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeStudio === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveStudio(id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-sky-500/15 border-sky-400/50 text-sky-200'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-100 hover:border-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-900/90 p-0.5 text-[11px] font-mono">
          <button
            type="button"
            onClick={() => setAvatarMode('orb')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              avatarMode === 'orb'
                ? 'bg-sky-500/20 text-sky-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Plasma Orb
          </button>
          <button
            type="button"
            onClick={() => setAvatarMode('character')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
              avatarMode === 'character'
                ? 'bg-sky-500/20 text-sky-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserRound className="w-3 h-3" />
            <span>3D Character</span>
          </button>
        </div>
      </div>

      {/* Main HUD Stage + Collapsible Left & Right Panels (Kept mounted so Live voice never drops) */}
      <div
        className={`relative z-10 flex-1 p-4 sm:p-6 ${
          activeStudio === 'core'
            ? 'flex flex-col lg:flex-row items-stretch justify-center gap-5'
            : 'hidden'
        }`}
      >
        {!cinematicMode && showLeftPanel && (
          <JarvisSidePanels
            side="left"
            activeLeftTab={activeLeftTab}
            activeRightTab={activeRightTab}
            onSelectLeftTab={setActiveLeftTab}
            onSelectRightTab={setActiveRightTab}
            onClosePanel={() => setShowLeftPanel(false)}
            user={user}
            authLoading={authLoading}
            cloudError={cloudError}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
            state={state}
            config={config}
            onUpdateConfig={onUpdateConfig}
            onOpenBackupModal={() => setIsBackupModalOpen(true)}
            onAddTask={onAddTask}
            onToggleTask={onToggleTask}
            onDeleteTask={onDeleteTask}
            schedules={schedules}
            executionLogs={executionLogs}
            quotaStatus={quotaStatus}
            notificationPermission={notificationPermission}
            onRequestNotificationPermission={onRequestNotificationPermission}
            onCreateSchedule={onCreateSchedule}
            onUpdateSchedule={onUpdateSchedule}
            onDeleteSchedule={onDeleteSchedule}
            onClearExecutionLogs={onClearExecutionLogs}
            monitorTopics={monitorTopics}
            monitorUpdates={monitorUpdates}
            onCreateMonitor={onCreateMonitor}
            onUpdateMonitor={onUpdateMonitor}
            onDeleteMonitor={onDeleteMonitor}
            onCheckMonitorNow={onCheckMonitorNow}
            onPauseAllMonitors={onPauseAllMonitors}
            onResumeAllMonitors={onResumeAllMonitors}
            desktopContext={desktopContext}
            onToggleDesktopAwareness={handleToggleDesktopAwareness}
            onTriggerLocalIncomingCall={(callerName) =>
              onTriggerLocalIncomingCall(callerName)
            }
            pendingProposals={pendingProposals}
            lastMemoriesUsed={lastMemoriesUsed}
            onApproveProposal={(id) => {
              const prop = pendingProposals.find((p) => p.id === id);
              if (!prop) return;
              onAddOrUpdateMemory({
                key: prop.key,
                value: prop.value,
                category: prop.category,
              });
              setPendingProposals((prev) => prev.filter((p) => p.id !== id));
              setActionNotice(`Saved memory "${prop.key}" to your Personal Memory Vault.`);
            }}
            onDismissProposal={(id) =>
              setPendingProposals((prev) => prev.filter((p) => p.id !== id))
            }
            onAddOrUpdateMemory={onAddOrUpdateMemory}
            onDeleteMemory={onDeleteMemory}
            onRequestClearAllMemories={() =>
              setPendingConfirmation({
                id: `clear_mem_${Date.now()}`,
                toolName: 'memory_vault',
                title: 'Confirm Clear All Memories',
                description: `Permanently delete all ${state.memory.length} saved memories from your vault?`,
                target: 'All Personal Memories',
                actionType: 'clear_all_memories',
                args: {},
                riskLevel: 'high',
              })
            }
            onRerunHistoryQuery={(q) =>
              void startVoiceSession(q, !config.continuousMode)
            }
            onDeleteHistoryItem={onDeleteHistoryItem}
            onUpdateEnvironment={onUpdateEnvironment}
            telemetry={telemetry}
            micPrivacyStatus={micPrivacyStatus}
            voiceStatusDetail={voiceStatusDetail}
            isLiveConnected={isLiveConnected}
            onTestAgentVoice={handleTestAgentVoice}
            isTestingVoice={isTestingVoice}
            selectedFolderName={selectedFolderName}
            folderEntries={folderEntries}
            onRequestScreenshot={() =>
              handleComputerActionSignal({ action: 'capture_screenshot' })
            }
            onOpenLocalFile={() =>
              handleComputerActionSignal({ action: 'open_local_file' })
            }
            onSelectLocalFolder={() => {
              void pickDirectoryHandle()
                .then(async (handle) => {
                  dirHandleRef.current = handle;
                  setSelectedFolderName(handle.name);
                  const entries = await listAndSearchDirectory(handle);
                  setFolderEntries(entries);
                })
                .catch((err) =>
                  setErrorMessage(
                    err instanceof Error ? err.message : 'Folder access denied.'
                  )
                );
            }}
            onRequestCreateFolder={(folderName) =>
              handleComputerActionSignal({
                action: 'create_local_folder',
                target: folderName,
              })
            }
            onConnectCompanion={() => {
              void companionRef.current
                ?.connect(
                  config.companionUrl || 'ws://127.0.0.1:4849',
                  config.companionPairingToken
                )
                .then((ok) => {
                  if (!ok) {
                    setErrorMessage(
                      'Desktop Companion did not respond on local port 4849. Start jarvis-companion.mjs on your PC first.'
                    );
                  } else {
                    setActionNotice('Desktop Companion connected.');
                  }
                });
            }}
            onDisconnectCompanion={() => companionRef.current?.disconnect()}
            onDownloadCompanionScript={handleDownloadCompanion}
            knowledgeDocs={knowledgeDocs}
            knowledgeChunks={knowledgeChunks}
            knowledgeUploading={knowledgeUploading}
            knowledgeError={knowledgeError}
            onUploadKnowledgeFile={onUploadKnowledgeFile}
            onToggleKnowledgeDoc={onToggleKnowledgeDoc}
            onDeleteKnowledgeDoc={onDeleteKnowledgeDoc}
            integrations={integrations}
            haConnected={haConnected}
            haBaseUrl={haBaseUrl}
            haEntities={haEntities}
            haBusy={haBusy}
            haError={haError}
            onConnectHomeAssistant={onConnectHomeAssistant}
            onRefreshHomeAssistant={onRefreshHomeAssistant}
            onDisconnectHomeAssistant={onDisconnectHomeAssistant}
            onToggleHomeAssistantEntity={onToggleHomeAssistantEntity}
            pcHardwareTelemetry={pcHardwareTelemetry}
            screenOcrSnapshot={screenOcrSnapshot}
            agenticSteps={agenticSteps}
            onCaptureScreenOcr={() =>
              handleComputerActionSignal({ action: 'companion_screen_ocr' })
            }
            onRunQuickPcAction={(cmd) => void executeFallbackVoiceCommand(cmd)}
          />
        )}

        {/* Center Voice-First AI Core Stage */}
        <div
          className={`flex-1 flex flex-col items-center justify-between py-2 sm:py-4 ${
            panelsVisible ? 'max-w-2xl mx-auto' : 'max-w-3xl mx-auto'
          }`}
        >
          {/* Dominant 3D Spatial AI Entity & Brand Lockup */}
          <div className="flex flex-col items-center text-center">
            <Jarvis3DCore
              coreState={effectiveCoreState}
              inputAnalyser={inputAnalyserRef.current}
              outputAnalyser={outputAnalyserRef.current || fallbackAnalyserRef.current}
              standbyAnalyser={standbyAnalyserRef.current}
              isMuted={isMuted}
              visualQuality={config.visualQuality || 'balanced'}
              avatarMode={avatarMode}
              timerProgress={activeTimerProgress}
              onCoreClick={() => {
                if (isFallbackRecording) {
                  handleFinishFallbackRecording();
                } else if (!isLiveConnected) {
                  handleWakeNow();
                } else {
                  setIsMuted((prev) => !prev);
                }
              }}
            />

            <h1 className="mt-3 text-2xl sm:text-3xl font-hud font-bold tracking-[0.22em] text-white">
              J.A.R.V.I.S.
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-cyan-300/85 tracking-wide">
              Autonomous Personal AI Entity · August
            </p>
            <div className="mt-1.5 text-xs font-mono text-slate-400">
              <span className="text-cyan-300">{statusTextMap[effectiveCoreState]}</span>
              <span aria-hidden="true"> · </span>
              <span>{telemetry.activeWakeEngineLabel}</span>
            </div>
          </div>

          {/* Live Spoken Subtitles & Context-Only Adaptive Floating HUDs */}
          <div className="w-full max-w-2xl my-4 flex flex-col items-center gap-3">
            <div
              aria-live="polite"
              className="w-full min-h-[76px] flex flex-col items-center justify-center text-center space-y-2 px-3"
            >
              {errorMessage ? (
                <div className="max-w-xl px-4 py-2.5 rounded-xl bg-rose-950/90 border border-rose-500/45 text-xs sm:text-sm text-rose-200 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMessage}</span>
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    aria-label="Dismiss error"
                    className="ml-1 text-rose-300 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : actionNotice ? (
                <div className="max-w-xl px-4 py-2 rounded-xl bg-cyan-950/90 border border-cyan-500/35 text-xs text-cyan-200 flex items-center gap-2">
                  <span>{actionNotice}</span>
                  <button
                    type="button"
                    onClick={() => setActionNotice(null)}
                    aria-label="Dismiss notice"
                    className="text-cyan-300 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : null}

              {latestAlert && (
                <div className="max-w-xl px-4 py-2.5 rounded-xl bg-cyan-950/92 border border-cyan-400/50 text-xs sm:text-sm text-cyan-100 flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-cyan-300 shrink-0" />
                  <span className="font-medium">{latestAlert.title}</span>
                  {onDismissAlert && (
                    <button
                      type="button"
                      onClick={onDismissAlert}
                      aria-label="Dismiss alert"
                      className="ml-1 text-cyan-300 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {toolProgressText && (
                <div className="max-w-xl px-3.5 py-1.5 rounded-lg bg-slate-900/95 border border-cyan-500/30 text-xs font-mono text-cyan-200">
                  {toolProgressText}
                </div>
              )}

              {!userSubtitle && !jarvisSubtitle ? (
                <p className="text-sm text-slate-400">
                  {needsUserGesture
                    ? 'Click Enable Auto-Voice once to arm "Hey August" hands-free standby.'
                    : coreState === 'standby'
                    ? 'Say "Hey August" or "August, open YouTube" to command hands-free.'
                    : isLiveConnected
                    ? isFallbackRecording
                      ? 'Speak your command now, then click Send Voice Command.'
                      : 'Speak naturally. Live spoken subtitles appear here.'
                    : 'Tap to Talk or click Wake Now to give a voice command.'}
                </p>
              ) : (
                <>
                  {userSubtitle && (
                    <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
                      <span className="text-cyan-300 font-medium">You:</span>{' '}
                      {userSubtitle}
                    </p>
                  )}
                  {jarvisSubtitle && (
                    <div className="space-y-2 max-w-2xl">
                      {activeScopeLabel && (
                        <div className="inline-flex items-center gap-1.5 rounded border border-cyan-500/30 bg-cyan-950/50 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-cyan-300">
                          <Shield className="w-3 h-3" />
                          <span>{activeScopeLabel}</span>
                        </div>
                      )}
                      <p className="text-base sm:text-xl font-medium text-white leading-relaxed">
                        {jarvisSubtitle}
                      </p>
                      {activeCitations.length > 0 && (
                        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                          {activeCitations.map((cit, i) => (
                            <span
                              key={`${cit.docName}_${cit.sectionLabel}_${i}`}
                              title={cit.excerpt}
                              className="inline-flex items-center gap-1 rounded border border-sky-500/35 bg-sky-950/60 px-2 py-0.5 text-[11px] font-mono text-sky-200"
                            >
                              <BookOpen className="w-3 h-3 text-sky-400" />
                              <span>
                                [{cit.docName} · {cit.sectionLabel}]
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {visibleMemoriesUsed.length > 0 && config.memoryEnabled && (
                    <div className="text-[11px] text-cyan-300/75 font-mono">
                      Memories referenced: {visibleMemoriesUsed.slice(0, 4).join(' · ')}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Context-Only HUD 0A: Weather & Verified News Briefing */}
            {(weatherCard || newsCard) && (
              <div className="w-full max-w-xl relative">
                <button
                  type="button"
                  onClick={() => {
                    setWeatherCard(null);
                    setNewsCard(null);
                  }}
                  aria-label="Dismiss weather and news briefing"
                  className="absolute right-2.5 top-2.5 z-10 p-1 rounded bg-slate-900/90 text-slate-400 hover:text-white border border-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <WeatherNewsBriefingCard weather={weatherCard} news={newsCard} />
              </div>
            )}

            {/* Context-Only HUD 0B: Interactive Google Maps Places & Routes */}
            {showMapsCard && (
              <div className="w-full max-w-xl relative">
                <button
                  type="button"
                  onClick={() => setShowMapsCard(false)}
                  aria-label="Close maps card"
                  className="absolute right-2.5 top-2.5 z-10 p-1 rounded bg-slate-900/90 text-slate-400 hover:text-white border border-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <MapsIntelligenceCard
                  apiKey={mapsApiKey}
                  places={mapsPlaces}
                  route={mapsRoute}
                  quotaExceeded={mapsQuotaExceeded}
                  onQuickSearch={(q) => void executeFallbackVoiceCommand(`find ${q} on map`)}
                />
              </div>
            )}

            {/* Context-Only HUD 1: Incoming Call Assistance */}
            {incomingCall && incomingCall.status === 'ringing' && (
              <div className="w-full max-w-lg px-4 py-3.5 bg-[#091526]/95 border border-cyan-400/50 rounded-xl space-y-2.5 shadow-[0_12px_36px_rgba(6,182,212,0.2)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shrink-0">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-hud uppercase tracking-wider text-cyan-300">
                        Incoming Call · {incomingCall.appSource}
                      </div>
                      <div className="text-sm font-semibold text-white">
                        {incomingCall.callerName}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdateIncomingCall(null)}
                    aria-label="Dismiss call HUD"
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {incomingCall.actionNote && (
                  <p className="text-xs text-slate-300">{incomingCall.actionNote}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateIncomingCall((prev) =>
                        prev ? { ...prev, status: 'answered', actionNote: 'Answered' } : prev
                      );
                      if (companionRef.current?.connected) {
                        void companionRef.current.sendCommand('incoming_call_action', {
                          callAction: 'answer',
                          callerName: incomingCall.callerName,
                        });
                      }
                      setActionNotice(`Answered call from ${incomingCall.callerName}.`);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Answer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const replyText =
                        config.callConfig?.busyReplyText ||
                        'Hasan is busy right now and will get back to you shortly.';
                      onUpdateIncomingCall((prev) =>
                        prev ? { ...prev, status: 'busy_replied', actionNote: replyText } : prev
                      );
                      if (companionRef.current?.connected) {
                        void companionRef.current.sendCommand('incoming_call_action', {
                          callAction: 'busy_reply',
                          replyText,
                        });
                      }
                      setActionNotice(`Sent busy reply for ${incomingCall.callerName}.`);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 rounded-lg"
                  >
                    Busy Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateIncomingCall((prev) =>
                        prev ? { ...prev, status: 'declined', actionNote: 'Declined' } : prev
                      );
                      if (companionRef.current?.connected) {
                        void companionRef.current.sendCommand('incoming_call_action', {
                          callAction: 'decline',
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 rounded-lg"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>
                </div>
              </div>
            )}

            {/* Context-Only HUD 2: Ringing Alarm HUD */}
            {ringingAlarm && (
              <div className="w-full max-w-lg px-4 py-3 bg-amber-950/92 border border-amber-400/60 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <AlarmClock className="w-5 h-5 text-amber-300 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-hud uppercase tracking-wider text-amber-300">
                      {ringingAlarm.kind === 'alarm' ? 'Alarm Ringing' : 'Timer Complete'}
                    </div>
                    <div className="text-sm font-semibold text-white truncate">
                      {ringingAlarm.title}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void onUpdateSchedule(ringingAlarm.id, { snoozeMinutes: 5 })
                    }
                    className="px-2.5 py-1.5 text-xs font-medium bg-amber-500/25 hover:bg-amber-500/35 border border-amber-400/45 text-amber-100 rounded-lg"
                  >
                    Snooze 5m
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopAllSpeaking();
                      void onUpdateSchedule(ringingAlarm.id, { status: 'completed' });
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Context-Only HUD 3: Active Timer Countdown & Controls */}
            {focusedTimer && (
              <div className="w-full max-w-lg px-4 py-3 bg-[#081324]/95 border border-cyan-500/40 rounded-xl space-y-2.5">
                {activeTimersList.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeTimersList.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTimerId(t.id)}
                        className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
                          t.id === focusedTimer.id
                            ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {t.label} ({formatTimerHud(t.remainingSeconds)})
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-11 h-11 shrink-0">
                      <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
                        <circle
                          cx="18"
                          cy="18"
                          r="15"
                          fill="none"
                          stroke="rgba(30,41,59,0.9)"
                          strokeWidth="3"
                        />
                        <circle
                          cx="18"
                          cy="18"
                          r="15"
                          fill="none"
                          stroke={focusedTimer.paused ? '#f59e0b' : '#22d3ee'}
                          strokeWidth="3"
                          strokeDasharray={`${Math.max(
                            2,
                            (focusedTimer.remainingSeconds /
                              Math.max(1, focusedTimer.totalSeconds)) *
                              94.2
                          )} 94.2`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <Timer className="w-4 h-4 text-cyan-300 absolute inset-0 m-auto" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-slate-400 truncate">
                        {focusedTimer.label}{' '}
                        {focusedTimer.paused ? '· Paused' : '· Running'}
                      </div>
                      <div className="text-xl font-hud font-bold tabular-nums text-cyan-200 tracking-wider">
                        {formatTimerHud(focusedTimer.remainingSeconds)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        void onUpdateSchedule(focusedTimer.id, {
                          paused: !focusedTimer.paused,
                        })
                      }
                      aria-label={focusedTimer.paused ? 'Resume timer' : 'Pause timer'}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 rounded-lg"
                    >
                      {focusedTimer.paused ? (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Resume</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>Pause</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void onUpdateSchedule(focusedTimer.id, { restart: true })
                      }
                      aria-label="Restart timer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restart</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void onUpdateSchedule(focusedTimer.id, { status: 'cancelled' })
                      }
                      aria-label="Cancel timer"
                      className="p-1.5 text-slate-400 hover:text-rose-300 bg-slate-900 border border-slate-800 rounded-lg"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Context-Only HUD 4: Real Browser Automation Progress, Clickable Results & Sensitive Confirmation Gate */}
            {browserSnapshot.status !== 'idle' &&
              (showBrowserHud ||
                browserSnapshot.active ||
                browserSnapshot.results.length > 0 ||
                browserSnapshot.status === 'awaiting_confirmation') && (
                <div className="w-full max-w-xl px-4 py-3 bg-[#081324]/95 border border-cyan-500/40 rounded-xl space-y-2.5 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-hud uppercase tracking-wider text-cyan-300">
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Browser Engine · {browserSnapshot.engine.toUpperCase()} ·{' '}
                          {browserSnapshot.status}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-white truncate mt-0.5">
                        {browserSnapshot.pageTitle ||
                          browserSnapshot.currentUrl ||
                          'Chromium Session'}
                      </div>
                      {browserSnapshot.currentUrl && (
                        <div className="text-[11px] font-mono text-slate-400 truncate">
                          {browserSnapshot.currentUrl}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {browserSnapshot.status === 'running' && (
                        <button
                          type="button"
                          onClick={() => void onAbortBrowserAction()}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-rose-500/20 border border-rose-400/40 text-rose-200 rounded-md"
                        >
                          Stop
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowBrowserHud(false)}
                        aria-label="Minimize browser HUD"
                        className="p-1 text-slate-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {browserSnapshot.sensitivePrompt && (
                    <div className="p-2.5 rounded-lg bg-amber-950/75 border border-amber-400/45 space-y-2">
                      <div className="text-xs font-semibold text-amber-200">
                        {browserSnapshot.sensitivePrompt.message}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void onExecuteBrowserAction({
                              action:
                                browserSnapshot.sensitivePrompt!.pendingAction || 'confirm',
                              url: browserSnapshot.sensitivePrompt!.targetUrl,
                              confirmedSensitive: true,
                            })
                          }
                          className="px-3 py-1 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-md"
                        >
                          Confirm & Proceed
                        </button>
                        <button
                          type="button"
                          onClick={() => void onAbortBrowserAction()}
                          className="px-3 py-1 text-xs bg-slate-800 text-slate-200 rounded-md"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {browserSnapshot.steps.length > 0 && (
                    <div className="text-[11px] font-mono text-cyan-200/90 space-y-0.5 max-h-16 overflow-y-auto">
                      {browserSnapshot.steps.slice(0, 3).map((st, idx) => (
                        <div key={`${st.timestamp}_${idx}`} className="truncate">
                          {st.ok ? '✓' : '✕'} {st.step}
                        </div>
                      ))}
                    </div>
                  )}

                  {browserSnapshot.results.length > 0 && (
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {browserSnapshot.results.slice(0, 5).map((r) => (
                        <button
                          key={`${r.index}_${r.url}`}
                          type="button"
                          onClick={() =>
                            void onExecuteBrowserAction({
                              action: 'open_result',
                              resultIndex: r.index,
                            })
                          }
                          className="w-full text-left px-2.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-cyan-950/60 border border-slate-800 hover:border-cyan-500/40 transition-colors"
                        >
                          <div className="text-xs font-medium text-cyan-200 truncate">
                            {r.index}. {r.title}
                          </div>
                          {r.snippet && (
                            <div className="text-[11px] text-slate-400 truncate">
                              {r.snippet}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        void onExecuteBrowserAction({ action: 'scroll', direction: 'down' })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md"
                    >
                      <ArrowDown className="w-3 h-3" />
                      <span>Scroll</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onExecuteBrowserAction({ action: 'back' })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onExecuteBrowserAction({ action: 'new_tab' })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md"
                    >
                      <Plus className="w-3 h-3" />
                      <span>New Tab</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onExecuteBrowserAction({ action: 'read_page' })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-200 rounded-md"
                    >
                      <Radar className="w-3 h-3" />
                      <span>Read Page</span>
                    </button>
                    {browserSnapshot.currentUrl && (
                      <a
                        href={browserSnapshot.currentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 rounded-md ml-auto"
                      >
                        <span>Open Tab</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

            {/* Context-Only HUD 5: Quiet Queued Notifications indicator during Gaming / Busy / DND */}
            {queuedAlerts.length > 0 && (
              <div className="w-full max-w-lg px-3.5 py-2 rounded-xl bg-slate-900/95 border border-cyan-500/30 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-200">
                  {queuedAlerts.length} update{queuedAlerts.length === 1 ? '' : 's'} queued quietly while busy/gaming.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const first = queuedAlerts[0];
                    setQueuedAlerts([]);
                    if (first) {
                      setJarvisSubtitle(first.spokenText);
                      void speakWithAgentVoice(first.spokenText, {
                        updateCoreState: !isLiveConnected,
                      });
                    }
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 rounded-md shrink-0"
                >
                  Read Now
                </button>
              </div>
            )}

            {/* Instant Launch Card for opened apps/websites */}
            {launchTarget && (
              <div className="w-full max-w-lg px-4 py-3 bg-[#0a1426]/92 border border-cyan-500/35 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {launchTarget.name}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      <span>{hostnameLabel}</span>
                      {launchTarget.searchQuery && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>{launchTarget.searchQuery}</span>
                        </>
                      )}
                      <span aria-hidden="true"> · </span>
                      <span
                        className={
                          launchTarget.popupBlocked
                            ? 'text-amber-300 font-medium'
                            : 'text-cyan-300'
                        }
                      >
                        {launchTarget.launchedVia === 'companion'
                          ? 'Opened on PC'
                          : launchTarget.popupBlocked
                          ? 'Auto-popup blocked'
                          : 'Tab ready'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLaunchTarget(null)}
                    aria-label="Dismiss launch card"
                    className="p-1.5 text-slate-400 hover:text-white rounded-md shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {launchTarget.popupBlocked && (
                  <p className="text-xs text-amber-200/90 leading-relaxed">
                    Your browser blocked automatic tab opening. Click{' '}
                    <span className="font-semibold text-white">Open {launchTarget.name}</span>{' '}
                    below to launch immediately.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={launchTarget.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      setLaunchTarget((prev) =>
                        prev
                          ? { ...prev, popupBlocked: false, launchedVia: 'browser_tab' }
                          : prev
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Open {launchTarget.name}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(launchTarget.url)
                        .then(() => {
                          setLaunchTarget((prev) =>
                            prev ? { ...prev, copiedUrl: true } : prev
                          );
                        })
                        .catch(() => {});
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {launchTarget.copiedUrl ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-cyan-300" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>Copy URL</span>
                      </>
                    )}
                  </button>

                  {telemetry.companionConnected && (
                    <button
                      type="button"
                      onClick={() => {
                        void companionRef.current
                          ?.sendCommand('companion_open_url', { url: launchTarget.url })
                          .then((res) => {
                            if (res.ok) {
                              setLaunchTarget((prev) =>
                                prev
                                  ? { ...prev, popupBlocked: false, launchedVia: 'companion' }
                                  : prev
                              );
                              setActionNotice(`Opened ${launchTarget.name} on your PC.`);
                            } else {
                              setErrorMessage(res.message);
                            }
                          });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-cyan-200 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/35 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Laptop className="w-3.5 h-3.5" />
                      <span>Open on PC</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Inline Memory Proposal Card so voice memory saves require approval */}
            {pendingProposals.length > 0 && (
              <div className="w-full max-w-md px-4 py-3 bg-cyan-950/92 border border-cyan-400/40 rounded-xl flex items-center justify-between gap-3">
                <div className="min-w-0 text-xs">
                  <div className="font-semibold text-cyan-200">
                    Save to Personal Memory?
                  </div>
                  <div className="text-slate-200 truncate">
                    <span className="font-mono text-cyan-300">
                      {pendingProposals[0].key}
                    </span>
                    : {pendingProposals[0].value}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const prop = pendingProposals[0];
                      onAddOrUpdateMemory({
                        key: prop.key,
                        value: prop.value,
                        category: prop.category,
                      });
                      setPendingProposals((prev) => prev.slice(1));
                      setActionNotice(`Saved "${prop.key}" to memory.`);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-cyan-400 text-slate-950 font-semibold text-xs rounded-lg whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingProposals((prev) => prev.slice(1))}
                    className="px-2.5 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg whitespace-nowrap"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Explicit Confirmation Gate for sensitive Computer Control actions */}
            {pendingConfirmation && (
              <div className="w-full max-w-md px-4 py-3 bg-amber-950/92 border border-amber-400/45 rounded-xl space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-amber-200">
                      {pendingConfirmation.title}
                    </div>
                    <p className="text-xs text-slate-200 mt-0.5">
                      {pendingConfirmation.description}
                    </p>
                  </div>
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const action = pendingConfirmation;
                      setPendingConfirmation(null);
                      void executeBrowserOrCompanionControl(
                        action.actionType,
                        action.args
                      );
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg whitespace-nowrap"
                  >
                    Confirm & Execute
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingConfirmation(null)}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Screen Capture Preview */}
            {screenshotPreview && (
              <div className="w-full max-w-md p-3 bg-[#0a1426]/95 border border-cyan-500/30 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-cyan-200">
                    Captured Screen Frame ({screenshotPreview.width}×
                    {screenshotPreview.height})
                  </span>
                  <button
                    type="button"
                    onClick={() => setScreenshotPreview(null)}
                    aria-label="Close screenshot"
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <img
                  src={screenshotPreview.dataUrl}
                  alt="Captured screen preview"
                  className="w-full max-h-36 object-cover rounded-lg border border-slate-800"
                />
                {screenshotPreview.analysis && (
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {screenshotPreview.analysis}
                  </p>
                )}
                <button
                  type="button"
                  disabled={screenshotPreview.analyzing}
                  onClick={() => void handleAnalyzeScreenshot()}
                  className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-60"
                >
                  {screenshotPreview.analyzing
                    ? 'Analyzing with Gemini...'
                    : 'Analyze Screen with Jarvis'}
                </button>
              </div>
            )}
          </div>

          {/* Direct Action Command Bar + Primary Voice Controls */}
          <div className="w-full max-w-xl space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const cmd = commandInput.trim();
                if (!cmd) return;
                setCommandInput('');
                void executeFallbackVoiceCommand(cmd);
              }}
              className="flex items-center gap-2 bg-[#08101e]/95 border border-cyan-500/25 rounded-xl px-3 py-1.5"
            >
              <Terminal className="w-4 h-4 text-cyan-400 shrink-0" />
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder='Command August (e.g. "YouTube-e Minecraft search koro", "Set timer 2m", "Monitor GTA 6")'
                className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none py-1.5"
              />
              <button
                type="submit"
                aria-label="Execute command"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Execute</span>
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-center gap-3">
              {coreState === 'speaking' && !isLiveConnected && (
                <button
                  type="button"
                  onClick={() => {
                    stopAllSpeaking();
                    setActionNotice('Speech stopped.');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors whitespace-nowrap shrink-0"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop Speaking</span>
                </button>
              )}

              {!isLiveConnected && coreState !== 'standby' && (
                <>
                  {needsUserGesture ? (
                    <button
                      type="button"
                      onClick={handleEnableAutoVoice}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                    >
                      <Radio className="w-4 h-4" />
                      <span>Enable Auto-Voice</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleWakeNow}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                    >
                      <Mic className="w-4 h-4" />
                      <span>Tap to Talk</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={needsUserGesture ? handleWakeNow : handleEnableAutoVoice}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-cyan-100 bg-slate-900/90 hover:bg-slate-800 border border-cyan-500/35 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    {needsUserGesture ? (
                      <>
                        <Mic className="w-4 h-4 text-cyan-400" />
                        <span>Wake Now</span>
                      </>
                    ) : (
                      <>
                        <Radio className="w-4 h-4 text-cyan-400" />
                        <span>Enable Auto-Voice</span>
                      </>
                    )}
                  </button>
                </>
              )}

              {coreState === 'standby' && (
                <>
                  <button
                    type="button"
                    onClick={handleWakeNow}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Tap to Talk / Wake Now</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleStopListening}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    <MicOff className="w-4 h-4" />
                    <span>Stop Listening</span>
                  </button>
                </>
              )}

              {isLiveConnected && (
                <>
                  {isFallbackRecording ? (
                    <button
                      type="button"
                      onClick={handleFinishFallbackRecording}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-colors whitespace-nowrap shrink-0"
                    >
                      <Send className="w-4 h-4" />
                      <span>Send Voice Command</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsMuted((prev) => !prev)}
                      disabled={coreState === 'waking'}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl border transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                        isMuted
                          ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                          : 'bg-slate-900/90 border-cyan-500/30 text-slate-100 hover:bg-slate-800'
                      }`}
                    >
                      {isMuted ? (
                        <>
                          <MicOff className="w-4 h-4" />
                          <span>Unmute Microphone</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-4 h-4 text-cyan-400" />
                          <span>Mute Microphone</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleStopListening}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl transition-colors whitespace-nowrap shrink-0"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>Stop Listening</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {!cinematicMode && showRightPanel && (
          <JarvisSidePanels
            side="right"
            activeLeftTab={activeLeftTab}
            activeRightTab={activeRightTab}
            onSelectLeftTab={setActiveLeftTab}
            onSelectRightTab={setActiveRightTab}
            onClosePanel={() => setShowRightPanel(false)}
            user={user}
            authLoading={authLoading}
            cloudError={cloudError}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
            state={state}
            config={config}
            onUpdateConfig={onUpdateConfig}
            onOpenBackupModal={() => setIsBackupModalOpen(true)}
            onAddTask={onAddTask}
            onToggleTask={onToggleTask}
            onDeleteTask={onDeleteTask}
            schedules={schedules}
            executionLogs={executionLogs}
            quotaStatus={quotaStatus}
            notificationPermission={notificationPermission}
            onRequestNotificationPermission={onRequestNotificationPermission}
            onCreateSchedule={onCreateSchedule}
            onUpdateSchedule={onUpdateSchedule}
            onDeleteSchedule={onDeleteSchedule}
            onClearExecutionLogs={onClearExecutionLogs}
            monitorTopics={monitorTopics}
            monitorUpdates={monitorUpdates}
            onCreateMonitor={onCreateMonitor}
            onUpdateMonitor={onUpdateMonitor}
            onDeleteMonitor={onDeleteMonitor}
            onCheckMonitorNow={onCheckMonitorNow}
            onPauseAllMonitors={onPauseAllMonitors}
            onResumeAllMonitors={onResumeAllMonitors}
            desktopContext={desktopContext}
            onToggleDesktopAwareness={handleToggleDesktopAwareness}
            onTriggerLocalIncomingCall={(callerName) =>
              onTriggerLocalIncomingCall(callerName)
            }
            pendingProposals={pendingProposals}
            lastMemoriesUsed={lastMemoriesUsed}
            onApproveProposal={(id) => {
              const prop = pendingProposals.find((p) => p.id === id);
              if (!prop) return;
              onAddOrUpdateMemory({
                key: prop.key,
                value: prop.value,
                category: prop.category,
              });
              setPendingProposals((prev) => prev.filter((p) => p.id !== id));
              setActionNotice(`Saved memory "${prop.key}" to your Personal Memory Vault.`);
            }}
            onDismissProposal={(id) =>
              setPendingProposals((prev) => prev.filter((p) => p.id !== id))
            }
            onAddOrUpdateMemory={onAddOrUpdateMemory}
            onDeleteMemory={onDeleteMemory}
            onRequestClearAllMemories={() =>
              setPendingConfirmation({
                id: `clear_mem_${Date.now()}`,
                toolName: 'memory_vault',
                title: 'Confirm Clear All Memories',
                description: `Permanently delete all ${state.memory.length} saved memories from your vault?`,
                target: 'All Personal Memories',
                actionType: 'clear_all_memories',
                args: {},
                riskLevel: 'high',
              })
            }
            onRerunHistoryQuery={(q) =>
              void startVoiceSession(q, !config.continuousMode)
            }
            onDeleteHistoryItem={onDeleteHistoryItem}
            onUpdateEnvironment={onUpdateEnvironment}
            telemetry={telemetry}
            micPrivacyStatus={micPrivacyStatus}
            voiceStatusDetail={voiceStatusDetail}
            isLiveConnected={isLiveConnected}
            onTestAgentVoice={handleTestAgentVoice}
            isTestingVoice={isTestingVoice}
            selectedFolderName={selectedFolderName}
            folderEntries={folderEntries}
            onRequestScreenshot={() =>
              handleComputerActionSignal({ action: 'capture_screenshot' })
            }
            onOpenLocalFile={() =>
              handleComputerActionSignal({ action: 'open_local_file' })
            }
            onSelectLocalFolder={() => {
              void pickDirectoryHandle()
                .then(async (handle) => {
                  dirHandleRef.current = handle;
                  setSelectedFolderName(handle.name);
                  const entries = await listAndSearchDirectory(handle);
                  setFolderEntries(entries);
                })
                .catch((err) =>
                  setErrorMessage(
                    err instanceof Error ? err.message : 'Folder access denied.'
                  )
                );
            }}
            onRequestCreateFolder={(folderName) =>
              handleComputerActionSignal({
                action: 'create_local_folder',
                target: folderName,
              })
            }
            onConnectCompanion={() => {
              void companionRef.current
                ?.connect(
                  config.companionUrl || 'ws://127.0.0.1:4849',
                  config.companionPairingToken
                )
                .then((ok) => {
                  if (!ok) {
                    setErrorMessage(
                      'Desktop Companion did not respond on local port 4849. Start jarvis-companion.mjs on your PC first.'
                    );
                  } else {
                    setActionNotice('Desktop Companion connected.');
                  }
                });
            }}
            onDisconnectCompanion={() => companionRef.current?.disconnect()}
            onDownloadCompanionScript={handleDownloadCompanion}
            knowledgeDocs={knowledgeDocs}
            knowledgeChunks={knowledgeChunks}
            knowledgeUploading={knowledgeUploading}
            knowledgeError={knowledgeError}
            onUploadKnowledgeFile={onUploadKnowledgeFile}
            onToggleKnowledgeDoc={onToggleKnowledgeDoc}
            onDeleteKnowledgeDoc={onDeleteKnowledgeDoc}
            integrations={integrations}
            haConnected={haConnected}
            haBaseUrl={haBaseUrl}
            haEntities={haEntities}
            haBusy={haBusy}
            haError={haError}
            onConnectHomeAssistant={onConnectHomeAssistant}
            onRefreshHomeAssistant={onRefreshHomeAssistant}
            onDisconnectHomeAssistant={onDisconnectHomeAssistant}
            onToggleHomeAssistantEntity={onToggleHomeAssistantEntity}
            pcHardwareTelemetry={pcHardwareTelemetry}
            screenOcrSnapshot={screenOcrSnapshot}
            agenticSteps={agenticSteps}
            onCaptureScreenOcr={() =>
              handleComputerActionSignal({ action: 'companion_screen_ocr' })
            }
            onRunQuickPcAction={(cmd) => void executeFallbackVoiceCommand(cmd)}
          />
        )}
      </div>

      {/* Grouped Studio Workspaces (Mounted when selected in the Obsidian Studio Rail) */}
      {activeStudio !== 'core' && (
        <div className="relative z-10 flex-1 p-4 sm:p-6 overflow-y-auto">
          {activeStudio === 'dev' && (
            <DevBugStudio
              key={`dev_${studioNavSeq}`}
              initialTab={devSubTab}
              projects={projects}
              bugReports={bugReports}
              companionBridge={companionBridgeState}
              companionConnected={telemetry.companionConnected}
              onSaveProject={onSaveProject}
              onDeleteProject={onDeleteProject}
              onSaveBugReport={onSaveBugReport}
              onLogAction={(command, detail, status) =>
                onRecordExecutionLog({
                  command,
                  intent: 'dev_bug_studio',
                  source: devSubTab === 'bugfix' ? 'bugfix' : 'dev',
                  status: status || 'COMPLETED',
                  detail,
                  verified: status !== 'FAILED',
                })
              }
              getAuthHeaders={getAuthHeaders}
            />
          )}

          {activeStudio === 'creative' && (
            <CreationStudios
              key={`creative_${studioNavSeq}`}
              initialTab={creativeSubTab}
              assets={creativeAssets}
              companionBridge={companionBridgeState}
              companionConnected={telemetry.companionConnected}
              onSaveAsset={onSaveCreativeAsset}
              onDeleteAsset={onDeleteCreativeAsset}
              onLogAction={(command, detail) =>
                onRecordExecutionLog({
                  command,
                  intent: 'creative_studio',
                  source: 'creative',
                  status: 'COMPLETED',
                  detail,
                  verified: true,
                })
              }
              getAuthHeaders={getAuthHeaders}
            />
          )}

          {activeStudio === 'skills' && (
            <SkillsAgentHub
              key={`skills_${studioNavSeq}`}
              initialTab={skillsSubTab}
              uid={user?.uid || null}
              skills={skills}
              agentRuns={agentRuns}
              workflows={workflows}
              onSaveSkill={onSaveSkill}
              onSaveSkillVersion={onSaveSkillVersion}
              onDeleteSkill={onDeleteSkill}
              onSaveAgentRun={onSaveAgentRun}
              onSaveWorkflow={onSaveWorkflow}
              onDeleteWorkflow={onDeleteWorkflow}
              onLogAction={(command, detail) =>
                onRecordExecutionLog({
                  command,
                  intent: 'skills_agent_hub',
                  source: 'skills',
                  status: 'COMPLETED',
                  detail,
                  verified: true,
                })
              }
              getAuthHeaders={getAuthHeaders}
            />
          )}

          {activeStudio === 'personal' && (
            <PersonalCallHub
              key={`personal_${studioNavSeq}`}
              initialTab={personalSubTab}
              contacts={contacts}
              callLogs={callLogs}
              companionBridge={companionBridgeState}
              companionConnected={telemetry.companionConnected}
              onSaveContact={onSaveContact}
              onDeleteContact={onDeleteContact}
              onLogCall={onLogCall}
              onLogAction={(command, detail) =>
                onRecordExecutionLog({
                  command,
                  intent: 'personal_call_hub',
                  source: 'workspace',
                  status: 'COMPLETED',
                  detail,
                  verified: true,
                })
              }
            />
          )}

          {activeStudio === 'system' && (
            <SecurityAuditHub
              executionLogs={executionLogs}
              bugReports={bugReports}
              agentRuns={agentRuns}
              creativeAssets={creativeAssets}
              awareness={desktopContext}
              hardwareTelemetry={pcHardwareTelemetry}
              companionConnected={telemetry.companionConnected}
              onToggleAwareness={handleToggleDesktopAwareness}
              onRefreshTelemetry={() => handleComputerActionSignal({ action: 'system_info' })}
            />
          )}
        </div>
      )}

      {/* Bottom Compact Quick Navigation & Drawer Controls */}
      <div className="relative z-20 px-4 sm:px-6 py-2.5 border-t border-cyan-500/15 bg-[#060c18]/92 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { tab: 'tasks', label: `Tasks (${state.tasks.filter((t) => !t.completed).length})` },
              { tab: 'alarms', label: `Alarms (${activeSchedulesCount})` },
              { tab: 'monitors', label: `Monitors (${activeMonitorsCount})` },
              { tab: 'knowledge', label: `Knowledge (${knowledgeDocs.length})` },
              { tab: 'smarthome', label: `Smart Home${haConnected ? ` (${haEntities.length})` : ''}` },
              { tab: 'memory', label: `Memory (${state.memory.length})` },
              { tab: 'history', label: `History (${state.searchHistory.length})` },
            ] as const
          ).map((item) => (
            <button
              key={item.tab}
              type="button"
              onClick={() => {
                setCinematicMode(false);
                setShowLeftPanel(true);
                setActiveLeftTab(item.tab);
              }}
              className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                !cinematicMode && showLeftPanel && activeLeftTab === item.tab
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setCinematicMode(false);
              setShowRightPanel(true);
              setActiveRightTab('system');
            }}
            className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              !cinematicMode && showRightPanel && activeRightTab === 'system'
                ? 'bg-cyan-500/20 text-cyan-200'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            System Status
          </button>
          <button
            type="button"
            onClick={() => {
              setCinematicMode(false);
              setShowRightPanel(true);
              setActiveRightTab('pcvision');
            }}
            className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              !cinematicMode && showRightPanel && activeRightTab === 'pcvision'
                ? 'bg-cyan-500/20 text-cyan-200'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            PC &amp; Vision
          </button>
          <button
            type="button"
            onClick={() => {
              setCinematicMode(false);
              setShowRightPanel(true);
              setActiveRightTab('settings');
            }}
            className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              !cinematicMode && showRightPanel && activeRightTab === 'settings'
                ? 'bg-cyan-500/20 text-cyan-200'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Settings ({config.aiMode})
          </button>
          <button
            type="button"
            onClick={() => setIsBackupModalOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-slate-400 hover:text-slate-100 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Backup</span>
          </button>
        </div>
      </div>

      <SessionBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        messages={messages}
        config={config}
        state={state}
        onRestoreSession={onRestoreSession}
      />
    </div>
  );
};

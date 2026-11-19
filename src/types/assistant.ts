export type NavSection = 'sandbox' | 'architecture' | 'guide' | 'code';

export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskItem {
  id: string;
  title: string;
  priority: TaskPriority;
  completed: boolean;
  dueLabel?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TimerItem {
  id: string;
  label: string;
  durationSeconds: number;
  remainingSeconds: number;
  running: boolean;
  createdAt: string;
}

export type MemoryCategory =
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

export interface MemoryFact {
  id: string;
  key: string;
  value: string;
  category: MemoryCategory;
  approved: boolean;
  updatedAt: string;
  createdAt?: string;
}

export interface PendingMemoryProposal {
  id: string;
  key: string;
  value: string;
  category: MemoryCategory;
  reason?: string;
  createdAt: string;
}

export type ColorTemperature = 'warm' | 'daylight' | 'cool';

export interface EnvironmentState {
  lightBrightness: number;
  lightTemperature: ColorTemperature;
  thermostatCelsius: number;
  focusMode: boolean;
}

export type AiMode = 'FAST' | 'STANDARD' | 'PRO' | 'EXPERT';

export type WakeEnginePreference = 'auto' | 'porcupine' | 'speech_recognition' | 'manual';

export type TaskLifecycleState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'FAILED';

export type ScheduleKind = 'alarm' | 'reminder' | 'timer';

export type ScheduleStatus =
  | 'scheduled'
  | 'triggered'
  | 'snoozed'
  | 'cancelled'
  | 'completed';

export type ScheduleRecurrence = 'once' | 'daily';

export interface ScheduledItem {
  id: string;
  kind: ScheduleKind;
  title: string;
  triggerAt: string;
  durationSeconds?: number;
  remainingSecondsWhenPaused?: number;
  paused?: boolean;
  recurrence?: ScheduleRecurrence;
  status: ScheduleStatus;
  snoozedUntil?: string;
  spokenMessage?: string;
  createdAt: string;
  updatedAt: string;
  triggeredAt?: string;
}

export type StudioHubId =
  | 'core'
  | 'dev'
  | 'creative'
  | 'skills'
  | 'personal'
  | 'system';

export type CoreAvatarMode = 'orb' | 'character';

export type CharacterMood =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'alert'
  | 'sleeping'
  | 'care';

export interface ExecutionLogEntry {
  id: string;
  command: string;
  intent: string;
  source:
    | 'local'
    | 'companion'
    | 'live'
    | 'brain'
    | 'scheduler'
    | 'home_assistant'
    | 'rag'
    | 'maps'
    | 'intelligence'
    | 'skills'
    | 'dev'
    | 'bugfix'
    | 'creative'
    | 'workspace'
    | 'calling'
    | 'workflow';
  status: 'EXECUTING' | 'SCHEDULED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  detail: string;
  verified: boolean;
  durationMs?: number;
  createdAt: string;
}

export interface GeminiQuotaStatus {
  limited: boolean;
  cooldownUntil?: string;
  retryAfterSeconds: number;
  lastStatusCode?: number;
  lastError?: string;
  lastModel?: string;
}

export type JarvisLogoState =
  | 'idle'
  | 'standby'
  | 'waking'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'executing'
  | 'timer'
  | 'alarm'
  | 'reminder'
  | 'searching'
  | 'browser'
  | 'gaming'
  | 'focus'
  | 'care'
  | 'sleep'
  | 'error'
  | 'completed'
  | 'disconnected';

export interface SearchHistoryItem {
  id: string;
  query: string;
  responsePreview?: string;
  aiMode?: AiMode;
  memoriesUsed?: string[];
  createdAt: string;
  lastRunAt: string;
  runCount: number;
  usedSearchGrounding?: boolean;
  toolCount?: number;
}

export interface AssistantState {
  tasks: TaskItem[];
  timers: TimerItem[];
  memory: MemoryFact[];
  environment: EnvironmentState;
  searchHistory: SearchHistoryItem[];
}

export type ToolGroupId =
  | 'tasks'
  | 'timers'
  | 'memory'
  | 'environment'
  | 'search'
  | 'computer';

export type VoiceMode = 'gemini' | 'browser' | 'muted';

export type ThinkingPreset = 'LOW' | 'MEDIUM' | 'HIGH';

export type GeminiVoiceName = 'Charon' | 'Fenrir' | 'Kore' | 'Puck' | 'Zephyr';

export type VoiceMood =
  | 'normal'
  | 'sad'
  | 'angry'
  | 'excited'
  | 'proud'
  | 'serious'
  | 'greeting';

export type SourceCredibilityTier =
  | 'official'
  | 'academic'
  | 'reputable'
  | 'secondary';

export interface KnowledgeCitation {
  docId?: string;
  docName: string;
  sectionLabel: string;
  excerpt: string;
  score?: number;
}

export interface KnowledgeDocItem {
  id: string;
  userId?: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  chunkCount: number;
  status: 'indexing' | 'ready' | 'failed';
  checksum?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunkItem {
  id: string;
  userId?: string;
  docId: string;
  docName: string;
  sectionLabel: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  createdAt: string;
}

export interface WeatherBriefing {
  location: string;
  temperatureC?: string;
  condition: string;
  humidity?: string;
  wind?: string;
  summary: string;
  sources: Array<{
    title: string;
    uri: string;
    tier: SourceCredibilityTier;
  }>;
  fetchedAt: string;
}

export interface NewsBriefingItem {
  headline: string;
  summary: string;
  publisher: string;
  url: string;
  tier: SourceCredibilityTier;
  publishedAt?: string;
}

export interface MapsPlaceItem {
  id: string;
  name: string;
  address: string;
  rating?: number;
  userRatingCount?: number;
  lat: number;
  lng: number;
  googleMapsUri?: string;
  primaryType?: string;
}

export interface MapsRouteSummary {
  originLabel: string;
  destinationLabel: string;
  distanceMeters: number;
  durationText: string;
  encodedPolyline: string;
  steps: Array<{
    instruction: string;
    distanceMeters: number;
    durationText: string;
  }>;
  originLatLng?: { lat: number; lng: number };
  destinationLatLng?: { lat: number; lng: number };
}

export interface HomeAssistantEntity {
  entityId: string;
  domain: string;
  friendlyName: string;
  state: string;
  areaName?: string;
  attributes: Record<string, unknown>;
  lastUpdated?: string;
}

export interface ConnectedIntegrationItem {
  id: string;
  userId?: string;
  provider: 'home_assistant' | 'windows_companion';
  label: string;
  baseUrl?: string;
  status: 'connected' | 'disconnected' | 'error';
  entityCount: number;
  lastVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstalledAppInfo {
  name: string;
  execKey?: string;
  path?: string;
  source?: string;
}

export interface PcWindowInfo {
  hwnd?: number | string;
  title: string;
  processName: string;
  active?: boolean;
}

export interface HardwareTelemetry {
  cpuPercent?: number;
  ramUsedGb?: number;
  ramTotalGb?: number;
  ramPercent?: number;
  gpuName?: string;
  gpuPercent?: number;
  batteryPercent?: number;
  batteryPlugged?: boolean;
  activeApp?: string;
  activeWindowTitle?: string;
  uptimeMinutes?: number;
  pythonAgentReady?: boolean;
}

export interface ScreenOcrSnapshot {
  capturedAt: string;
  width?: number;
  height?: number;
  activeApp?: string;
  windowTitle?: string;
  ocrText: string;
  imageBase64?: string;
  detectedElements?: Array<{ text: string; x: number; y: number }>;
  verificationSummary?: string;
}

export interface AgenticStepItem {
  index: number;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail?: string;
}

export interface AgentVoiceProfile {
  id: string;
  name: string;
  voiceName: GeminiVoiceName;
  stylePrompt: string;
  pitchSemitones: number;
  speed: number;
  description: string;
}

export type CoreVisualQuality = 'low' | 'balanced' | 'high';

export type VoiceLanguageCode = 'en-US' | 'en-IN' | 'bn-BD';

export type CallHandlingMode =
  | 'notify_wait'
  | 'vip_auto_answer'
  | 'ask_unknown'
  | 'silent_dnd';

export type DesktopActivityMode =
  | 'gaming'
  | 'video'
  | 'browser'
  | 'call'
  | 'idle'
  | 'dnd'
  | 'desktop';

export interface CallAssistanceConfig {
  enabled: boolean;
  handlingMode: CallHandlingMode;
  busyMode: boolean;
  busyReplyText: string;
  vipContacts: string[];
  autoAnswerEnabled: boolean;
}

export interface DesktopAwarenessState {
  enabled: boolean;
  activeApp: string;
  windowTitle: string;
  activity: DesktopActivityMode;
  doNotDisturb: boolean;
  source: 'companion' | 'browser' | 'offline';
  updatedAt: string;
}

export interface IncomingCallEvent {
  id: string;
  callerName: string;
  callerNumber?: string;
  appSource: string;
  status: 'ringing' | 'answered' | 'declined' | 'busy_replied' | 'missed';
  isVip: boolean;
  actionNote?: string;
  receivedAt: string;
}

export interface BrowserSearchResultItem {
  index: number;
  title: string;
  url: string;
  snippet?: string;
}

export interface BrowserStepReceipt {
  step: string;
  ok: boolean;
  detail: string;
  timestamp: string;
}

export interface BrowserAutomationSnapshot {
  active: boolean;
  engine: 'companion' | 'playwright' | 'none';
  status: 'idle' | 'running' | 'awaiting_confirmation' | 'completed' | 'failed' | 'aborted';
  currentUrl: string;
  pageTitle: string;
  tabCount: number;
  activeTabIndex: number;
  tabs: Array<{ index: number; title: string; url: string }>;
  results: BrowserSearchResultItem[];
  steps: BrowserStepReceipt[];
  pageSummary?: string;
  sensitivePrompt?: {
    id: string;
    reason: string;
    targetDescription: string;
    message?: string;
    pendingAction?: string;
    targetUrl?: string;
  };
  error?: string;
  updatedAt: string;
}

export type MonitorVerificationStatus = 'confirmed' | 'rumor';

export interface MonitorUpdateItem {
  id: string;
  topicId: string;
  topicTitle: string;
  headline: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  discoveredAt: string;
  verification: MonitorVerificationStatus;
  hash: string;
}

export interface MonitorTopic {
  id: string;
  query: string;
  label: string;
  category: 'gaming' | 'movies' | 'tech' | 'general';
  officialOnly: boolean;
  intervalMinutes: number;
  status: 'active' | 'paused';
  lastCheckedAt?: string;
  lastStatus: 'pending' | 'ok' | 'error';
  lastError?: string;
  latestUpdate?: MonitorUpdateItem;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantConfig {
  personaId: string;
  systemInstruction: string;
  enabledTools: ToolGroupId[];
  thinkingLevel: ThinkingPreset;
  aiMode: AiMode;
  continuousMode: boolean;
  memoryEnabled: boolean;
  wakeEngine: WakeEnginePreference;
  voiceMode: VoiceMode;
  voiceName: GeminiVoiceName;
  agentVoiceProfileId: string;
  agentVoiceStyle: string;
  voiceVolume: number;
  voiceSpeed: number;
  voicePitchSemitones: number;
  proactiveVoiceAlerts: boolean;
  spokenToolUpdates: boolean;
  soundFeedbackEnabled?: boolean;
  picovoiceAccessKey?: string;
  companionUrl?: string;
  visualQuality?: CoreVisualQuality;
  voiceLanguage?: VoiceLanguageCode;
  wakeSensitivity?: number;
  preferredMicDeviceId?: string;
  desktopAwarenessEnabled?: boolean;
  preferredLanguage?: VoiceLanguageCode;
  voiceMoodDefault?: VoiceMood;
  companionPairingToken?: string;
  callConfig?: CallAssistanceConfig;
}

export interface ProactiveAlert {
  id: string;
  title: string;
  spokenText: string;
  kind: 'timer' | 'alarm' | 'reminder' | 'task' | 'agent' | 'monitor' | 'call';
  scheduleId?: string;
  sourceUrl?: string;
  verification?: MonitorVerificationStatus;
  createdAt: string;
}

export interface ToolTraceItem {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  durationMs: number;
}

export interface GroundingSource {
  title: string;
  uri: string;
  tier?: SourceCredibilityTier;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  trace?: ToolTraceItem[];
  groundingSources?: GroundingSource[];
  citations?: KnowledgeCitation[];
  mood?: VoiceMood;
  scopeLabel?:
    | 'Internal Knowledge'
    | 'Verified Internet'
    | 'General Reasoning'
    | 'PC Companion'
    | 'Smart Home'
    | 'Local Execution';
  error?: boolean;
}

export interface PersonaPreset {
  id: string;
  name: string;
  summary: string;
  voiceName: GeminiVoiceName;
  systemInstruction: string;
}

export interface ArchitectureLayer {
  id: string;
  index: string;
  name: string;
  role: string;
  latencyTarget: string;
  summary: string;
  cloudStack: string[];
  localStack: string[];
  failureModes: string[];
  dataContract: string;
  codeSnippet: string;
}

export interface BuildStep {
  id: string;
  title: string;
  detail: string;
}

export interface BuildPhase {
  id: string;
  index: string;
  title: string;
  estimatedTime: string;
  objective: string;
  steps: BuildStep[];
  verificationCheck: string;
  sandboxPrompt: string;
}

export interface AssistantSessionSnapshot {
  schemaVersion: 1;
  exportedAt: string;
  messages: AssistantMessage[];
  config: AssistantConfig;
  state: AssistantState;
}

export interface PendingConfirmationAction {
  id: string;
  toolName: string;
  title: string;
  description: string;
  target: string;
  actionType:
    | 'clear_all_memories'
    | 'create_local_folder'
    | 'organize_local_file'
    | 'capture_screenshot'
    | 'companion_launch_app'
    | 'companion_close_app'
    | 'companion_system_setting'
    | 'companion_media_control'
    | 'companion_write_file'
    | 'companion_read_file'
    | 'companion_run_command'
    | 'companion_window_control'
    | 'companion_mouse_action'
    | 'companion_keyboard_action'
    | 'companion_file_organize'
    | 'companion_lock_system'
    | 'companion_clipboard_write'
    | 'companion_project_write'
    | 'companion_project_delete'
    | 'companion_project_test'
    | 'companion_install_deps'
    | 'workspace_send_email'
    | 'workspace_edit_calendar'
    | 'place_outgoing_call'
    | 'open_custom_url';
  args: Record<string, unknown>;
  riskLevel: 'medium' | 'high';
  callId?: string;
}

export interface SystemTelemetry {
  online: boolean;
  micPermission: 'granted' | 'prompt' | 'denied' | 'unknown';
  batteryLevel?: number;
  batteryCharging?: boolean;
  storageUsedMb?: number;
  storageQuotaMb?: number;
  hardwareThreads?: number;
  companionConnected: boolean;
  companionEndpoint: string;
  pythonAgentConnected?: boolean;
  haBaseUrl?: string;
  haConnected?: boolean;
  haEntityCount?: number;
  crossOriginIsolated: boolean;
  activeWakeEngineLabel: string;
}

export interface AiModeSpec {
  id: AiMode;
  label: string;
  summary: string;
  liveModel: string;
  restModel: string;
  thinkingLabel: string;
}

export const AI_MODE_SPECS: Record<AiMode, AiModeSpec> = {
  FAST: {
    id: 'FAST',
    label: 'FAST',
    summary: 'Lowest latency for rapid commands, app launches, and short answers.',
    liveModel: 'gemini-3.8-live',
    restModel: 'gemini-4-hydrogen',
    thinkingLabel: 'LOW / Instant',
  },
  STANDARD: {
    id: 'STANDARD',
    label: 'STANDARD',
    summary: 'Balanced everyday voice conversation with multi-tool reasoning.',
    liveModel: 'gemini-3.8-live-extended-thinking',
    restModel: 'gemini-4-hydrogen',
    thinkingLabel: 'MEDIUM',
  },
  PRO: {
    id: 'PRO',
    label: 'PRO',
    summary: 'High-depth reasoning for research synthesis, coding, and planning.',
    liveModel: 'gemini-3.8-live-extended-thinking',
    restModel: 'gemini-4-hydrogen',
    thinkingLabel: 'HIGH',
  },
  EXPERT: {
    id: 'EXPERT',
    label: 'EXPERT',
    summary: 'Maximum reasoning depth with structured verification and multi-step workflows.',
    liveModel: 'gemini-3.8-live-extended-thinking',
    restModel: 'gemini-4-hydrogen',
    thinkingLabel: 'HIGH (Live) / XHIGH (Brain)',
  },
};

export interface SkillDefinition {
  id: string;
  userId?: string;
  name: string;
  description: string;
  category: 'automation' | 'coding' | 'creative' | 'personal' | 'pc_control';
  triggerPattern: string;
  instructions: string;
  enabled: boolean;
  activeVersion: number;
  testStatus: 'untested' | 'passed' | 'failed';
  lastTestNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillVersionEntry {
  id: string;
  userId?: string;
  skillId: string;
  version: number;
  instructions: string;
  triggerPattern: string;
  changelog: string;
  createdAt: string;
}

export interface ProjectEntry {
  id: string;
  userId?: string;
  name: string;
  rootPath: string;
  language: 'typescript' | 'javascript' | 'python' | 'java' | 'cpp' | 'web' | 'android' | 'other';
  framework: string;
  status: 'active' | 'archived';
  lastTestStatus: 'unknown' | 'passed' | 'failed';
  lastTestSummary?: string;
  snapshotCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBackupSnapshot {
  snapshotId: string;
  projectRoot: string;
  reason: string;
  files: string[];
  createdAt: string;
}

export interface BugFixPatchProposal {
  filePath: string;
  summary: string;
  originalSnippet?: string;
  updatedContent: string;
}

export interface BugFixReport {
  id: string;
  userId?: string;
  projectId: string;
  title: string;
  errorInput: string;
  rootCause: string;
  status: 'diagnosed' | 'patched' | 'verified' | 'failed' | 'rolled_back';
  verificationSummary: string;
  regressionRisk: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
}

export type AgentRoleId = 'planner' | 'coder' | 'debugger' | 'designer' | 'researcher';

export interface MultiAgentStep {
  index: number;
  role: AgentRoleId;
  action: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  outputSummary?: string;
}

export interface MultiAgentRun {
  id: string;
  userId?: string;
  goal: string;
  status: 'planning' | 'running' | 'completed' | 'failed';
  activeRole: AgentRoleId;
  stepCount: number;
  summary: string;
  steps?: MultiAgentStep[];
  createdAt: string;
  updatedAt: string;
}

export interface CreativeAssetEntry {
  id: string;
  userId?: string;
  dimension: '3d' | '2d' | '1d';
  title: string;
  category: string;
  exportFormat: 'glb' | 'gltf' | 'obj' | 'png' | 'svg' | 'json' | 'csv';
  specJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactEntry {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  email?: string;
  relation?: string;
  aliases?: string;
  consentToCall: boolean;
  vip: boolean;
  source: 'local' | 'google_contacts';
  createdAt: string;
  updatedAt: string;
}

export interface CallLogEntry {
  id: string;
  userId?: string;
  contactName: string;
  phone: string;
  direction: 'outgoing' | 'incoming';
  method: 'phone_link' | 'tel_uri' | 'incoming_webhook' | 'manual';
  status: 'initiated' | 'answered' | 'declined' | 'busy_replied' | 'missed';
  note?: string;
  createdAt: string;
}

export interface AutomationWorkflow {
  id: string;
  userId?: string;
  name: string;
  triggerType: 'voice_phrase' | 'schedule' | 'monitor_update' | 'incoming_call' | 'manual';
  triggerValue: string;
  actionType: 'run_skill' | 'speak_alert' | 'companion_action' | 'open_studio' | 'create_task';
  actionPayload: string;
  enabled: boolean;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceEmailSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
}

export interface WorkspaceCalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  htmlLink?: string;
}


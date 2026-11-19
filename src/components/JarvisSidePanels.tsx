import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlarmClock,
  BatteryCharging,
  Bell,
  BellRing,
  Box,
  Camera,
  Check,
  Cloud,
  CloudOff,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FolderOpen,
  History,
  KeyRound,
  LogIn,
  LogOut,
  Mic,
  Monitor,
  Pause,
  PhoneIncoming,
  Play,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {
  AI_MODE_SPECS,
  type AiMode,
  type AssistantConfig,
  type AssistantState,
  type CallHandlingMode,
  type CoreVisualQuality,
  type DesktopAwarenessState,
  type ExecutionLogEntry,
  type GeminiQuotaStatus,
  type GeminiVoiceName,
  type MemoryCategory,
  type MemoryFact,
  type MonitorTopic,
  type MonitorUpdateItem,
  type PendingMemoryProposal,
  type ScheduleKind,
  type ScheduleRecurrence,
  type ScheduledItem,
  type SystemTelemetry,
  type TaskPriority,
  type VoiceLanguageCode,
  type WakeEnginePreference,
} from '../types/assistant';
import { AGENT_VOICE_PROFILES, PERSONA_PRESETS } from '../data/blueprintData';
import type { LocalFileEntry } from '../utils/computerControl';
import { parseNaturalTimeExpression } from '../utils/commandParsers';
import {
  listAudioInputDevices,
  type AudioInputDeviceOption,
} from '../utils/wakeEngine';
import { KnowledgeVaultDrawer } from './KnowledgeVaultDrawer';
import {
  HomeAssistantControlCard,
  PcVisionAuditCard,
} from './UniversalIntelligenceCards';
import type {
  AgenticStepItem,
  ConnectedIntegrationItem,
  HardwareTelemetry,
  HomeAssistantEntity,
  KnowledgeChunkItem,
  KnowledgeDocItem,
  ScreenOcrSnapshot,
  VoiceMood,
} from '../types/assistant';

export type LeftPanelTab =
  | 'tasks'
  | 'alarms'
  | 'monitors'
  | 'memory'
  | 'history'
  | 'knowledge'
  | 'smarthome';
export type RightPanelTab = 'system' | 'pcvision' | 'settings';

interface JarvisSidePanelsProps {
  side: 'left' | 'right';
  activeLeftTab: LeftPanelTab;
  activeRightTab: RightPanelTab;
  onSelectLeftTab: (tab: LeftPanelTab) => void;
  onSelectRightTab: (tab: RightPanelTab) => void;
  onClosePanel: () => void;

  // Auth & Cloud
  user: User | null;
  authLoading: boolean;
  cloudError: string | null;
  onSignIn: () => void;
  onSignOut: () => void;

  // Core state & config
  state: AssistantState;
  config: AssistantConfig;
  onUpdateConfig: React.Dispatch<React.SetStateAction<AssistantConfig>>;
  onOpenBackupModal: () => void;

  // Tasks
  onAddTask: (title: string, priority: TaskPriority, dueLabel?: string) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;

  // Persistent Alarms, Reminders & Verified Logs
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
  onClearExecutionLogs: () => void;

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

  // Desktop Awareness & Calls
  desktopContext: DesktopAwarenessState;
  onToggleDesktopAwareness: (enabled: boolean) => void;
  onTriggerLocalIncomingCall: (callerName: string) => void;

  // Memories
  pendingProposals: PendingMemoryProposal[];
  lastMemoriesUsed: string[];
  onApproveProposal: (proposalId: string) => void;
  onDismissProposal: (proposalId: string) => void;
  onAddOrUpdateMemory: (fact: {
    id?: string;
    key: string;
    value: string;
    category: MemoryCategory;
  }) => void;
  onDeleteMemory: (memoryId: string) => void;
  onRequestClearAllMemories: () => void;

  // History
  onRerunHistoryQuery: (query: string) => void;
  onDeleteHistoryItem: (historyId: string) => void;

  // Environment controls
  onUpdateEnvironment: (patch: Partial<AssistantState['environment']>) => void;

  // Computer Control & Telemetry
  telemetry: SystemTelemetry;
  micPrivacyStatus: string;
  voiceStatusDetail?: string;
  isLiveConnected: boolean;
  onTestAgentVoice: () => void;
  isTestingVoice?: boolean;
  selectedFolderName: string | null;
  folderEntries: LocalFileEntry[];
  onRequestScreenshot: () => void;
  onOpenLocalFile: () => void;
  onSelectLocalFolder: () => void;
  onRequestCreateFolder: (folderName: string) => void;
  onConnectCompanion: () => void;
  onDisconnectCompanion: () => void;
  onDownloadCompanionScript: () => void;

  // Knowledge Vault (RAG)
  knowledgeDocs: KnowledgeDocItem[];
  knowledgeChunks: KnowledgeChunkItem[];
  knowledgeUploading: boolean;
  knowledgeError: string | null;
  onUploadKnowledgeFile: (file: File) => Promise<void>;
  onToggleKnowledgeDoc: (docId: string, enabled: boolean) => Promise<void>;
  onDeleteKnowledgeDoc: (docId: string) => Promise<void>;

  // Home Assistant Smart Home
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

  // PC Vision & Hardware Telemetry
  pcHardwareTelemetry: HardwareTelemetry | null;
  screenOcrSnapshot: ScreenOcrSnapshot | null;
  agenticSteps: AgenticStepItem[];
  onCaptureScreenOcr: () => void;
  onRunQuickPcAction: (command: string) => void;
}

const MEMORY_CATEGORIES: Array<{ value: MemoryCategory; label: string }> = [
  { value: 'preference', label: 'Preference' },
  { value: 'note', label: 'Personal Note' },
  { value: 'project', label: 'Project' },
  { value: 'command', label: 'Frequent Command' },
  { value: 'assistant_preference', label: 'Assistant Pref' },
  { value: 'summary', label: 'Summary' },
  { value: 'knowledge', label: 'Saved Knowledge' },
  { value: 'task_context', label: 'Task Context' },
];

const VOICES: GeminiVoiceName[] = ['Charon', 'Fenrir', 'Kore', 'Puck', 'Zephyr'];

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const JarvisSidePanels: React.FC<JarvisSidePanelsProps> = ({
  side,
  activeLeftTab,
  activeRightTab,
  onSelectLeftTab,
  onSelectRightTab,
  onClosePanel,
  user,
  authLoading,
  cloudError,
  onSignIn,
  onSignOut,
  state,
  config,
  onUpdateConfig,
  onOpenBackupModal,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  schedules,
  executionLogs,
  quotaStatus,
  notificationPermission,
  onRequestNotificationPermission,
  onCreateSchedule,
  onUpdateSchedule,
  onDeleteSchedule,
  onClearExecutionLogs,
  monitorTopics,
  monitorUpdates,
  onCreateMonitor,
  onUpdateMonitor,
  onDeleteMonitor,
  onCheckMonitorNow,
  onPauseAllMonitors,
  onResumeAllMonitors,
  desktopContext,
  onToggleDesktopAwareness,
  onTriggerLocalIncomingCall,
  pendingProposals,
  lastMemoriesUsed,
  onApproveProposal,
  onDismissProposal,
  onAddOrUpdateMemory,
  onDeleteMemory,
  onRequestClearAllMemories,
  onRerunHistoryQuery,
  onDeleteHistoryItem,
  onUpdateEnvironment,
  telemetry,
  micPrivacyStatus,
  voiceStatusDetail,
  isLiveConnected,
  onTestAgentVoice,
  isTestingVoice,
  selectedFolderName,
  folderEntries,
  onRequestScreenshot,
  onOpenLocalFile,
  onSelectLocalFolder,
  onRequestCreateFolder,
  onConnectCompanion,
  onDisconnectCompanion,
  onDownloadCompanionScript,
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
  pcHardwareTelemetry,
  screenOcrSnapshot,
  agenticSteps,
  onCaptureScreenOcr,
  onRunQuickPcAction,
}) => {
  // Tasks local form
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium');
  const [taskFilter, setTaskFilter] = useState<'all' | 'open' | 'done'>('all');

  // Alarms & Reminders local form
  const [schedKind, setSchedKind] = useState<ScheduleKind>('reminder');
  const [schedTitle, setSchedTitle] = useState('');
  const [schedWhen, setSchedWhen] = useState('in 2 minutes');
  const [schedError, setSchedError] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editSchedTitle, setEditSchedTitle] = useState('');
  const [editSchedWhen, setEditSchedWhen] = useState('');

  // Monitoring local form
  const [newMonitorQuery, setNewMonitorQuery] = useState('');
  const [newMonitorOfficialOnly, setNewMonitorOfficialOnly] = useState(false);
  const [newMonitorInterval, setNewMonitorInterval] = useState(60);
  const [checkingMonitorId, setCheckingMonitorId] = useState<string | null>(null);
  const [addingMonitor, setAddingMonitor] = useState(false);

  // Test call caller input
  const [testCallerInput, setTestCallerInput] = useState('Mom');

  // Memory local state
  const [memorySearch, setMemorySearch] = useState('');
  const [newMemKey, setNewMemKey] = useState('');
  const [newMemValue, setNewMemValue] = useState('');
  const [newMemCategory, setNewMemCategory] = useState<MemoryCategory>('preference');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editMemKey, setEditMemKey] = useState('');
  const [editMemValue, setEditMemValue] = useState('');
  const [editMemCategory, setEditMemCategory] = useState<MemoryCategory>('preference');

  // History search
  const [historySearch, setHistorySearch] = useState('');

  // Folder create input
  const [newFolderName, setNewFolderName] = useState('');

  // Audio input devices
  const [micDevices, setMicDevices] = useState<AudioInputDeviceOption[]>([]);
  useEffect(() => {
    let active = true;
    void listAudioInputDevices().then((devs) => {
      if (active) setMicDevices(devs);
    });
    return () => {
      active = false;
    };
  }, [activeRightTab]);

  const filteredTasks = useMemo(() => {
    return state.tasks.filter((t) => {
      if (taskFilter === 'open') return !t.completed;
      if (taskFilter === 'done') return t.completed;
      return true;
    });
  }, [state.tasks, taskFilter]);

  const filteredMemories = useMemo(() => {
    const q = memorySearch.trim().toLowerCase();
    return state.memory.filter((m) => {
      if (!q) return true;
      return (
        m.key.toLowerCase().includes(q) ||
        m.value.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
      );
    });
  }, [state.memory, memorySearch]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return state.searchHistory.filter((h) => {
      if (!q) return true;
      return (
        h.query.toLowerCase().includes(q) ||
        (h.responsePreview || '').toLowerCase().includes(q)
      );
    });
  }, [state.searchHistory, historySearch]);

  const startEditingMemory = (mem: MemoryFact) => {
    setEditingMemoryId(mem.id);
    setEditMemKey(mem.key);
    setEditMemValue(mem.value);
    setEditMemCategory(mem.category);
  };

  if (side === 'left') {
    return (
      <aside
        aria-label="Personal Workspace Panels"
        className="w-full lg:w-[340px] shrink-0 bg-[#08101e]/85 backdrop-blur-xl border border-cyan-500/20 rounded-2xl flex flex-col max-h-[420px] lg:max-h-[680px] overflow-hidden text-slate-100"
      >
        <div className="px-3 py-3 border-b border-cyan-500/15 flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 p-1 bg-slate-900/90 rounded-lg overflow-x-auto">
            {(
              [
                { id: 'tasks', label: 'Tasks' },
                { id: 'alarms', label: 'Alarms' },
                { id: 'monitors', label: 'Monitors' },
                { id: 'knowledge', label: 'Knowledge' },
                { id: 'smarthome', label: 'Smart Home' },
                { id: 'memory', label: 'Memory' },
                { id: 'history', label: 'History' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectLeftTab(tab.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  activeLeftTab === tab.id
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClosePanel}
            aria-label="Collapse left panel"
            className="p-1.5 text-slate-400 hover:text-white rounded-md shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeLeftTab === 'tasks' && (
            <>
              {state.timers.length > 0 && (
                <div className="space-y-2 pb-3 border-b border-slate-800/80">
                  <div className="text-xs font-semibold text-cyan-300">
                    Active Timers
                  </div>
                  {state.timers.map((timer) => (
                    <div
                      key={timer.id}
                      className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-900/70 border border-slate-800"
                    >
                      <span className="truncate text-slate-200">{timer.label}</span>
                      <span className="font-mono tabular-nums text-cyan-300 shrink-0">
                        {formatCountdown(timer.remainingSeconds)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTaskTitle.trim()) return;
                  onAddTask(newTaskTitle.trim(), newTaskPriority);
                  setNewTaskTitle('');
                }}
                className="space-y-2"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Add a personal task..."
                    className="flex-1 min-w-0 bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    aria-label="Add task"
                    className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <select
                    aria-label="Task priority"
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                    className="bg-slate-900 border border-slate-700/80 rounded-md px-2 py-1 text-slate-200"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                  </select>
                  <div className="flex items-center gap-2">
                    {(['all', 'open', 'done'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setTaskFilter(f)}
                        className={`capitalize ${
                          taskFilter === f
                            ? 'text-cyan-300 font-semibold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </form>

              <div className="space-y-2">
                {filteredTasks.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    No tasks match this filter. Ask Jarvis to create one by voice.
                  </p>
                ) : (
                  filteredTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between gap-2.5 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleTask(task.id)}
                        className="flex items-start gap-2.5 text-left min-w-0 flex-1"
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            task.completed
                              ? 'bg-cyan-500 border-cyan-500 text-slate-950'
                              : 'border-slate-600'
                          }`}
                        >
                          {task.completed && <Check className="w-3 h-3" />}
                        </span>
                        <div className="min-w-0">
                          <div
                            className={`text-xs leading-snug ${
                              task.completed
                                ? 'line-through text-slate-500'
                                : 'text-slate-100'
                            }`}
                          >
                            {task.title}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            <span className="capitalize">{task.priority}</span>
                            {task.dueLabel ? ` · ${task.dueLabel}` : ''}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTask(task.id)}
                        aria-label={`Delete task ${task.title}`}
                        className="p-1 text-slate-500 hover:text-rose-400 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {activeLeftTab === 'alarms' && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSchedError(null);
                  const parsed = parseNaturalTimeExpression(schedWhen);
                  if (!parsed) {
                    setSchedError(
                      'Enter a time like "7 AM", "in 2 minutes", or "tomorrow 9 AM".'
                    );
                    return;
                  }
                  const cleanTitle =
                    schedTitle.trim() ||
                    (schedKind === 'alarm'
                      ? 'Wake Alarm'
                      : schedKind === 'timer'
                      ? 'Focus Timer'
                      : 'Reminder');
                  void onCreateSchedule({
                    kind: schedKind,
                    title: cleanTitle,
                    triggerAt: parsed.triggerAt.toISOString(),
                    durationSeconds: parsed.durationSeconds,
                    recurrence: parsed.recurrence,
                  }).then((created) => {
                    if (created?.duplicate) {
                      setSchedError('Duplicate active schedule avoided.');
                    } else {
                      setSchedTitle('');
                    }
                  });
                }}
                className="space-y-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800"
              >
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-cyan-300">
                  <span className="inline-flex items-center gap-1.5">
                    <AlarmClock className="w-3.5 h-3.5" />
                    <span>Persistent Alarms & Reminders</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    aria-label="Schedule type"
                    value={schedKind}
                    onChange={(e) => setSchedKind(e.target.value as ScheduleKind)}
                    className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-100"
                  >
                    <option value="reminder">Reminder</option>
                    <option value="alarm">Alarm</option>
                    <option value="timer">Timer</option>
                  </select>
                  <input
                    type="text"
                    value={schedWhen}
                    onChange={(e) => setSchedWhen(e.target.value)}
                    placeholder="7 AM / in 2m"
                    className="bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                  />
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={schedTitle}
                    onChange={(e) => setSchedTitle(e.target.value)}
                    placeholder="Title (e.g. Call friend)..."
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-xs font-medium whitespace-nowrap shrink-0"
                  >
                    Schedule
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {[
                    { label: '+2m', val: 'in 2 minutes', kind: 'reminder' as const },
                    { label: '+10m', val: 'in 10 minutes', kind: 'timer' as const },
                    { label: '7:00 AM', val: '7:00 AM', kind: 'alarm' as const },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setSchedKind(preset.kind);
                        setSchedWhen(preset.val);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/70"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {schedError && (
                  <p className="text-[11px] text-amber-300">{schedError}</p>
                )}
              </form>

              <div className="space-y-2">
                {schedules.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">
                    No persistent alarms or reminders yet. Say &ldquo;August, remind me after 2 minutes&rdquo;.
                  </p>
                ) : (
                  schedules.map((item) => {
                    const displayDate = new Date(item.snoozedUntil || item.triggerAt);
                    const timeStr = Number.isNaN(displayDate.getTime())
                      ? item.triggerAt
                      : displayDate.toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        });
                    const isActive =
                      item.status === 'scheduled' || item.status === 'snoozed';

                    if (editingScheduleId === item.id) {
                      return (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-lg bg-slate-900 border border-cyan-500/40 space-y-2"
                        >
                          <input
                            type="text"
                            value={editSchedTitle}
                            onChange={(e) => setEditSchedTitle(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                          />
                          <input
                            type="text"
                            value={editSchedWhen}
                            onChange={(e) => setEditSchedWhen(e.target.value)}
                            placeholder="e.g. 7:30 AM or in 5 minutes"
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const parsed = editSchedWhen.trim()
                                  ? parseNaturalTimeExpression(editSchedWhen)
                                  : null;
                                void onUpdateSchedule(item.id, {
                                  title: editSchedTitle.trim() || item.title,
                                  triggerAt: parsed
                                    ? parsed.triggerAt.toISOString()
                                    : undefined,
                                  status: 'scheduled',
                                });
                                setEditingScheduleId(null);
                              }}
                              className="px-2.5 py-1 bg-cyan-600 text-white rounded text-xs font-medium"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingScheduleId(null)}
                              className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-100 truncate">
                              {item.title}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                              <span className="capitalize text-cyan-300">{item.kind}</span>
                              <span aria-hidden="true"> · </span>
                              <span>{timeStr}</span>
                              <span aria-hidden="true"> · </span>
                              <span
                                className={
                                  isActive
                                    ? 'text-emerald-300'
                                    : item.status === 'triggered'
                                    ? 'text-cyan-200'
                                    : 'text-slate-500'
                                }
                              >
                                {item.status}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingScheduleId(item.id);
                                setEditSchedTitle(item.title);
                                setEditSchedWhen('');
                              }}
                              aria-label={`Edit schedule ${item.title}`}
                              className="p-1 text-slate-400 hover:text-cyan-300"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDeleteSchedule(item.id)}
                              aria-label={`Delete schedule ${item.title}`}
                              className="p-1 text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {isActive && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {item.kind === 'timer' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void onUpdateSchedule(item.id, {
                                      paused: !item.paused,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700"
                                >
                                  {item.paused ? (
                                    <>
                                      <Play className="w-3 h-3" />
                                      <span>Resume</span>
                                    </>
                                  ) : (
                                    <>
                                      <Pause className="w-3 h-3" />
                                      <span>Pause</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void onUpdateSchedule(item.id, { restart: true })
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-slate-700"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Restart</span>
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                void onUpdateSchedule(item.id, { snoozeMinutes: 5 })
                              }
                              className="px-2 py-0.5 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-slate-700"
                            >
                              Snooze +5m
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void onUpdateSchedule(item.id, { status: 'cancelled' })
                              }
                              className="px-2 py-0.5 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Verified Execution Logs */}
              <div className="pt-3 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-cyan-300">
                    Action Execution Logs
                  </span>
                  {executionLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearExecutionLogs}
                      className="text-[11px] text-slate-400 hover:text-rose-300"
                    >
                      Clear Logs
                    </button>
                  )}
                </div>

                {executionLogs.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    Verified tool & local executions will be recorded here.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {executionLogs.slice(0, 14).map((log) => (
                      <div
                        key={log.id}
                        className="p-2 rounded-lg bg-slate-900/50 border border-slate-800/80 space-y-0.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                          <span
                            className={
                              log.status === 'FAILED'
                                ? 'text-rose-300 font-semibold'
                                : log.status === 'EXECUTING'
                                ? 'text-amber-300 font-semibold'
                                : log.status === 'SCHEDULED'
                                ? 'text-cyan-300 font-semibold'
                                : 'text-emerald-300 font-semibold'
                            }
                          >
                            {log.status}
                          </span>
                          <span className="text-slate-500 truncate">
                            {log.source} · {log.verified ? 'Verified' : 'Unverified'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-200 truncate">
                          {log.command}
                        </div>
                        <div className="text-[11px] text-slate-400 line-clamp-2">
                          {log.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeLeftTab === 'monitors' && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = newMonitorQuery.trim();
                  if (!q || addingMonitor) return;
                  setAddingMonitor(true);
                  void onCreateMonitor({
                    query: q,
                    officialOnly: newMonitorOfficialOnly,
                    intervalMinutes: newMonitorInterval,
                  }).finally(() => {
                    setAddingMonitor(false);
                    setNewMonitorQuery('');
                  });
                }}
                className="space-y-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800"
              >
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-cyan-300">
                  <span className="inline-flex items-center gap-1.5">
                    <Radar className="w-3.5 h-3.5" />
                    <span>Proactive Topic Watchlist</span>
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] font-normal">
                    <button
                      type="button"
                      onClick={() => void onPauseAllMonitors()}
                      className="text-slate-400 hover:text-amber-300"
                    >
                      Pause All
                    </button>
                    <span className="text-slate-600">·</span>
                    <button
                      type="button"
                      onClick={() => void onResumeAllMonitors()}
                      className="text-slate-400 hover:text-cyan-300"
                    >
                      Resume
                    </button>
                  </div>
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newMonitorQuery}
                    onChange={(e) => setNewMonitorQuery(e.target.value)}
                    placeholder="e.g. GTA 6, Marvel, Minecraft..."
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    disabled={addingMonitor}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-xs font-medium whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {addingMonitor ? 'Adding...' : 'Watch'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newMonitorOfficialOnly}
                      onChange={(e) => setNewMonitorOfficialOnly(e.target.checked)}
                      className="accent-cyan-400"
                    />
                    <span>Official announcements only</span>
                  </label>
                  <select
                    aria-label="Monitor check interval"
                    value={newMonitorInterval}
                    onChange={(e) => setNewMonitorInterval(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-200"
                  >
                    <option value={15}>Every 15m</option>
                    <option value={30}>Every 30m</option>
                    <option value={60}>Every 1h</option>
                    <option value={360}>Every 6h</option>
                  </select>
                </div>
              </form>

              <div className="space-y-2">
                {monitorTopics.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    No active topic monitors. Say &ldquo;August, monitor GTA 6 updates&rdquo; or add a topic above.
                  </p>
                ) : (
                  monitorTopics.map((topic) => (
                    <div
                      key={topic.id}
                      className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-100 truncate">
                            {topic.label}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            <span
                              className={
                                topic.status === 'active'
                                  ? 'text-emerald-300'
                                  : 'text-amber-300'
                              }
                            >
                              {topic.status.toUpperCase()}
                            </span>
                            <span aria-hidden="true"> · </span>
                            <span>{topic.officialOnly ? 'Official Only' : 'All Sources'}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{topic.intervalMinutes}m</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={checkingMonitorId === topic.id}
                            onClick={() => {
                              setCheckingMonitorId(topic.id);
                              void onCheckMonitorNow(topic.id).finally(() =>
                                setCheckingMonitorId(null)
                              );
                            }}
                            aria-label={`Check ${topic.label} now`}
                            className="p-1 text-slate-400 hover:text-cyan-300 disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${
                                checkingMonitorId === topic.id ? 'animate-spin' : ''
                              }`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void onUpdateMonitor(topic.id, {
                                status: topic.status === 'active' ? 'paused' : 'active',
                              })
                            }
                            aria-label={
                              topic.status === 'active'
                                ? `Pause ${topic.label}`
                                : `Resume ${topic.label}`
                            }
                            className="p-1 text-slate-400 hover:text-amber-300"
                          >
                            {topic.status === 'active' ? (
                              <Pause className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteMonitor(topic.id)}
                            aria-label={`Delete monitor ${topic.label}`}
                            className="p-1 text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {topic.lastStatus === 'error' && topic.lastError && (
                        <div className="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-500/25 rounded px-2 py-1">
                          Check failed: {topic.lastError}
                        </div>
                      )}

                      {topic.latestUpdate && (
                        <div className="p-2 rounded bg-slate-950/70 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                            <span
                              className={
                                topic.latestUpdate.verification === 'confirmed'
                                  ? 'text-emerald-300 font-semibold'
                                  : 'text-amber-300 font-semibold'
                              }
                            >
                              {topic.latestUpdate.verification === 'confirmed'
                                ? 'CONFIRMED OFFICIAL'
                                : 'RUMOR / REPORT'}
                            </span>
                            <span className="text-slate-500 truncate">
                              {topic.latestUpdate.sourceName}
                            </span>
                          </div>
                          <div className="text-xs text-slate-200 leading-snug">
                            {topic.latestUpdate.headline}
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                            <span>
                              {new Date(topic.latestUpdate.publishedAt).toLocaleDateString()}
                            </span>
                            {topic.latestUpdate.sourceUrl && (
                              <a
                                href={topic.latestUpdate.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
                              >
                                <span>Source</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {monitorUpdates.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <div className="text-xs font-semibold text-cyan-300">
                    Recent Discovered Updates
                  </div>
                  {monitorUpdates.slice(0, 6).map((u) => (
                    <a
                      key={u.id}
                      href={u.sourceUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-2 rounded-lg bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80 space-y-0.5"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-cyan-300">{u.topicTitle}</span>
                        <span
                          className={
                            u.verification === 'confirmed'
                              ? 'text-emerald-300'
                              : 'text-amber-300'
                          }
                        >
                          {u.verification === 'confirmed' ? 'Official' : 'Rumor'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-200 line-clamp-2">{u.headline}</div>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}

          {activeLeftTab === 'memory' && (
            <>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    Personal Memory Vault
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {config.memoryEnabled
                      ? `${state.memory.length} approved entries`
                      : 'Memory retrieval paused'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      memoryEnabled: !prev.memoryEnabled,
                    }))
                  }
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 ${
                    config.memoryEnabled
                      ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {config.memoryEnabled ? 'Memory On' : 'Memory Off'}
                </button>
              </div>

              {pendingProposals.length > 0 && (
                <div className="space-y-2 p-3 rounded-xl bg-cyan-950/40 border border-cyan-400/35">
                  <div className="text-xs font-semibold text-cyan-200">
                    Pending Memory Approval
                  </div>
                  {pendingProposals.map((prop) => (
                    <div key={prop.id} className="space-y-2 text-xs">
                      <div className="text-slate-200">
                        <span className="font-mono text-cyan-300">{prop.key}</span>:{' '}
                        {prop.value}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Category: {prop.category}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onApproveProposal(prop.id)}
                          className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-xs font-medium whitespace-nowrap"
                        >
                          Approve & Save
                        </button>
                        <button
                          type="button"
                          onClick={() => onDismissProposal(prop.id)}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-medium whitespace-nowrap"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={memorySearch}
                  onChange={(e) => setMemorySearch(e.target.value)}
                  placeholder="Search memories..."
                  className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newMemKey.trim() || !newMemValue.trim()) return;
                  onAddOrUpdateMemory({
                    key: newMemKey.trim(),
                    value: newMemValue.trim(),
                    category: newMemCategory,
                  });
                  setNewMemKey('');
                  setNewMemValue('');
                }}
                className="space-y-2 p-2.5 rounded-lg bg-slate-900/50 border border-slate-800"
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newMemKey}
                    onChange={(e) => setNewMemKey(e.target.value)}
                    placeholder="Key (e.g. editor)"
                    className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                  />
                  <select
                    aria-label="Memory category"
                    value={newMemCategory}
                    onChange={(e) => setNewMemCategory(e.target.value as MemoryCategory)}
                    className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-200"
                  >
                    {MEMORY_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMemValue}
                    onChange={(e) => setNewMemValue(e.target.value)}
                    placeholder="Value to remember..."
                    className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-xs font-medium whitespace-nowrap shrink-0"
                  >
                    Save
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                {filteredMemories.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">
                    No saved memories match this search.
                  </p>
                ) : (
                  filteredMemories.map((mem) => {
                    const wasUsed = lastMemoriesUsed.includes(mem.key);
                    if (editingMemoryId === mem.id) {
                      return (
                        <div
                          key={mem.id}
                          className="p-2.5 rounded-lg bg-slate-900 border border-cyan-500/40 space-y-2"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={editMemKey}
                              onChange={(e) => setEditMemKey(e.target.value)}
                              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                            />
                            <select
                              value={editMemCategory}
                              onChange={(e) =>
                                setEditMemCategory(e.target.value as MemoryCategory)
                              }
                              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                            >
                              {MEMORY_CATEGORIES.map((cat) => (
                                <option key={cat.value} value={cat.value}>
                                  {cat.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <input
                            type="text"
                            value={editMemValue}
                            onChange={(e) => setEditMemValue(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onAddOrUpdateMemory({
                                  id: mem.id,
                                  key: editMemKey.trim(),
                                  value: editMemValue.trim(),
                                  category: editMemCategory,
                                });
                                setEditingMemoryId(null);
                              }}
                              className="px-2.5 py-1 bg-cyan-600 text-white rounded text-xs font-medium"
                            >
                              Update
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingMemoryId(null)}
                              className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={mem.id}
                        className={`p-2.5 rounded-lg border ${
                          wasUsed
                            ? 'bg-cyan-950/30 border-cyan-500/40'
                            : 'bg-slate-900/60 border-slate-800/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-mono text-cyan-300 truncate">
                              {mem.key}
                            </div>
                            <div className="text-xs text-slate-200 mt-0.5 break-words">
                              {mem.value}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1">
                              <span>{mem.category}</span>
                              {wasUsed && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span className="text-cyan-300 font-medium">
                                    Used in last response
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => startEditingMemory(mem)}
                              aria-label={`Edit memory ${mem.key}`}
                              className="p-1 text-slate-400 hover:text-cyan-300"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteMemory(mem.id)}
                              aria-label={`Delete memory ${mem.key}`}
                              className="p-1 text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {state.memory.length > 0 && (
                <button
                  type="button"
                  onClick={onRequestClearAllMemories}
                  className="w-full py-2 text-xs font-medium text-rose-300 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-500/30 rounded-lg transition-colors"
                >
                  Clear All Memories
                </button>
              )}
            </>
          )}

          {activeLeftTab === 'history' && (
            <>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Filter voice & search history..."
                  className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="space-y-2">
                {filteredHistory.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    Spoken commands and web searches will appear here for instant re-run.
                  </p>
                ) : (
                  filteredHistory.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-medium text-slate-100 leading-snug">
                          {item.query}
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteHistoryItem(item.id)}
                          aria-label="Remove history entry"
                          className="p-1 text-slate-500 hover:text-rose-400 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {item.responsePreview && (
                        <p className="text-[11px] text-slate-400 line-clamp-2">
                          {item.responsePreview}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          {item.aiMode || 'STANDARD'} · {item.runCount}x
                        </span>
                        <button
                          type="button"
                          onClick={() => onRerunHistoryQuery(item.query)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 rounded-md whitespace-nowrap shrink-0"
                        >
                          <Play className="w-3 h-3" />
                          <span>Re-run</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {activeLeftTab === 'knowledge' && (
            <KnowledgeVaultDrawer
              docs={knowledgeDocs}
              chunks={knowledgeChunks}
              uploading={knowledgeUploading}
              error={knowledgeError}
              onUploadFile={onUploadKnowledgeFile}
              onToggleDoc={onToggleKnowledgeDoc}
              onDeleteDoc={onDeleteKnowledgeDoc}
            />
          )}

          {activeLeftTab === 'smarthome' && (
            <HomeAssistantControlCard
              connected={haConnected}
              baseUrl={haBaseUrl}
              entities={haEntities}
              integrationMeta={integrations.find((i) => i.provider === 'home_assistant') || null}
              busy={haBusy}
              error={haError}
              onConnect={onConnectHomeAssistant}
              onRefresh={onRefreshHomeAssistant}
              onDisconnect={onDisconnectHomeAssistant}
              onToggleEntity={onToggleHomeAssistantEntity}
            />
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="System Status and Settings Panels"
      className="w-full lg:w-[340px] shrink-0 bg-[#08101e]/85 backdrop-blur-xl border border-cyan-500/20 rounded-2xl flex flex-col max-h-[420px] lg:max-h-[680px] overflow-hidden text-slate-100"
    >
      <div className="px-3 py-3 border-b border-cyan-500/15 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1 p-1 bg-slate-900/90 rounded-lg overflow-x-auto">
          <button
            type="button"
            onClick={() => onSelectRightTab('system')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              activeRightTab === 'system'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>System</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectRightTab('pcvision')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              activeRightTab === 'pcvision'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>PC &amp; Vision</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectRightTab('settings')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              activeRightTab === 'settings'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onClosePanel}
          aria-label="Collapse right panel"
          className="p-1.5 text-slate-400 hover:text-white rounded-md focus-visible:outline-2 focus-visible:outline-cyan-400 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeRightTab === 'system' && (
          <>
            {/* Cloud Account & Firestore Isolation */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                  {user ? (
                    <Cloud className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <CloudOff className="w-4 h-4 text-slate-400" />
                  )}
                  <span>
                    {user ? 'Cloud Vault Synced' : 'Guest Local Mode'}
                  </span>
                </div>
                {!authLoading &&
                  (user ? (
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md whitespace-nowrap"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Sign Out</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md whitespace-nowrap"
                    >
                      <LogIn className="w-3 h-3" />
                      <span>Google Sign-In</span>
                    </button>
                  ))}
              </div>
              <p className="text-[11px] text-slate-400">
                {user
                  ? `Isolated to ${user.email || user.uid}`
                  : 'Sign in with Google to sync personal memories, tasks, and history in Firestore.'}
              </p>
              {cloudError && (
                <p className="text-[11px] text-rose-300 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>{cloudError}</span>
                </p>
              )}
            </div>

            {/* Privacy & Telemetry */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-cyan-300">
                Privacy & Audio Diagnostics
              </div>
              <div className="divide-y divide-slate-800/80 text-xs bg-slate-900/50 border border-slate-800 rounded-xl px-3">
                <div className="py-2 flex items-center justify-between gap-2">
                  <span className="text-slate-400">Microphone</span>
                  <span className="font-mono tabular-nums text-slate-100">
                    {micPrivacyStatus}
                  </span>
                </div>
                <div className="py-2 flex items-center justify-between gap-2">
                  <span className="text-slate-400">Voice Pipeline</span>
                  <span className="text-right text-cyan-200 truncate max-w-[180px]">
                    {voiceStatusDetail || 'Gemini Live + TTS Fallback Ready'}
                  </span>
                </div>
                <div className="py-2 flex items-center justify-between gap-2">
                  <span className="text-slate-400">Wake Engine</span>
                  <span className="text-right text-slate-200 truncate max-w-[180px]">
                    {telemetry.activeWakeEngineLabel}
                  </span>
                </div>
                <div className="py-2 flex items-center justify-between gap-2">
                  <span className="text-slate-400">Gemini API</span>
                  <span
                    className={`text-right font-mono tabular-nums ${
                      quotaStatus.limited ? 'text-amber-300' : 'text-emerald-300'
                    }`}
                  >
                    {quotaStatus.limited
                      ? `Cooldown ${quotaStatus.retryAfterSeconds}s`
                      : 'Ready'}
                  </span>
                </div>
                <div className="py-2 flex items-center justify-between gap-2">
                  <span className="text-slate-400">System Alerts</span>
                  {notificationPermission === 'granted' ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300 text-xs">
                      <BellRing className="w-3.5 h-3.5" />
                      <span>Enabled</span>
                    </span>
                  ) : notificationPermission === 'unsupported' ? (
                    <span className="text-slate-500">Unsupported</span>
                  ) : (
                    <button
                      type="button"
                      onClick={onRequestNotificationPermission}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 rounded"
                    >
                      <Bell className="w-3 h-3" />
                      <span>Enable Alerts</span>
                    </button>
                  )}
                </div>
                <div className="py-2 flex items-center justify-between gap-2">
                  <span className="text-slate-400">Battery</span>
                  <span className="font-mono tabular-nums text-slate-100 inline-flex items-center gap-1">
                    {telemetry.batteryLevel !== undefined ? (
                      <>
                        <BatteryCharging className="w-3.5 h-3.5 text-cyan-400" />
                        <span>
                          {telemetry.batteryLevel}%
                          {telemetry.batteryCharging ? ' Charging' : ''}
                        </span>
                      </>
                    ) : (
                      'Unavailable in browser'
                    )}
                  </span>
                </div>
                <div className="py-2 flex items-center justify-between gap-2">
                  <span className="text-slate-400">Browser Storage</span>
                  <span className="font-mono tabular-nums text-slate-100">
                    {telemetry.storageUsedMb !== undefined &&
                    telemetry.storageQuotaMb !== undefined
                      ? `${telemetry.storageUsedMb} / ${telemetry.storageQuotaMb} MB`
                      : 'Unavailable'}
                  </span>
                </div>
              </div>
            </div>

            {/* Computer Control Actions */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-cyan-300">
                Computer Control & Local Files
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onRequestScreenshot}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 whitespace-nowrap"
                >
                  <Camera className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Capture Screen</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenLocalFile}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 whitespace-nowrap"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Open File</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onSelectLocalFolder}
                className="w-full py-2 px-3 text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 flex items-center justify-center gap-2"
              >
                <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  {selectedFolderName
                    ? `Workspace Folder: ${selectedFolderName}`
                    : 'Grant Access to Local Folder'}
                </span>
              </button>

              {selectedFolderName && (
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newFolderName.trim()) return;
                      onRequestCreateFolder(newFolderName.trim());
                      setNewFolderName('');
                    }}
                    className="flex gap-1.5"
                  >
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="New subfolder name..."
                      className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-cyan-600 text-white rounded text-xs font-medium whitespace-nowrap"
                    >
                      Create
                    </button>
                  </form>
                  <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] font-mono text-slate-300">
                    {folderEntries.length === 0 ? (
                      <div className="text-slate-500">Folder is empty.</div>
                    ) : (
                      folderEntries.map((entry) => (
                        <div key={entry.name} className="truncate">
                          {entry.kind === 'directory' ? '[DIR]' : '[FILE]'} {entry.name}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Opt-In Desktop Awareness & Privacy Shield */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Desktop Awareness (Opt-In)</span>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleDesktopAwareness(!config.desktopAwarenessEnabled)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md border whitespace-nowrap ${
                    config.desktopAwarenessEnabled
                      ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                      : 'bg-slate-950 border-slate-700 text-slate-400'
                  }`}
                >
                  {config.desktopAwarenessEnabled ? 'Active' : 'Off (Private)'}
                </button>
              </div>
              <div className="text-[11px] text-slate-400 leading-relaxed">
                Reads active window name via Companion only when enabled. Zero hidden screenshots or keylogging.
              </div>
              {config.desktopAwarenessEnabled && (
                <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Detected Context</span>
                    <span className="font-mono text-cyan-300 uppercase">
                      {desktopContext.activity}
                    </span>
                  </div>
                  <div className="text-slate-200 truncate">
                    {desktopContext.activeApp || 'Browser'}:{' '}
                    {desktopContext.windowTitle || 'Workspace'}
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleDesktopAwareness(false)}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] text-rose-300 hover:text-rose-200"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>Privacy Kill Switch (Pause Tracking)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Smart Incoming Call Assistance */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                  <PhoneIncoming className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Incoming Call Assistant</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      callConfig: {
                        ...(prev.callConfig || {
                          enabled: true,
                          handlingMode: 'notify_wait',
                          busyMode: false,
                          busyReplyText:
                            'Hasan is busy right now and will get back to you shortly.',
                          vipContacts: [],
                          autoAnswerEnabled: false,
                        }),
                        busyMode: !prev.callConfig?.busyMode,
                      },
                    }))
                  }
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md border whitespace-nowrap ${
                    config.callConfig?.busyMode
                      ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                      : 'bg-slate-950 border-slate-700 text-slate-300'
                  }`}
                >
                  {config.callConfig?.busyMode ? 'Busy Mode On' : 'Busy Mode Off'}
                </button>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="call-handling-select"
                  className="text-[11px] text-slate-400 block"
                >
                  Call Handling Policy
                </label>
                <select
                  id="call-handling-select"
                  value={config.callConfig?.handlingMode || 'notify_wait'}
                  onChange={(e) => {
                    const mode = e.target.value as CallHandlingMode;
                    onUpdateConfig((prev) => ({
                      ...prev,
                      callConfig: {
                        ...(prev.callConfig || {
                          enabled: true,
                          handlingMode: 'notify_wait',
                          busyMode: false,
                          busyReplyText:
                            'Hasan is busy right now and will get back to you shortly.',
                          vipContacts: [],
                          autoAnswerEnabled: false,
                        }),
                        handlingMode: mode,
                        autoAnswerEnabled: mode === 'vip_auto_answer',
                      },
                    }));
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"
                >
                  <option value="notify_wait">Notify &amp; Wait (Default — Safe)</option>
                  <option value="vip_auto_answer">VIP Auto-Answer Approved Only</option>
                  <option value="ask_unknown">Ask Permission Before Action</option>
                  <option value="silent_dnd">Silent / DND (Notify Later)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="vip-contacts-input"
                  className="text-[11px] text-slate-400 block"
                >
                  VIP Callers (comma-separated)
                </label>
                <input
                  id="vip-contacts-input"
                  type="text"
                  value={(config.callConfig?.vipContacts || []).join(', ')}
                  onChange={(e) => {
                    const list = e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    onUpdateConfig((prev) => ({
                      ...prev,
                      callConfig: {
                        ...(prev.callConfig || {
                          enabled: true,
                          handlingMode: 'notify_wait',
                          busyMode: false,
                          busyReplyText:
                            'Hasan is busy right now and will get back to you shortly.',
                          vipContacts: [],
                          autoAnswerEnabled: false,
                        }),
                        vipContacts: list,
                      },
                    }));
                  }}
                  placeholder="Mom, Dad, Brother..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600"
                />
              </div>

              <div className="pt-1 flex items-center gap-1.5">
                <input
                  type="text"
                  aria-label="Test caller name"
                  value={testCallerInput}
                  onChange={(e) => setTestCallerInput(e.target.value)}
                  className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => onTriggerLocalIncomingCall(testCallerInput)}
                  className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 border border-slate-600 text-cyan-200 rounded whitespace-nowrap shrink-0"
                >
                  Test Call Bridge
                </button>
              </div>
            </div>

            {/* Desktop Companion Bridge */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-100">
                  Windows Companion &amp; Python Agent
                </div>
                <span
                  className={`text-[11px] font-mono ${
                    telemetry.companionConnected
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                  }`}
                >
                  {telemetry.companionConnected
                    ? telemetry.pythonAgentConnected
                      ? 'NODE + PYTHON'
                      : 'CONNECTED'
                    : 'OFFLINE'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Runs Node bridge (4849) + Python Windows agent (4850) for full PC mouse/keyboard, Screen OCR Vision, installed apps, window control, and Downloads organizer.
              </p>
              <div className="space-y-1">
                <label
                  htmlFor="companion-pairing-token-input"
                  className="text-[10px] uppercase tracking-wider text-slate-400 block"
                >
                  Pairing Token (~/.august-companion-token)
                </label>
                <input
                  id="companion-pairing-token-input"
                  type="password"
                  value={config.companionPairingToken || ''}
                  onChange={(e) =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      companionPairingToken: e.target.value,
                    }))
                  }
                  placeholder="Optional CSPRNG pairing token..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 placeholder:text-slate-600"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {telemetry.companionConnected ? (
                  <button
                    type="button"
                    onClick={onDisconnectCompanion}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg whitespace-nowrap"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onConnectCompanion}
                    className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg whitespace-nowrap"
                  >
                    Connect Local PC
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDownloadCompanionScript}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>jarvis-companion.mjs</span>
                </button>
                <a
                  href="/api/companion/bundle/jarvis_windows_agent.py"
                  download="jarvis_windows_agent.py"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-200 rounded-lg whitespace-nowrap"
                >
                  <Download className="w-3 h-3" />
                  <span>Python Agent</span>
                </a>
                <a
                  href="/api/companion/bundle/requirements.txt"
                  download="requirements.txt"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg whitespace-nowrap"
                >
                  <Download className="w-3 h-3" />
                  <span>requirements.txt</span>
                </a>
                <a
                  href="/api/companion/bundle/start-companion.bat"
                  download="start-companion.bat"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg whitespace-nowrap"
                >
                  <Download className="w-3 h-3" />
                  <span>start-companion.bat</span>
                </a>
              </div>
            </div>
          </>
        )}

        {activeRightTab === 'pcvision' && (
          <div className="space-y-3">
            <PcVisionAuditCard
              hardware={pcHardwareTelemetry}
              screenSnapshot={screenOcrSnapshot}
              steps={agenticSteps}
              onCaptureAndInspect={onCaptureScreenOcr}
            />
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-cyan-300">
                Quick Windows Agent Actions
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onRunQuickPcAction('list installed apps')}
                  className="px-2.5 py-1.5 text-[11px] font-medium bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-left"
                >
                  Installed Apps
                </button>
                <button
                  type="button"
                  onClick={() => onRunQuickPcAction('list open windows')}
                  className="px-2.5 py-1.5 text-[11px] font-medium bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-left"
                >
                  Running Windows
                </button>
                <button
                  type="button"
                  onClick={() => onRunQuickPcAction('organize downloads')}
                  className="px-2.5 py-1.5 text-[11px] font-medium bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-left"
                >
                  Organize Downloads
                </button>
                <button
                  type="button"
                  onClick={() => onRunQuickPcAction('find duplicate files in downloads')}
                  className="px-2.5 py-1.5 text-[11px] font-medium bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-left"
                >
                  Scan Duplicates
                </button>
              </div>
            </div>
          </div>
        )}

        {activeRightTab === 'settings' && (
          <>
            {/* Real AI Modes */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>AI Reasoning Mode</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['FAST', 'STANDARD', 'PRO', 'EXPERT'] as AiMode[]).map((mode) => {
                  const active = config.aiMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      disabled={isLiveConnected}
                      onClick={() =>
                        onUpdateConfig((prev) => ({
                          ...prev,
                          aiMode: mode,
                          thinkingLevel:
                            mode === 'FAST'
                              ? 'LOW'
                              : mode === 'STANDARD'
                              ? 'MEDIUM'
                              : 'HIGH',
                        }))
                      }
                      className={`p-2 rounded-lg border text-left transition-colors disabled:opacity-60 ${
                        active
                          ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-100'
                          : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-semibold">{mode}</div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {AI_MODE_SPECS[mode].liveModel.replace('gemini-', '')}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {AI_MODE_SPECS[config.aiMode].summary} Thinking:{' '}
                <span className="font-mono text-cyan-300">
                  {AI_MODE_SPECS[config.aiMode].thinkingLabel}
                </span>
              </p>
            </div>

            {/* Conversation Mode: Single Command vs Continuous */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-100">
                  Continuous Conversation
                </div>
                <div className="text-[11px] text-slate-400">
                  {config.continuousMode
                    ? 'Stay live across multi-turn commands'
                    : 'Auto-return to standby ~900ms after reply'}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig((prev) => ({
                    ...prev,
                    continuousMode: !prev.continuousMode,
                  }))
                }
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 ${
                  config.continuousMode
                    ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                {config.continuousMode ? 'Continuous' : 'Single Cmd'}
              </button>
            </div>

            {/* 3D Holographic Core Visual Quality */}
            <div className="space-y-2 p-3 rounded-xl bg-slate-900/70 border border-slate-800">
              <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5" />
                <span>3D Holographic Core Quality</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'low', label: 'Low' },
                    { id: 'balanced', label: 'Balanced' },
                    { id: 'high', label: 'High Bloom' },
                  ] as Array<{ id: CoreVisualQuality; label: string }>
                ).map((opt) => {
                  const active = (config.visualQuality || 'balanced') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        onUpdateConfig((prev) => ({
                          ...prev,
                          visualQuality: opt.id,
                        }))
                      }
                      className={`px-2 py-1.5 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-100'
                          : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Controls Three.js pixel ratio, particle density, and UnrealBloom post-processing.
              </p>
            </div>

            {/* Wake-Word Engine, Mic & Language Controls */}
            <div className="space-y-2.5 p-3 rounded-xl bg-slate-900/70 border border-slate-800">
              <label
                htmlFor="wake-engine-select"
                className="text-xs font-semibold text-slate-100 block"
              >
                Wake-Word Engine & Speech Recognition
              </label>
              <select
                id="wake-engine-select"
                value={config.wakeEngine}
                onChange={(e) =>
                  onUpdateConfig((prev) => ({
                    ...prev,
                    wakeEngine: e.target.value as WakeEnginePreference,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100"
              >
                <option value="auto">Auto (Porcupine if Keyed, else Browser Speech)</option>
                <option value="porcupine">Porcupine Local WASM ("Jarvis")</option>
                <option value="speech_recognition">Browser SpeechRecognition Fallback</option>
                <option value="manual">Manual Tap-to-Talk Only</option>
              </select>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label
                    htmlFor="voice-lang-select"
                    className="text-[11px] text-slate-400 block"
                  >
                    Voice Language
                  </label>
                  <select
                    id="voice-lang-select"
                    value={config.preferredLanguage || config.voiceLanguage || 'en-US'}
                    onChange={(e) => {
                      const lang = e.target.value as VoiceLanguageCode;
                      onUpdateConfig((prev) => ({
                        ...prev,
                        voiceLanguage: lang,
                        preferredLanguage: lang,
                      }));
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"
                  >
                    <option value="en-US">English (US)</option>
                    <option value="en-IN">Banglish / EN-IN</option>
                    <option value="bn-BD">Bangla (bn-BD)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Sensitivity</span>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {Math.round((config.wakeSensitivity ?? 0.6) * 100)}%
                    </span>
                  </div>
                  <input
                    aria-label="Wake sensitivity"
                    type="range"
                    min={0.2}
                    max={0.95}
                    step={0.05}
                    value={config.wakeSensitivity ?? 0.6}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        wakeSensitivity: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-cyan-400 mt-1"
                  />
                </div>
              </div>

              {micDevices.length > 0 && (
                <div className="space-y-1">
                  <label
                    htmlFor="mic-device-select"
                    className="text-[11px] text-slate-400 flex items-center gap-1"
                  >
                    <Mic className="w-3 h-3 text-cyan-400" />
                    <span>Microphone Device</span>
                  </label>
                  <select
                    id="mic-device-select"
                    value={config.preferredMicDeviceId || ''}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        preferredMicDeviceId: e.target.value || undefined,
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                  >
                    <option value="">System Default Microphone</option>
                    {micDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1 pt-1">
                <label
                  htmlFor="picovoice-key-input"
                  className="text-[11px] text-slate-300 flex items-center gap-1"
                >
                  <KeyRound className="w-3 h-3 text-cyan-400" />
                  <span>Picovoice AccessKey (Optional, Local Browser Only)</span>
                </label>
                <input
                  id="picovoice-key-input"
                  type="password"
                  value={config.picovoiceAccessKey || ''}
                  onChange={(e) =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      picovoiceAccessKey: e.target.value,
                    }))
                  }
                  placeholder="Paste Picovoice key for offline WASM wake..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600"
                />
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Without a Picovoice key, standby uses Browser SpeechRecognition when supported, or direct mic Tap-to-Talk if blocked.
                </p>
              </div>
            </div>

            {/* Agent Voice Studio */}
            <div className="space-y-3 p-3 rounded-xl bg-slate-900/70 border border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Agent Voice Studio</span>
                </div>
                <button
                  type="button"
                  onClick={onTestAgentVoice}
                  disabled={Boolean(isTestingVoice)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 rounded-md whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  <span>{isTestingVoice ? 'Speaking...' : 'Test Agent Voice'}</span>
                </button>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="persona-preset-select"
                  className="text-[11px] text-slate-400 block"
                >
                  Assistant Persona
                </label>
                <select
                  id="persona-preset-select"
                  aria-label="Assistant persona"
                  disabled={isLiveConnected}
                  value={config.personaId}
                  onChange={(e) => {
                    const preset = PERSONA_PRESETS.find((p) => p.id === e.target.value);
                    if (!preset) return;
                    onUpdateConfig((prev) => ({
                      ...prev,
                      personaId: preset.id,
                      systemInstruction: preset.systemInstruction,
                    }));
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 disabled:opacity-60"
                >
                  {PERSONA_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="agent-voice-profile-select"
                  className="text-[11px] text-slate-400 block"
                >
                  Agent Voice Profile
                </label>
                <select
                  id="agent-voice-profile-select"
                  aria-label="Agent Voice Profile"
                  value={config.agentVoiceProfileId}
                  onChange={(e) => {
                    const profile = AGENT_VOICE_PROFILES.find(
                      (p) => p.id === e.target.value
                    );
                    if (!profile) return;
                    onUpdateConfig((prev) => ({
                      ...prev,
                      agentVoiceProfileId: profile.id,
                      voiceName: profile.voiceName,
                      agentVoiceStyle: profile.stylePrompt,
                      voiceSpeed: profile.speed,
                      voicePitchSemitones: profile.pitchSemitones,
                    }));
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                >
                  {AGENT_VOICE_PROFILES.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({profile.voiceName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="voice-mood-default-select"
                  className="text-[11px] text-slate-400 block"
                >
                  Default Emotional Tone
                </label>
                <select
                  id="voice-mood-default-select"
                  value={config.voiceMoodDefault || 'normal'}
                  onChange={(e) =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      voiceMoodDefault: e.target.value as VoiceMood,
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                >
                  <option value="normal">Calm &amp; Warm ("Sir")</option>
                  <option value="greeting">Warm Greeting</option>
                  <option value="excited">Engaged &amp; Excited</option>
                  <option value="proud">Proud &amp; Encouraging</option>
                  <option value="serious">Focused &amp; Serious</option>
                  <option value="sad">Gentle &amp; Empathetic</option>
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="gemini-base-voice-select"
                  className="text-[11px] text-slate-400 block"
                >
                  Base Acoustic Voice
                </label>
                <select
                  id="gemini-base-voice-select"
                  aria-label="Gemini Live voice"
                  disabled={isLiveConnected}
                  value={config.voiceName}
                  onChange={(e) =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      voiceName: e.target.value as GeminiVoiceName,
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 disabled:opacity-60"
                >
                  {VOICES.map((v) => (
                    <option key={v} value={v}>
                      Voice: {v}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="agent-voice-style-input"
                  className="text-[11px] text-slate-400 block"
                >
                  Voice Style Prompt {config.agentVoiceProfileId === 'custom_designer' ? '(Gemini Voice Design)' : ''}
                </label>
                <textarea
                  id="agent-voice-style-input"
                  rows={2}
                  value={config.agentVoiceStyle}
                  onChange={(e) =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      agentVoiceStyle: e.target.value,
                    }))
                  }
                  placeholder="Describe cadence, tone, and vocal character..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 resize-none"
                />
              </div>

              {/* Volume, Speed & Pitch DSP sliders */}
              <div className="space-y-2 pt-1">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Volume</span>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {Math.round(config.voiceVolume * 100)}%
                    </span>
                  </div>
                  <input
                    aria-label="Agent voice volume"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.voiceVolume}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        voiceVolume: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Speech Speed</span>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {config.voiceSpeed.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    aria-label="Agent voice speed"
                    type="range"
                    min={0.75}
                    max={1.4}
                    step={0.05}
                    value={config.voiceSpeed}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        voiceSpeed: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Vocal Pitch</span>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {config.voicePitchSemitones > 0
                        ? `+${config.voicePitchSemitones.toFixed(1)}`
                        : config.voicePitchSemitones.toFixed(1)}{' '}
                      st
                    </span>
                  </div>
                  <input
                    aria-label="Agent voice pitch"
                    type="range"
                    min={-6}
                    max={6}
                    step={0.5}
                    value={config.voicePitchSemitones}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        voicePitchSemitones: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>

              {/* Proactive Alerts & Spoken Tool Updates toggles */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300">Proactive Voice Alerts</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        proactiveVoiceAlerts: !prev.proactiveVoiceAlerts,
                      }))
                    }
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md border whitespace-nowrap shrink-0 ${
                      config.proactiveVoiceAlerts
                        ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                        : 'bg-slate-950 border-slate-700 text-slate-400'
                    }`}
                  >
                    {config.proactiveVoiceAlerts ? 'On' : 'Off'}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300">Spoken Tool Updates</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        spokenToolUpdates: !prev.spokenToolUpdates,
                      }))
                    }
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md border whitespace-nowrap shrink-0 ${
                      config.spokenToolUpdates
                        ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                        : 'bg-slate-950 border-slate-700 text-slate-400'
                    }`}
                  >
                    {config.spokenToolUpdates ? 'On' : 'Off'}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300">Subtle UI Sound Cues</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        soundFeedbackEnabled: prev.soundFeedbackEnabled === false,
                      }))
                    }
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md border whitespace-nowrap shrink-0 ${
                      config.soundFeedbackEnabled !== false
                        ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                        : 'bg-slate-950 border-slate-700 text-slate-400'
                    }`}
                  >
                    {config.soundFeedbackEnabled !== false ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            </div>

            {/* Workspace Lighting & Climate */}
            <div className="space-y-2.5 p-3 rounded-xl bg-slate-900/70 border border-slate-800">
              <div className="text-xs font-semibold text-slate-100">
                Workspace Environment
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Lighting</span>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {state.environment.lightBrightness}% · {state.environment.lightTemperature}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={state.environment.lightBrightness}
                  onChange={(e) =>
                    onUpdateEnvironment({ lightBrightness: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Thermostat</span>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {state.environment.thermostatCelsius}°C
                  </span>
                </div>
                <input
                  type="range"
                  min={16}
                  max={28}
                  step={0.5}
                  value={state.environment.thermostatCelsius}
                  onChange={(e) =>
                    onUpdateEnvironment({ thermostatCelsius: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateEnvironment({ focusMode: !state.environment.focusMode })
                }
                className={`w-full py-1.5 text-xs font-medium rounded-lg border ${
                  state.environment.focusMode
                    ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                    : 'bg-slate-950 border-slate-700 text-slate-300'
                }`}
              >
                {state.environment.focusMode ? 'Focus Mode Enabled' : 'Enable Focus Mode'}
              </button>
            </div>

            {/* Companion URL & Session JSON Backup */}
            <div className="space-y-2">
              <label
                htmlFor="companion-url-input"
                className="text-[11px] text-slate-400 block"
              >
                Desktop Companion WebSocket URL
              </label>
              <input
                id="companion-url-input"
                type="text"
                value={config.companionUrl || 'ws://127.0.0.1:4849'}
                onChange={(e) =>
                  onUpdateConfig((prev) => ({
                    ...prev,
                    companionUrl: e.target.value,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200"
              />
              <button
                type="button"
                onClick={onOpenBackupModal}
                className="w-full py-2 px-3 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg inline-flex items-center justify-center gap-2"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>Export / Restore JSON Backup</span>
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};

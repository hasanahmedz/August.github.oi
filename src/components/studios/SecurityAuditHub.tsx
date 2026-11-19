import React, { useMemo, useState } from 'react';
import {
  Activity,
  Cpu,
  Eye,
  Lock,
  Search,
  Shield,
  Terminal,
} from 'lucide-react';
import type {
  BugFixReport,
  CreativeAssetEntry,
  DesktopAwarenessState,
  ExecutionLogEntry,
  HardwareTelemetry,
  MultiAgentRun,
} from '../../types/assistant';

export interface SecurityAuditHubProps {
  executionLogs: ExecutionLogEntry[];
  bugReports: BugFixReport[];
  agentRuns: MultiAgentRun[];
  creativeAssets: CreativeAssetEntry[];
  awareness: DesktopAwarenessState;
  hardwareTelemetry: HardwareTelemetry | null;
  companionConnected: boolean;
  onToggleAwareness: (enabled: boolean) => void;
  onRefreshTelemetry: () => void;
}

export const SecurityAuditHub: React.FC<SecurityAuditHubProps> = ({
  executionLogs,
  bugReports,
  agentRuns,
  creativeAssets,
  awareness,
  hardwareTelemetry,
  companionConnected,
  onToggleAwareness,
  onRefreshTelemetry,
}) => {
  const [filterText, setFilterText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'pc' | 'dev' | 'creative' | 'personal'>('all');

  const filteredLogs = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return executionLogs.filter((log) => {
      if (categoryFilter === 'pc' && log.source !== 'companion' && log.source !== 'local') return false;
      if (categoryFilter === 'dev' && log.source !== 'dev' && log.source !== 'bugfix' && log.source !== 'skills') return false;
      if (categoryFilter === 'creative' && log.source !== 'creative') return false;
      if (categoryFilter === 'personal' && log.source !== 'workspace' && log.source !== 'calling' && log.source !== 'scheduler') return false;
      if (!q) return true;
      return (
        log.command.toLowerCase().includes(q) ||
        log.detail.toLowerCase().includes(q) ||
        log.intent.toLowerCase().includes(q)
      );
    });
  }, [executionLogs, filterText, categoryFilter]);

  return (
    <div className="flex flex-col gap-4 w-full text-slate-200">
      {/* Top Metric Cards (Single-Elevation Obsidian Panels, Tabular Numerals) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-slate-400 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-sky-400" /> System Awareness
            </span>
            <button
              type="button"
              onClick={() => onToggleAwareness(!awareness.enabled)}
              className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                awareness.enabled
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              {awareness.enabled ? 'ACTIVE' : 'PAUSED'}
            </button>
          </div>
          <div className="text-sm font-medium text-slate-100 truncate">
            {awareness.activeApp || 'No active desktop window reported'}
          </div>
          <div className="text-[11px] font-mono text-slate-400 truncate">
            {awareness.windowTitle || 'Enable Desktop Awareness when Companion is connected'}
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-sky-400" /> Hardware Telemetry
            </span>
            <button
              type="button"
              onClick={onRefreshTelemetry}
              className="text-[11px] font-mono text-sky-300 hover:underline"
            >
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
            <div>
              <div className="text-[10px] text-slate-500">CPU</div>
              <div className="text-slate-100">
                {hardwareTelemetry?.cpuPercent !== undefined ? `${hardwareTelemetry.cpuPercent}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">RAM</div>
              <div className="text-slate-100">
                {hardwareTelemetry?.ramPercent !== undefined ? `${hardwareTelemetry.ramPercent}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">BRIDGE</div>
              <div className={companionConnected ? 'text-emerald-300' : 'text-amber-300'}>
                {companionConnected ? 'ONLINE' : 'OFFLINE'}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-2">
          <div className="text-xs font-mono uppercase text-slate-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400" /> Security & Protection
          </div>
          <div className="text-[11px] text-slate-300 space-y-1">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-emerald-400" /> In-memory OAuth tokens & Firestore strict rules
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-sky-400" /> {bugReports.length} Bug Audits • {agentRuns.length} Agent Runs • {creativeAssets.length} Creations
            </div>
          </div>
        </div>
      </div>

      {/* Unified Searchable History & Audit Trail */}
      <div className="bg-slate-950/75 border border-slate-800 rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-mono uppercase text-slate-400 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" /> Unified Execution & Activity History ({filteredLogs.length})
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2.5 py-1">
              <Search className="w-3 h-3 text-slate-500" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter audit trail..."
                className="bg-transparent text-xs focus:outline-none w-44"
              />
            </div>
            {(['all', 'pc', 'dev', 'creative', 'personal'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2 py-1 rounded text-[11px] font-mono border uppercase ${
                  categoryFilter === cat
                    ? 'bg-sky-500/15 border-sky-400/50 text-sky-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-1.5 font-mono text-xs">
          {filteredLogs.slice(0, 50).map((log) => (
            <div key={log.id} className="bg-slate-900/80 border border-slate-800 rounded px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 uppercase">
                    {log.source}
                  </span>
                  <span className="text-slate-100 truncate">{log.command}</span>
                </div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">{log.detail}</div>
              </div>
              <div className="text-right shrink-0">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    log.status === 'FAILED'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-emerald-500/15 text-emerald-300'
                  }`}
                >
                  {log.status}
                </span>
                <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          {filteredLogs.length === 0 && (
            <p className="text-xs text-slate-500 py-4 text-center">No matching activity logged yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

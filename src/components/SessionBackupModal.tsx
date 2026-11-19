import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Upload, X } from 'lucide-react';
import type {
  AssistantConfig,
  AssistantMessage,
  AssistantSessionSnapshot,
  AssistantState,
} from '../types/assistant';
import {
  createSessionSnapshot,
  downloadSessionJson,
  parseAndValidateSessionJson,
} from '../utils/sessionBackup';

interface SessionBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: AssistantMessage[];
  config: AssistantConfig;
  state: AssistantState;
  onRestoreSession: (snapshot: AssistantSessionSnapshot) => void;
}

export const SessionBackupModal: React.FC<SessionBackupModalProps> = ({
  isOpen,
  onClose,
  messages,
  config,
  state,
  onRestoreSession,
}) => {
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingSnapshot, setPendingSnapshot] = useState<{
    fileName: string;
    snapshot: AssistantSessionSnapshot;
  } | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setImportError(null);
      setStatusNotice(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = () => {
    const snapshot = createSessionSnapshot(messages, config, state);
    const filename = downloadSessionJson(snapshot);
    setImportError(null);
    setStatusNotice(`Exported ${filename}`);
  };

  const handleCopyJson = async () => {
    try {
      const snapshot = createSessionSnapshot(messages, config, state);
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      setImportError('Clipboard write was blocked by the browser. Use Export JSON instead.');
    }
  };

  const processFile = async (file: File) => {
    setImportError(null);
    setStatusNotice(null);
    try {
      const text = await file.text();
      const result = parseAndValidateSessionJson(text);
      if (result.ok === false) {
        setPendingSnapshot(null);
        setImportError(result.error);
        return;
      }
      setPendingSnapshot({
        fileName: file.name,
        snapshot: result.snapshot,
      });
    } catch {
      setPendingSnapshot(null);
      setImportError('Could not read the selected file.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleConfirmRestore = () => {
    if (!pendingSnapshot) return;
    onRestoreSession(pendingSnapshot.snapshot);
    setPendingSnapshot(null);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-backup-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2
              id="session-backup-title"
              className="text-base font-display font-bold text-slate-900"
            >
              Session Backup & Restore
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Save or restore messages, system config, tasks, timers, and memory as JSON.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Export Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Export Current Session</h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {messages.length} msgs · {state.tasks.length} tasks · {state.timers.length} timers · {state.searchHistory?.length || 0} queries
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Downloads a portable JSON snapshot containing your conversation history, active system prompt, enabled tools, tasks, timers, memory vault, and room state.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Session JSON</span>
              </button>

              <button
                type="button"
                onClick={handleCopyJson}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                {copiedJson ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedJson ? 'Copied JSON' : 'Copy JSON'}</span>
              </button>
            </div>

            {statusNotice && (
              <p className="text-xs text-emerald-700 font-medium">{statusNotice}</p>
            )}
          </div>

          {/* Import Section */}
          <div className="pt-5 border-t border-slate-200 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Import & Restore Session</h3>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChange}
              className="hidden"
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`p-5 rounded-lg border border-dashed text-center transition-colors ${
                isDragging
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-slate-300 bg-slate-50/60'
              }`}
            >
              <p className="text-xs text-slate-600">
                Drop a previously exported <span className="font-mono text-slate-800">.json</span> file here, or select one from your device.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Choose JSON File</span>
              </button>
            </div>

            {importError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {importError}
              </div>
            )}

            {pendingSnapshot && (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-medium text-slate-900 truncate">
                    {pendingSnapshot.fileName}
                  </span>
                  <span className="text-slate-500 shrink-0">Ready to restore</span>
                </div>

                <div className="text-xs text-slate-600 tabular-nums">
                  {pendingSnapshot.snapshot.messages.length} messages ·{' '}
                  {pendingSnapshot.snapshot.state.tasks.length} tasks ·{' '}
                  {pendingSnapshot.snapshot.state.timers.length} timers ·{' '}
                  {pendingSnapshot.snapshot.state.memory.length} memories ·{' '}
                  {pendingSnapshot.snapshot.state.searchHistory.length} queries
                </div>

                <div className="text-[11px] text-slate-500">
                  Exported {new Date(pendingSnapshot.snapshot.exportedAt).toLocaleString()}
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPendingSnapshot(null)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRestore}
                    className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Restore Session
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

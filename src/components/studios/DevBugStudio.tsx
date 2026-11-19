import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Code2,
  FolderOpen,
  History,
  Package,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  BugFixPatchProposal,
  BugFixReport,
  ProjectBackupSnapshot,
  ProjectEntry,
} from '../../types/assistant';
import {
  listAndSearchDirectory,
  pickDirectoryHandle,
  type DesktopCompanionBridge,
} from '../../utils/computerControl';

export interface DevBugStudioProps {
  initialTab?: 'dev' | 'bugfix';
  projects: ProjectEntry[];
  bugReports: BugFixReport[];
  companionBridge: DesktopCompanionBridge;
  companionConnected: boolean;
  onSaveProject: (project: ProjectEntry, isUpdate?: boolean) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onSaveBugReport: (report: BugFixReport, isUpdate?: boolean) => Promise<void>;
  onLogAction: (command: string, detail: string, status?: 'COMPLETED' | 'FAILED') => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

interface TreeEntry {
  path: string;
  kind: 'file' | 'directory';
  size?: number;
}

export const DevBugStudio: React.FC<DevBugStudioProps> = ({
  initialTab = 'dev',
  projects,
  bugReports,
  companionBridge,
  companionConnected,
  onSaveProject,
  onDeleteProject,
  onSaveBugReport,
  onLogAction,
  getAuthHeaders,
}) => {
  const [subTab, setSubTab] = useState<'dev' | 'bugfix'>(initialTab);
  const [authorizedRoots, setAuthorizedRoots] = useState<string[]>([]);
  const [activeRoot, setActiveRoot] = useState('');
  const [newRootInput, setNewRootInput] = useState('');
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [activeFilePath, setActiveFilePath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [language, setLanguage] = useState<ProjectEntry['language']>('typescript');
  const [framework, setFramework] = useState('react-vite');
  const [devPrompt, setDevPrompt] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [snapshots, setSnapshots] = useState<ProjectBackupSnapshot[]>([]);
  const [proposedPatches, setProposedPatches] = useState<BugFixPatchProposal[]>([]);
  const [requestedDeps, setRequestedDeps] = useState<string[]>([]);
  const [testPreset, setTestPreset] = useState<
    'npm_test' | 'npm_build' | 'npm_lint' | 'tsc_check' | 'pytest' | 'python_unittest'
  >('tsc_check');
  const [testOutput, setTestOutput] = useState<{
    passed: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
  } | null>(null);

  // Browser Directory Handle fallback when Companion is offline
  const [browserDirHandle, setBrowserDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  // Bug Fixer State
  const [errorTraceInput, setErrorTraceInput] = useState('');
  const [diagnosis, setDiagnosis] = useState<{
    title: string;
    rootCause: string;
    regressionRisk: 'low' | 'medium' | 'high';
    recommendedTestPreset: string;
    verificationSummary: string;
    patches: BugFixPatchProposal[];
  } | null>(null);

  // Custom React confirmation modal (no window.confirm/alert)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    detail: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const refreshCompanionWorkspace = async (rootToInspect?: string) => {
    if (!companionConnected) return;
    const rootsRes = await companionBridge.listAuthorizedProjects();
    if (rootsRes.ok) {
      const list = Array.isArray(rootsRes.data?.roots) ? (rootsRes.data!.roots as string[]) : [];
      setAuthorizedRoots(list);
      const chosen = rootToInspect || activeRoot || String(rootsRes.data?.defaultWorkspace || list[0] || '');
      if (chosen) {
        setActiveRoot(chosen);
        const [insp, snaps] = await Promise.all([
          companionBridge.inspectProject(chosen),
          companionBridge.listProjectBackups(chosen),
        ]);
        if (insp.ok && Array.isArray(insp.data?.tree)) {
          setTree(insp.data!.tree as TreeEntry[]);
        }
        if (snaps.ok && Array.isArray(snaps.data?.snapshots)) {
          setSnapshots(snaps.data!.snapshots as ProjectBackupSnapshot[]);
        }
      }
    }
  };

  useEffect(() => {
    if (companionConnected) {
      void refreshCompanionWorkspace();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companionConnected]);

  const handleAuthorizeRoot = async () => {
    if (!newRootInput.trim() || !companionConnected) return;
    const res = await companionBridge.authorizeProjectRoot(newRootInput.trim());
    setStatusMsg(res.message);
    if (res.ok && res.data?.projectRoot) {
      const root = String(res.data.projectRoot);
      setNewRootInput('');
      await refreshCompanionWorkspace(root);
      await onSaveProject({
        id: `proj_${Date.now()}`,
        name: root.split(/[\\/]/).pop() || 'Local Project',
        rootPath: root,
        language,
        framework,
        status: 'active',
        lastTestStatus: 'unknown',
        snapshotCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleOpenBrowserFolder = async () => {
    try {
      const handle = await pickDirectoryHandle();
      setBrowserDirHandle(handle);
      const entries = await listAndSearchDirectory(handle);
      setTree(entries.map((e) => ({ path: e.name, kind: e.kind, size: e.size })));
      setActiveRoot(`browser://${handle.name}`);
      setStatusMsg(`Opened local folder "${handle.name}" via browser File System Access.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Folder selection cancelled.');
    }
  };

  const handleOpenFile = async (relPath: string) => {
    if (companionConnected && activeRoot && !activeRoot.startsWith('browser://')) {
      const res = await companionBridge.readProjectFile(activeRoot, relPath);
      if (res.ok) {
        setActiveFilePath(relPath);
        setEditorContent(String(res.data?.content || ''));
        setStatusMsg(`Loaded ${relPath}`);
      } else {
        setStatusMsg(res.message);
      }
      return;
    }
    if (browserDirHandle) {
      try {
        const fh = await browserDirHandle.getFileHandle(relPath);
        const file = await fh.getFile();
        setActiveFilePath(relPath);
        setEditorContent(await file.text());
        setStatusMsg(`Loaded ${relPath} (browser handle)`);
      } catch (err) {
        setStatusMsg(err instanceof Error ? err.message : 'Unable to read file.');
      }
    }
  };

  const handleWriteFileWithBackup = async (relPath: string, content: string, reason = 'Dev Studio Save') => {
    if (companionConnected && activeRoot && !activeRoot.startsWith('browser://')) {
      const res = await companionBridge.writeProjectFileWithBackup(activeRoot, relPath, content, reason);
      setStatusMsg(res.message);
      if (res.ok) {
        onLogAction('dev:write_with_backup', `Saved ${relPath} with backup`);
        await refreshCompanionWorkspace(activeRoot);
      }
      return res.ok;
    }
    if (browserDirHandle && !relPath.includes('/')) {
      try {
        const fh = await browserDirHandle.getFileHandle(relPath, { create: true });
        const writable = await fh.createWritable();
        await writable.write(content);
        await writable.close();
        setStatusMsg(`Saved ${relPath} directly in selected browser folder.`);
        return true;
      } catch (err) {
        setStatusMsg(err instanceof Error ? err.message : 'Browser write failed.');
        return false;
      }
    }
    setStatusMsg('Connect Desktop Companion (or pick a browser folder) to save files locally.');
    return false;
  };

  const handleRunAiScaffold = async () => {
    if (!devPrompt.trim() || busy) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/dev/scaffold-or-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          prompt: devPrompt.trim(),
          language,
          framework,
          fileTree: tree.slice(0, 60).map((t) => t.path),
          currentFile: activeFilePath ? { path: activeFilePath, content: editorContent } : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.patches)) {
        setProposedPatches(data.patches);
        setRequestedDeps(Array.isArray(data.requestedDependencies) ? data.requestedDependencies : []);
        setStatusMsg(data.summary || `Prepared ${data.patches.length} patch(es).`);
        onLogAction('dev:scaffold', `Generated ${data.patches.length} patch(es) for ${language}`);
      } else {
        setStatusMsg(data.error || 'Failed to generate code patches.');
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDiagnoseBug = async () => {
    if (!errorTraceInput.trim() || busy) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/bugfix/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          errorInput: errorTraceInput.trim(),
          language,
          fileContext: activeFilePath ? [{ path: activeFilePath, content: editorContent }] : [],
        }),
      });
      const data = await res.json();
      if (data.ok && data.diagnosis) {
        setDiagnosis(data.diagnosis);
        setProposedPatches(data.diagnosis.patches || []);
        setStatusMsg(`Diagnosis complete (${data.source === 'gemini' ? 'Gemini' : 'Static Heuristic'}).`);
        await onSaveBugReport({
          id: `bug_${Date.now()}`,
          projectId: projects[0]?.id || 'workspace',
          title: String(data.diagnosis.title || 'Bug Diagnosis'),
          errorInput: errorTraceInput.trim().slice(0, 2000),
          rootCause: String(data.diagnosis.rootCause || ''),
          status: 'diagnosed',
          verificationSummary: String(data.diagnosis.verificationSummary || ''),
          regressionRisk: data.diagnosis.regressionRisk || 'medium',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        onLogAction('bugfix:diagnose', String(data.diagnosis.title || 'Diagnosed error'));
      } else {
        setStatusMsg(data.error || 'Diagnosis failed.');
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Diagnosis request failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRunTests = async () => {
    if (!companionConnected || !activeRoot || activeRoot.startsWith('browser://')) {
      setStatusMsg('Real build/test execution requires an authorized Desktop Companion project.');
      return;
    }
    setBusy(true);
    const res = await companionBridge.runProjectTest(activeRoot, testPreset);
    setBusy(false);
    setStatusMsg(res.message);
    if (res.data) {
      const passed = Boolean(res.data.passed);
      setTestOutput({
        passed,
        exitCode: Number(res.data.exitCode ?? (passed ? 0 : 1)),
        stdout: String(res.data.stdout || ''),
        stderr: String(res.data.stderr || ''),
        durationMs: Number(res.data.durationMs || 0),
      });
      onLogAction(`test:${testPreset}`, res.message, passed ? 'COMPLETED' : 'FAILED');
      if (!passed) {
        setErrorTraceInput(
          `${res.data.stderr || ''}\n${res.data.stdout || ''}`.trim().slice(0, 3500)
        );
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full text-slate-200">
      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('dev')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border ${
              subTab === 'dev'
                ? 'bg-sky-500/15 border-sky-400/60 text-sky-300'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" /> Development Studio
          </button>
          <button
            type="button"
            onClick={() => setSubTab('bugfix')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border ${
              subTab === 'bugfix'
                ? 'bg-amber-500/15 border-amber-400/60 text-amber-300'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bug className="w-3.5 h-3.5" /> Autonomous Bug Fixer
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as ProjectEntry['language'])}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
          >
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
            <option value="web">Web App</option>
            <option value="android">Android</option>
          </select>
          <button
            type="button"
            onClick={() => void handleOpenBrowserFolder()}
            className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 flex items-center gap-1"
          >
            <FolderOpen className="w-3.5 h-3.5" /> Pick Browser Folder
          </button>
        </div>
      </div>

      {/* Authorized Project Root Selector */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 text-xs">
        {companionConnected ? (
          <>
            <select
              value={activeRoot}
              onChange={(e) => void refreshCompanionWorkspace(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-xs max-w-xs"
            >
              {authorizedRoots.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newRootInput}
              onChange={(e) => setNewRootInput(e.target.value)}
              placeholder="Authorize local project folder path (e.g. C:\Projects\myapp)"
              className="flex-1 min-w-[200px] bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => void handleAuthorizeRoot()}
              className="px-3 py-1.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 font-medium"
            >
              Authorize Root
            </button>
          </>
        ) : (
          <span className="text-amber-300/90 text-[11px] font-mono">
            Desktop Companion offline — using browser folder picker or cloud patch preview. Connect Companion for automatic .jarvis-backups & real test execution.
          </span>
        )}
      </div>

      {statusMsg && (
        <div className="px-3 py-2 rounded bg-slate-900/90 border border-slate-800 text-xs font-mono text-sky-300">
          {statusMsg}
        </div>
      )}

      {/* Main Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: File Tree & Backups */}
        <div className="lg:col-span-3 bg-slate-950/75 border border-slate-800 rounded-lg p-3 flex flex-col gap-3">
          <div>
            <div className="text-[11px] font-mono uppercase text-slate-400 mb-1.5">
              Project Explorer ({tree.filter((t) => t.kind === 'file').length} files)
            </div>
            <div className="max-h-52 overflow-y-auto space-y-1 font-mono text-[11px]">
              {tree
                .filter((t) => t.kind === 'file')
                .map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => void handleOpenFile(f.path)}
                    className={`w-full text-left px-2 py-1 rounded truncate block ${
                      activeFilePath === f.path
                        ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                        : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    {f.path}
                  </button>
                ))}
              {tree.length === 0 && (
                <p className="text-slate-500 text-[11px]">No files loaded yet.</p>
              )}
            </div>
          </div>

          <div className="border-t border-slate-800 pt-2">
            <div className="text-[11px] font-mono uppercase text-slate-400 mb-1.5 flex items-center gap-1">
              <History className="w-3 h-3" /> Backup Snapshots ({snapshots.length})
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1.5">
              {snapshots.map((snap) => (
                <div
                  key={snap.snapshotId}
                  className="bg-slate-900/80 border border-slate-800 rounded p-2 text-[11px] space-y-1"
                >
                  <div className="font-mono text-slate-300 truncate">{snap.reason}</div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>{snap.files.join(', ')}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmModal({
                          title: 'Rollback Project Snapshot?',
                          detail: `Restore pre-${snap.snapshotId} contents for: ${snap.files.join(', ')}?`,
                          onConfirm: async () => {
                            const r = await companionBridge.rollbackProjectBackup(activeRoot, snap.snapshotId);
                            setStatusMsg(r.message);
                            await refreshCompanionWorkspace(activeRoot);
                          },
                        })
                      }
                      className="text-amber-300 hover:text-amber-200 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Rollback
                    </button>
                  </div>
                </div>
              ))}
              {snapshots.length === 0 && (
                <p className="text-slate-500 text-[11px]">Backups appear here before every local write.</p>
              )}
            </div>
          </div>
        </div>

        {/* Center/Right: Dev Editor OR Bug Fixer */}
        <div className="lg:col-span-9 flex flex-col gap-3">
          {subTab === 'dev' ? (
            <>
              <div className="flex flex-wrap gap-2 bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                <input
                  type="text"
                  value={devPrompt}
                  onChange={(e) => setDevPrompt(e.target.value)}
                  placeholder="Ask J.A.R.V.I.S. to build a feature, API route, Python script, or refactor active file..."
                  className="flex-1 min-w-[220px] bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs"
                />
                <input
                  type="text"
                  value={framework}
                  onChange={(e) => setFramework(e.target.value)}
                  placeholder="Framework"
                  className="w-28 bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono"
                />
                <button
                  type="button"
                  disabled={busy || !devPrompt.trim()}
                  onClick={() => void handleRunAiScaffold()}
                  className="px-3 py-1.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 text-xs font-medium flex items-center gap-1.5 disabled:opacity-45"
                >
                  <Sparkles className="w-3.5 h-3.5" /> {busy ? 'Working...' : 'Propose Code'}
                </button>
              </div>

              <div className="bg-slate-950/75 border border-slate-800 rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    type="text"
                    value={activeFilePath}
                    onChange={(e) => setActiveFilePath(e.target.value)}
                    placeholder="Relative file path (e.g. src/app.ts)"
                    className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 font-mono text-xs w-72"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!activeFilePath.trim()}
                      onClick={() => void handleWriteFileWithBackup(activeFilePath.trim(), editorContent)}
                      className="px-3 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-1 disabled:opacity-40"
                    >
                      <Save className="w-3.5 h-3.5" /> Save w/ Backup
                    </button>
                    {companionConnected && activeFilePath && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmModal({
                            title: 'Delete File with Recovery Backup?',
                            detail: `Delete "${activeFilePath}" from ${activeRoot}? A backup snapshot will be created in .jarvis-backups first.`,
                            onConfirm: async () => {
                              const r = await companionBridge.deleteProjectFileWithBackup(
                                activeRoot,
                                activeFilePath,
                                'User confirmed delete'
                              );
                              setStatusMsg(r.message);
                              setActiveFilePath('');
                              setEditorContent('');
                              await refreshCompanionWorkspace(activeRoot);
                            },
                          })
                        }
                        className="px-2.5 py-1 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  rows={12}
                  spellCheck={false}
                  placeholder="// Select a file from Project Explorer or type new code here..."
                  className="w-full bg-[#060911] border border-slate-800 rounded p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </>
          ) : (
            <div className="bg-slate-950/75 border border-slate-800 rounded-lg p-3 space-y-3">
              <div className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
                <Bug className="w-4 h-4" /> Paste Error, Log, or Stack Trace
              </div>
              <textarea
                value={errorTraceInput}
                onChange={(e) => setErrorTraceInput(e.target.value)}
                rows={5}
                placeholder="Paste TypeScript compiler errors, Python tracebacks, runtime exceptions, or failed test logs..."
                className="w-full bg-[#060911] border border-slate-800 rounded p-2.5 font-mono text-xs text-rose-200/90"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !errorTraceInput.trim()}
                  onClick={() => void handleDiagnoseBug()}
                  className="px-3.5 py-1.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-medium flex items-center gap-1.5 disabled:opacity-45"
                >
                  <Sparkles className="w-3.5 h-3.5" /> {busy ? 'Diagnosing...' : 'Diagnose Root Cause & Propose Fix'}
                </button>
              </div>
              {diagnosis && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-300">{diagnosis.title}</span>
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      Risk: {diagnosis.regressionRisk}
                    </span>
                  </div>
                  <p className="text-slate-300">{diagnosis.rootCause}</p>
                  <p className="text-[11px] font-mono text-sky-300">{diagnosis.verificationSummary}</p>
                </div>
              )}
            </div>
          )}

          {/* Proposed Multi-File Patches */}
          {proposedPatches.length > 0 && (
            <div className="bg-slate-950/80 border border-sky-500/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-sky-300">
                  Proposed Reversible Patches ({proposedPatches.length})
                </span>
                {requestedDeps.length > 0 && companionConnected && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmModal({
                        title: 'Install Project Dependencies?',
                        detail: `Run package install for: ${requestedDeps.join(', ')} inside ${activeRoot}?`,
                        onConfirm: async () => {
                          const mgr = language === 'python' ? 'pip' : 'npm';
                          const r = await companionBridge.installProjectDependencies(
                            activeRoot,
                            mgr,
                            requestedDeps
                          );
                          setStatusMsg(r.message);
                        },
                      })
                    }
                    className="px-2.5 py-1 rounded bg-indigo-500/20 border border-indigo-400/50 text-indigo-200 text-[11px] flex items-center gap-1"
                  >
                    <Package className="w-3 h-3" /> Install {requestedDeps.join(', ')}
                  </button>
                )}
              </div>
              {proposedPatches.map((patch, idx) => (
                <div key={`${patch.filePath}-${idx}`} className="bg-slate-900 border border-slate-800 rounded p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-sky-300">{patch.filePath}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilePath(patch.filePath);
                          setEditorContent(patch.updatedContent);
                          setSubTab('dev');
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300"
                      >
                        Load in Editor
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleWriteFileWithBackup(patch.filePath, patch.updatedContent, patch.summary)
                        }
                        className="px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px]"
                      >
                        Apply w/ Backup
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">{patch.summary}</p>
                </div>
              ))}
            </div>
          )}

          {/* Automated Test Runner Bar */}
          <div className="bg-slate-950/75 border border-slate-800 rounded-lg p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <select
                  value={testPreset}
                  onChange={(e) => setTestPreset(e.target.value as typeof testPreset)}
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 font-mono text-xs"
                >
                  <option value="tsc_check">npx tsc --noEmit</option>
                  <option value="npm_test">npm test</option>
                  <option value="npm_build">npm run build</option>
                  <option value="npm_lint">npm run lint</option>
                  <option value="pytest">pytest</option>
                  <option value="python_unittest">python -m unittest</option>
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRunTests()}
                  className="px-3 py-1 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 text-xs font-medium flex items-center gap-1"
                >
                  <Play className="w-3.5 h-3.5" /> Verify & Run Tests
                </button>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Bug Reports Logged: {bugReports.length} • Projects: {projects.length}
              </span>
            </div>
            {testOutput && (
              <div className="bg-[#060911] border border-slate-800 rounded p-2.5 font-mono text-[11px] space-y-1 max-h-40 overflow-y-auto">
                <div className={`flex items-center gap-1.5 ${testOutput.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {testOutput.passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  Exit Code {testOutput.exitCode} ({testOutput.durationMs}ms)
                </div>
                {testOutput.stdout && <pre className="text-slate-300 whitespace-pre-wrap">{testOutput.stdout}</pre>}
                {testOutput.stderr && <pre className="text-rose-300 whitespace-pre-wrap">{testOutput.stderr}</pre>}
              </div>
            )}
            {projects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {projects.map((p) => (
                  <div key={p.id} className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono">
                    <span>{p.name}</span>
                    <button
                      type="button"
                      onClick={() => void onDeleteProject(p.id)}
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-xl max-w-md w-full p-4 space-y-3">
            <h3 className="text-sm font-semibold text-amber-300">{confirmModal.title}</h3>
            <p className="text-xs text-slate-300">{confirmModal.detail}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal(null);
                  await fn();
                }}
                className="px-3 py-1.5 rounded bg-amber-500/20 border border-amber-400 text-xs text-amber-200 font-medium"
              >
                Confirm & Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

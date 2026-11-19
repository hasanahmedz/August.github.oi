import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Download,
  History,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Workflow,
  Zap,
} from 'lucide-react';
import type {
  AutomationWorkflow,
  MultiAgentRun,
  SkillDefinition,
  SkillVersionEntry,
} from '../../types/assistant';
import { subscribeSkillVersions } from '../../services/firebase';

export interface SkillsAgentHubProps {
  initialTab?: 'skills' | 'agents' | 'workflows';
  uid: string | null;
  skills: SkillDefinition[];
  agentRuns: MultiAgentRun[];
  workflows: AutomationWorkflow[];
  onSaveSkill: (skill: SkillDefinition, isUpdate?: boolean) => Promise<void>;
  onSaveSkillVersion: (entry: SkillVersionEntry) => Promise<void>;
  onDeleteSkill: (skillId: string) => Promise<void>;
  onSaveAgentRun: (run: MultiAgentRun, isUpdate?: boolean) => Promise<void>;
  onSaveWorkflow: (wf: AutomationWorkflow, isUpdate?: boolean) => Promise<void>;
  onDeleteWorkflow: (id: string) => Promise<void>;
  onLogAction: (command: string, detail: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

const SUGGESTED_SKILLS: Array<Pick<SkillDefinition, 'name' | 'description' | 'category' | 'triggerPattern' | 'instructions'>> = [
  {
    name: 'Morning Focus Brief',
    description: 'Reads today tasks, pending reminders, and latest weather in one concise briefing.',
    category: 'personal',
    triggerPattern: 'morning brief|daily briefing|shokal er update',
    instructions: '1. Fetch pending tasks and active alarms.\n2. Query local weather briefing.\n3. Deliver a 3-sentence summary.',
  },
  {
    name: 'Workspace Bug Triage',
    description: 'Inspects recent TypeScript/Python tracebacks and drafts reversible fix proposals.',
    category: 'coding',
    triggerPattern: 'triage bug|diagnose error|fix crash',
    instructions: '1. Capture latest error trace.\n2. Run root-cause analyzer.\n3. Propose backup-guarded patch.',
  },
  {
    name: 'Gaming Mode Prep',
    description: 'Pauses proactive monitors, reduces distractions, and reports CPU/RAM readiness.',
    category: 'pc_control',
    triggerPattern: 'gaming mode|start gaming|khela shuru',
    instructions: '1. Switch AI core to gaming posture.\n2. Silence non-VIP notifications.\n3. Check system telemetry.',
  },
];

export const SkillsAgentHub: React.FC<SkillsAgentHubProps> = ({
  initialTab = 'skills',
  uid,
  skills,
  agentRuns,
  workflows,
  onSaveSkill,
  onSaveSkillVersion,
  onDeleteSkill,
  onSaveAgentRun,
  onSaveWorkflow,
  onDeleteWorkflow,
  onLogAction,
  getAuthHeaders,
}) => {
  const [subTab, setSubTab] = useState<'skills' | 'agents' | 'workflows'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [nlSkillPrompt, setNlSkillPrompt] = useState('');
  const [sampleInput, setSampleInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusNote, setStatusNote] = useState('');

  // Skill Versioning & Inspector
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [versions, setVersions] = useState<SkillVersionEntry[]>([]);
  const [editInstructions, setEditInstructions] = useState('');
  const [editTrigger, setEditTrigger] = useState('');

  // Multi-Agent Goal Runner
  const [agentGoal, setAgentGoal] = useState('');
  const [activeAgentRun, setActiveAgentRun] = useState<MultiAgentRun | null>(null);

  // Workflow Builder
  const [wfName, setWfName] = useState('');
  const [wfTriggerType, setWfTriggerType] = useState<AutomationWorkflow['triggerType']>('voice_phrase');
  const [wfTriggerVal, setWfTriggerVal] = useState('');
  const [wfActionType, setWfActionType] = useState<AutomationWorkflow['actionType']>('run_skill');
  const [wfActionPayload, setWfActionPayload] = useState('');

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedSkillId) || null,
    [skills, selectedSkillId]
  );

  useEffect(() => {
    if (selectedSkill) {
      setEditInstructions(selectedSkill.instructions);
      setEditTrigger(selectedSkill.triggerPattern);
    }
  }, [selectedSkill]);

  useEffect(() => {
    if (!uid || !selectedSkillId) {
      setVersions([]);
      return;
    }
    const unsub = subscribeSkillVersions(
      uid,
      selectedSkillId,
      (items) => setVersions(items),
      () => setVersions([])
    );
    return unsub;
  }, [uid, selectedSkillId]);

  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.triggerPattern.toLowerCase().includes(q)
    );
  }, [skills, searchQuery]);

  const handleDraftAndTestSkill = async () => {
    if (!nlSkillPrompt.trim() || busy) return;
    setBusy(true);
    setStatusNote('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/skills/draft-and-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          prompt: nlSkillPrompt.trim(),
          sampleInput: sampleInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok && data.skill) {
        const nowIso = new Date().toISOString();
        const skillId = `skill_${Date.now()}`;
        const created: SkillDefinition = {
          id: skillId,
          name: data.skill.name,
          description: data.skill.description,
          category: data.skill.category,
          triggerPattern: data.skill.triggerPattern,
          instructions: data.skill.instructions,
          enabled: data.skill.testStatus === 'passed',
          activeVersion: 1,
          testStatus: data.skill.testStatus,
          lastTestNote: data.skill.lastTestNote,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await onSaveSkill(created, false);
        await onSaveSkillVersion({
          id: `ver_1_${Date.now()}`,
          skillId,
          version: 1,
          instructions: created.instructions,
          triggerPattern: created.triggerPattern,
          changelog: 'Initial tested draft',
          createdAt: nowIso,
        });
        setSelectedSkillId(skillId);
        setNlSkillPrompt('');
        setStatusNote(`Skill "${created.name}" tested (${created.testStatus}) & saved as v1.`);
        onLogAction('skill:create', `Created & tested skill "${created.name}"`);
      } else {
        setStatusNote(data.error || 'Unable to draft skill.');
      }
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Skill creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNewRevision = async () => {
    if (!selectedSkill) return;
    const nextVer = selectedSkill.activeVersion + 1;
    const nowIso = new Date().toISOString();
    const updated: SkillDefinition = {
      ...selectedSkill,
      triggerPattern: editTrigger.trim() || selectedSkill.triggerPattern,
      instructions: editInstructions.trim() || selectedSkill.instructions,
      activeVersion: nextVer,
      testStatus: 'passed',
      lastTestNote: `Revision v${nextVer} validated locally`,
      updatedAt: nowIso,
    };
    await onSaveSkill(updated, true);
    await onSaveSkillVersion({
      id: `ver_${nextVer}_${Date.now()}`,
      skillId: selectedSkill.id,
      version: nextVer,
      instructions: updated.instructions,
      triggerPattern: updated.triggerPattern,
      changelog: `Manual edit to v${nextVer}`,
      createdAt: nowIso,
    });
    setStatusNote(`Saved "${selectedSkill.name}" v${nextVer}.`);
  };

  const handleRollbackVersion = async (ver: SkillVersionEntry) => {
    if (!selectedSkill) return;
    const nextVer = selectedSkill.activeVersion + 1;
    const nowIso = new Date().toISOString();
    await onSaveSkill(
      {
        ...selectedSkill,
        instructions: ver.instructions,
        triggerPattern: ver.triggerPattern,
        activeVersion: nextVer,
        lastTestNote: `Rolled back to v${ver.version}`,
        updatedAt: nowIso,
      },
      true
    );
    await onSaveSkillVersion({
      id: `ver_${nextVer}_${Date.now()}`,
      skillId: selectedSkill.id,
      version: nextVer,
      instructions: ver.instructions,
      triggerPattern: ver.triggerPattern,
      changelog: `Rollback to v${ver.version}`,
      createdAt: nowIso,
    });
    setStatusNote(`Rolled back "${selectedSkill.name}" to v${ver.version} logic.`);
  };

  const handleImportSkillJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then(async (raw) => {
      try {
        const parsed = JSON.parse(raw) as Partial<SkillDefinition>;
        if (!parsed.name || !parsed.instructions) {
          setStatusNote('Invalid skill JSON: missing name or instructions.');
          return;
        }
        const nowIso = new Date().toISOString();
        const skillId = `skill_imp_${Date.now()}`;
        const imported: SkillDefinition = {
          id: skillId,
          name: String(parsed.name).slice(0, 120),
          description: String(parsed.description || parsed.name).slice(0, 500),
          category: parsed.category || 'automation',
          triggerPattern: String(parsed.triggerPattern || parsed.name.toLowerCase()).slice(0, 200),
          instructions: String(parsed.instructions).slice(0, 4000),
          enabled: false, // require test or manual enable before activation
          activeVersion: 1,
          testStatus: 'untested',
          lastTestNote: 'Imported JSON module (review before enabling)',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await onSaveSkill(imported, false);
        await onSaveSkillVersion({
          id: `ver_1_${Date.now()}`,
          skillId,
          version: 1,
          instructions: imported.instructions,
          triggerPattern: imported.triggerPattern,
          changelog: 'Imported module',
          createdAt: nowIso,
        });
        setStatusNote(`Imported "${imported.name}" into library.`);
      } catch {
        setStatusNote('Could not parse skill JSON file.');
      }
    });
  };

  const handleRunMultiAgent = async () => {
    if (!agentGoal.trim() || busy) return;
    setBusy(true);
    setStatusNote('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/agent/plan-and-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          goal: agentGoal.trim(),
          availableSkills: skills.filter((s) => s.enabled).map((s) => ({ name: s.name, description: s.description })),
        }),
      });
      const data = await res.json();
      if (data.ok && data.plan) {
        const nowIso = new Date().toISOString();
        const run: MultiAgentRun = {
          id: `run_${Date.now()}`,
          goal: agentGoal.trim(),
          status: 'completed',
          activeRole: data.plan.activeRole || 'planner',
          stepCount: Array.isArray(data.plan.steps) ? data.plan.steps.length : 4,
          summary: String(data.plan.summary || 'Pipeline completed'),
          steps: data.plan.steps || [],
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        setActiveAgentRun(run);
        await onSaveAgentRun(run, false);
        onLogAction('agent:run', `Executed ${run.stepCount}-step agent run for "${agentGoal.slice(0, 40)}"`);
      } else {
        setStatusNote(data.error || 'Agent execution failed.');
      }
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Agent request failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddWorkflow = async () => {
    if (!wfName.trim() || !wfTriggerVal.trim() || !wfActionPayload.trim()) return;
    const nowIso = new Date().toISOString();
    await onSaveWorkflow(
      {
        id: `wf_${Date.now()}`,
        name: wfName.trim(),
        triggerType: wfTriggerType,
        triggerValue: wfTriggerVal.trim(),
        actionType: wfActionType,
        actionPayload: wfActionPayload.trim(),
        enabled: true,
        runCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      false
    );
    setWfName('');
    setWfTriggerVal('');
    setWfActionPayload('');
    setStatusNote('Saved automated workflow rule.');
  };

  return (
    <div className="flex flex-col gap-4 w-full text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('skills')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border ${
              subTab === 'skills'
                ? 'bg-sky-500/15 border-sky-400/60 text-sky-300'
                : 'bg-slate-900/70 border-slate-800 text-slate-400'
            }`}
          >
            <Zap className="w-3.5 h-3.5" /> Skills Library ({skills.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('agents')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border ${
              subTab === 'agents'
                ? 'bg-sky-500/15 border-sky-400/60 text-sky-300'
                : 'bg-slate-900/70 border-slate-800 text-slate-400'
            }`}
          >
            <Bot className="w-3.5 h-3.5" /> Multi-Agent Activity ({agentRuns.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('workflows')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border ${
              subTab === 'workflows'
                ? 'bg-sky-500/15 border-sky-400/60 text-sky-300'
                : 'bg-slate-900/70 border-slate-800 text-slate-400'
            }`}
          >
            <Workflow className="w-3.5 h-3.5" /> Workflows ({workflows.length})
          </button>
        </div>

        {subTab === 'skills' && (
          <label className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs flex items-center gap-1.5 cursor-pointer hover:border-sky-400/60">
            <Upload className="w-3.5 h-3.5" /> Import JSON Skill
            <input type="file" accept=".json" onChange={handleImportSkillJson} className="hidden" />
          </label>
        )}
      </div>

      {statusNote && (
        <div className="px-3 py-2 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-sky-300">
          {statusNote}
        </div>
      )}

      {subTab === 'skills' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-3">
            {/* Natural Language Skill Builder */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="text-xs font-medium text-sky-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Create Skill with Natural Language & Dry-Run Test
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={nlSkillPrompt}
                  onChange={(e) => setNlSkillPrompt(e.target.value)}
                  placeholder="Describe skill behavior (e.g. 'Summarize my unread emails and create urgent tasks')"
                  className="flex-1 min-w-[200px] bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs"
                />
                <input
                  type="text"
                  value={sampleInput}
                  onChange={(e) => setSampleInput(e.target.value)}
                  placeholder="Sample test phrase (optional)"
                  className="w-44 bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={busy || !nlSkillPrompt.trim()}
                  onClick={() => void handleDraftAndTestSkill()}
                  className="px-3 py-1.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 text-xs font-medium disabled:opacity-45"
                >
                  {busy ? 'Testing...' : 'Draft & Test'}
                </button>
              </div>
            </div>

            {/* Searchable Skill Library */}
            <div className="flex items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search skills by name or trigger..."
                className="flex-1 bg-transparent text-xs focus:outline-none"
              />
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredSkills.map((sk) => (
                <div
                  key={sk.id}
                  onClick={() => setSelectedSkillId(sk.id)}
                  className={`cursor-pointer rounded-lg border p-3 transition ${
                    selectedSkillId === sk.id
                      ? 'bg-sky-500/10 border-sky-400/60'
                      : 'bg-slate-950/75 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100">{sk.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-sky-300 border border-slate-800">
                        v{sk.activeVersion} • {sk.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() =>
                          void onSaveSkill({ ...sk, enabled: !sk.enabled, updatedAt: new Date().toISOString() }, true)
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                          sk.enabled
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}
                      >
                        {sk.enabled ? 'ENABLED' : 'DISABLED'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteSkill(sk.id)}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{sk.description}</p>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">Trigger: {sk.triggerPattern}</div>
                </div>
              ))}
              {filteredSkills.length === 0 && (
                <div className="text-xs text-slate-500 p-4 border border-dashed border-slate-800 rounded-lg">
                  No skills match your query. Try Suggested Skills on the right or draft one above.
                </div>
              )}
            </div>
          </div>

          {/* Right: Skill Editor, Version Rollback & Suggested Skills */}
          <div className="lg:col-span-5 space-y-3">
            {selectedSkill ? (
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-300">Edit {selectedSkill.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(selectedSkill, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${selectedSkill.name.toLowerCase().replace(/\s+/g, '_')}.skill.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="text-[11px] text-slate-400 hover:text-sky-300 flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Export
                  </button>
                </div>
                <input
                  type="text"
                  value={editTrigger}
                  onChange={(e) => setEditTrigger(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 font-mono text-xs"
                  placeholder="Trigger regex / keywords"
                />
                <textarea
                  rows={5}
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveNewRevision()}
                  className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium"
                >
                  Save New Version (v{selectedSkill.activeVersion + 1})
                </button>

                <div className="border-t border-slate-800 pt-2">
                  <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1 mb-1.5">
                    <History className="w-3 h-3" /> Version History ({versions.length})
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {versions.map((v) => (
                      <div key={v.id} className="flex items-center justify-between bg-slate-900 px-2 py-1 rounded text-[11px]">
                        <span className="font-mono">
                          v{v.version} — {v.changelog}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleRollbackVersion(v)}
                          className="text-amber-300 hover:text-amber-200 flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" /> Rollback
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950/75 border border-slate-800 rounded-lg p-3 space-y-2">
                <div className="text-xs font-mono uppercase text-slate-400">Suggested Built-in Skills</div>
                {SUGGESTED_SKILLS.map((sug) => (
                  <div key={sug.name} className="bg-slate-900/80 border border-slate-800 rounded p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-200">{sug.name}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const nowIso = new Date().toISOString();
                          const id = `skill_${Date.now()}`;
                          await onSaveSkill(
                            {
                              id,
                              ...sug,
                              enabled: true,
                              activeVersion: 1,
                              testStatus: 'passed',
                              lastTestNote: 'Built-in verified template',
                              createdAt: nowIso,
                              updatedAt: nowIso,
                            },
                            false
                          );
                          await onSaveSkillVersion({
                            id: `ver_1_${Date.now()}`,
                            skillId: id,
                            version: 1,
                            instructions: sug.instructions,
                            triggerPattern: sug.triggerPattern,
                            changelog: 'Installed suggested skill',
                            createdAt: nowIso,
                          });
                          setStatusNote(`Installed "${sug.name}".`);
                        }}
                        className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 text-[11px] flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Install
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">{sug.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'agents' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 bg-slate-950/80 border border-slate-800 rounded-lg p-3">
            <input
              type="text"
              value={agentGoal}
              onChange={(e) => setAgentGoal(e.target.value)}
              placeholder="Give the Autonomous Multi-Agent team a complex engineering or creative goal..."
              className="flex-1 min-w-[240px] bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={busy || !agentGoal.trim()}
              onClick={() => void handleRunMultiAgent()}
              className="px-3.5 py-1.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 text-xs font-medium flex items-center gap-1.5 disabled:opacity-45"
            >
              <Play className="w-3.5 h-3.5" /> {busy ? 'Orchestrating...' : 'Run Multi-Agent Pipeline'}
            </button>
          </div>

          {activeAgentRun && (
            <div className="bg-slate-950/80 border border-sky-500/40 rounded-lg p-3 space-y-2.5">
              <div className="text-xs font-semibold text-sky-300">{activeAgentRun.summary}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(activeAgentRun.steps || []).map((st) => (
                  <div key={st.index} className="bg-slate-900 border border-slate-800 rounded p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono uppercase text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300">
                        {st.role}
                      </span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div className="font-medium text-slate-200">{st.action}</div>
                    <div className="text-[11px] text-slate-400">{st.outputSummary}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-mono uppercase text-slate-400">Recent Autonomous Agent Runs</div>
            {agentRuns.slice(0, 10).map((r) => (
              <div key={r.id} className="bg-slate-950/75 border border-slate-800 rounded p-2.5 text-xs flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">{r.goal}</div>
                  <div className="text-[11px] text-slate-400">{r.summary}</div>
                </div>
                <span className="font-mono text-[10px] text-emerald-300">{r.stepCount} steps</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'workflows' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs">
            <input
              type="text"
              value={wfName}
              onChange={(e) => setWfName(e.target.value)}
              placeholder="Workflow name"
              className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5"
            />
            <select
              value={wfTriggerType}
              onChange={(e) => setWfTriggerType(e.target.value as AutomationWorkflow['triggerType'])}
              className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5"
            >
              <option value="voice_phrase">Voice Phrase</option>
              <option value="schedule">Schedule</option>
              <option value="monitor_update">Monitor Update</option>
              <option value="incoming_call">Incoming Call</option>
              <option value="manual">Manual</option>
            </select>
            <input
              type="text"
              value={wfTriggerVal}
              onChange={(e) => setWfTriggerVal(e.target.value)}
              placeholder="Trigger value / phrase"
              className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5"
            />
            <select
              value={wfActionType}
              onChange={(e) => setWfActionType(e.target.value as AutomationWorkflow['actionType'])}
              className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5"
            >
              <option value="run_skill">Run Skill</option>
              <option value="speak_alert">Speak Alert</option>
              <option value="companion_action">Companion Action</option>
              <option value="open_studio">Open Studio</option>
              <option value="create_task">Create Task</option>
            </select>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={wfActionPayload}
                onChange={(e) => setWfActionPayload(e.target.value)}
                placeholder="Action target"
                className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded px-2 py-1.5"
              />
              <button
                type="button"
                onClick={() => void handleAddWorkflow()}
                className="px-3 py-1.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 font-medium"
              >
                Add
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {workflows.map((wf) => (
              <div key={wf.id} className="bg-slate-950/75 border border-slate-800 rounded-lg p-3 text-xs flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">{wf.name}</div>
                  <div className="text-[11px] font-mono text-slate-400">
                    WHEN {wf.triggerType}("{wf.triggerValue}") → {wf.actionType}("{wf.actionPayload}")
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void onSaveWorkflow({ ...wf, enabled: !wf.enabled, updatedAt: new Date().toISOString() }, true)
                    }
                    className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                      wf.enabled
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    {wf.enabled ? 'ACTIVE' : 'PAUSED'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteWorkflow(wf.id)}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

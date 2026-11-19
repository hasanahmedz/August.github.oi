import React from 'react';
import { ArrowUpRight, Check, RotateCcw } from 'lucide-react';
import { BUILD_PHASES } from '../data/blueprintData';

interface BuildGuideViewProps {
  completedStepIds: string[];
  onToggleStep: (stepId: string) => void;
  onResetProgress: () => void;
  onTestInSandbox: (prompt: string) => void;
}

export const BuildGuideView: React.FC<BuildGuideViewProps> = ({
  completedStepIds,
  onToggleStep,
  onResetProgress,
  onTestInSandbox,
}) => {
  const totalSteps = BUILD_PHASES.reduce((acc, phase) => acc + phase.steps.length, 0);
  const completedCount = completedStepIds.length;
  const percent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Header + Progress Summary */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-slate-900">
            Step-by-Step Build Roadmap
          </h1>
          <p className="mt-2 text-[15px] text-slate-600 leading-relaxed">
            Build your personal assistant incrementally—from a secure server text loop to function calling, persistent memory, voice I/O, and always-on wake-word triggers.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-xs text-slate-500">Build Progress</div>
            <div className="text-base font-mono font-semibold tabular-nums text-slate-900">
              {completedCount} / {totalSteps} steps ({percent}%)
            </div>
          </div>

          {completedCount > 0 && (
            <button
              type="button"
              onClick={onResetProgress}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-transform duration-300 origin-left"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>

      {/* Phase List */}
      <div className="space-y-6">
        {BUILD_PHASES.map((phase) => {
          const phaseDoneCount = phase.steps.filter((s) =>
            completedStepIds.includes(s.id)
          ).length;
          const phaseComplete = phaseDoneCount === phase.steps.length;

          return (
            <section
              key={phase.id}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-medium text-slate-700">{phase.index}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{phase.estimatedTime}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-medium tabular-nums ${
                        phaseComplete ? 'text-emerald-700' : 'text-slate-600'
                      }`}
                    >
                      {phaseDoneCount}/{phase.steps.length} complete
                    </span>
                  </div>
                  <h2 className="mt-1 text-xl font-display font-bold text-slate-900">
                    {phase.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">{phase.objective}</p>
                </div>

                <button
                  type="button"
                  onClick={() => onTestInSandbox(phase.sandboxPrompt)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  <span>Test in Live Sandbox</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Checklist Steps */}
              <div className="divide-y divide-slate-100">
                {phase.steps.map((step) => {
                  const checked = completedStepIds.includes(step.id);
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => onToggleStep(step.id)}
                      className="w-full py-3 flex items-start gap-3.5 text-left group"
                    >
                      <span
                        className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          checked
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white border-slate-300 group-hover:border-slate-400'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <div
                          className={`text-sm font-semibold ${
                            checked ? 'line-through text-slate-400' : 'text-slate-900'
                          }`}
                        >
                          {step.title}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                          {step.detail}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Verification Gate */}
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700 shrink-0">
                  Verification Check:
                </span>
                <span className="text-slate-600 flex-1">{phase.verificationCheck}</span>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

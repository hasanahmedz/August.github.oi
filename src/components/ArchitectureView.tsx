import React, { useState } from 'react';
import { ArrowRight, Check, Copy } from 'lucide-react';
import { ARCHITECTURE_LAYERS, STACK_PROFILES } from '../data/blueprintData';

interface ArchitectureViewProps {
  onOpenSandboxPrompt: (prompt: string) => void;
  onNavigateCode: () => void;
}

export const ArchitectureView: React.FC<ArchitectureViewProps> = ({
  onOpenSandboxPrompt,
  onNavigateCode,
}) => {
  const [selectedLayerId, setSelectedLayerId] = useState(ARCHITECTURE_LAYERS[2].id);
  const [selectedProfileId, setSelectedProfileId] = useState<'cloud' | 'hybrid' | 'local'>('hybrid');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const selectedLayer =
    ARCHITECTURE_LAYERS.find((l) => l.id === selectedLayerId) || ARCHITECTURE_LAYERS[0];
  const selectedProfile =
    STACK_PROFILES.find((p) => p.id === selectedProfileId) || STACK_PROFILES[1];

  const totalLatencyMs =
    selectedProfile.asrMs +
    selectedProfile.llmMs +
    selectedProfile.toolMs +
    selectedProfile.ttsMs;

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(selectedLayer.codeSnippet);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="max-w-3xl">
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-slate-900">
            The 5-Layer Architecture of a Jarvis-Class Assistant
          </h1>
          <p className="mt-2 text-[15px] text-slate-600 leading-relaxed">
            A real personal AI assistant is not a single prompt. It is a deterministic pipeline separating always-on local audio listening, streaming transcription, structured tool calling, persistent memory, and action connectors.
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateCode}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <span>Generate Starter Code</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Interactive 5-Layer Pipeline Strip */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {ARCHITECTURE_LAYERS.map((layer) => {
          const isSelected = layer.id === selectedLayer.id;
          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => setSelectedLayerId(layer.id)}
              className={`text-left p-4 rounded-xl border transition-colors flex flex-col justify-between gap-3 ${
                isSelected
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-900 hover:border-slate-300'
              }`}
            >
              <div>
                <div
                  className={`text-xs font-mono tabular-nums ${
                    isSelected ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {layer.index} · {layer.latencyTarget}
                </div>
                <div className="mt-1.5 text-sm font-semibold leading-snug">
                  {layer.name}
                </div>
              </div>
              <div
                className={`text-xs leading-relaxed ${
                  isSelected ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                {layer.role}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Layer Deep Dive */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 space-y-6">
            <div>
              <div className="text-xs font-mono text-slate-500 tabular-nums">
                Layer {selectedLayer.index} · Target Latency {selectedLayer.latencyTarget}
              </div>
              <h2 className="mt-1 text-2xl font-display font-bold text-slate-900">
                {selectedLayer.name}
              </h2>
              <p className="mt-3 text-[15px] text-slate-700 leading-relaxed">
                {selectedLayer.summary}
              </p>
            </div>

            <div className="pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-semibold text-slate-900 mb-2">
                  Cloud / API Options
                </h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  {selectedLayer.cloudStack.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-900 mb-2">
                  Local / Edge Options
                </h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  {selectedLayer.localStack.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-5 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-900 mb-2">
                Common Failure Modes to Guard Against
              </h3>
              <ul className="space-y-2 text-sm text-slate-700">
                {selectedLayer.failureModes.map((mode) => (
                  <li key={mode} className="leading-relaxed">
                    · {mode}
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-mono text-slate-500">
                {selectedLayer.dataContract}
              </span>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-950 text-slate-100 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">
                  Reference Implementation Pattern
                </span>
                <button
                  type="button"
                  onClick={handleCopySnippet}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors"
                >
                  {copiedSnippet ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedSnippet ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono text-slate-100">
                <code>{selectedLayer.codeSnippet}</code>
              </pre>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-500">
                Want to ask Jarvis about this layer or test it live?
              </p>
              <button
                type="button"
                onClick={() =>
                  onOpenSandboxPrompt(
                    `Explain how to implement "${selectedLayer.name}" in my personal assistant and what hardware or SDKs I should start with.`
                  )
                }
                className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap shrink-0"
              >
                Ask Live Assistant →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Latency & Deployment Trade-off Calculator */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-bold text-slate-900">
              Deployment Stack & Voice-to-Voice Latency Budget
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Compare how Cloud-First, Hybrid Edge, and Fully Local stacks affect response speed, privacy, and hardware cost.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 shrink-0">
            {STACK_PROFILES.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => setSelectedProfileId(profile.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  selectedProfileId === profile.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {profile.name}
              </button>
            ))}
          </div>
        </div>

        {/* Latency Breakdown Bar */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-slate-700">{selectedProfile.tagline}</span>
            <span className="text-lg font-mono font-bold tabular-nums text-slate-900">
              ~{totalLatencyMs} ms end-to-end
            </span>
          </div>

          <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
            <div
              style={{ width: `${(selectedProfile.asrMs / totalLatencyMs) * 100}%` }}
              className="bg-slate-800 h-full"
              title={`ASR: ${selectedProfile.asrMs}ms`}
            />
            <div
              style={{ width: `${(selectedProfile.llmMs / totalLatencyMs) * 100}%` }}
              className="bg-blue-600 h-full"
              title={`LLM Reasoning: ${selectedProfile.llmMs}ms`}
            />
            <div
              style={{ width: `${(selectedProfile.toolMs / totalLatencyMs) * 100}%` }}
              className="bg-emerald-600 h-full"
              title={`Tool Execution: ${selectedProfile.toolMs}ms`}
            />
            <div
              style={{ width: `${(selectedProfile.ttsMs / totalLatencyMs) * 100}%` }}
              className="bg-amber-500 h-full"
              title={`TTS First Byte: ${selectedProfile.ttsMs}ms`}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div>
              <div className="text-xs text-slate-500">Speech-to-Text</div>
              <div className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                {selectedProfile.asrMs} ms
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">LLM + Tool Loop</div>
              <div className="text-sm font-mono font-semibold tabular-nums text-blue-700">
                {selectedProfile.llmMs} ms
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Local Tool Action</div>
              <div className="text-sm font-mono font-semibold tabular-nums text-emerald-700">
                {selectedProfile.toolMs} ms
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">TTS Audio Start</div>
              <div className="text-sm font-mono font-semibold tabular-nums text-amber-700">
                {selectedProfile.ttsMs} ms
              </div>
            </div>
          </div>
        </div>

        {/* Profile Specs Row */}
        <div className="pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-xs font-medium text-slate-500">Estimated Operating Cost</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {selectedProfile.monthlyCostEstimate}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Hardware Requirement</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {selectedProfile.hardwareReq}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Privacy & Audio Boundary</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {selectedProfile.privacyNote}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

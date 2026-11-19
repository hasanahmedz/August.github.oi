import React, { useMemo, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import type { ToolGroupId } from '../types/assistant';
import { TOOL_GROUP_INFO } from '../data/blueprintData';
import { DESKTOP_COMPANION_SCRIPT } from '../utils/computerControl';

type RuntimeTarget = 'typescript' | 'python' | 'companion';

export const CodeGeneratorView: React.FC = () => {
  const [runtime, setRuntime] = useState<RuntimeTarget>('typescript');
  const [includeTts, setIncludeTts] = useState(true);
  const [selectedTools, setSelectedTools] = useState<ToolGroupId[]>([
    'tasks',
    'timers',
    'memory',
    'search',
  ]);
  const [copied, setCopied] = useState(false);

  const toggleTool = (id: ToolGroupId) => {
    setSelectedTools((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const generatedCode = useMemo(() => {
    if (runtime === 'companion') {
      return DESKTOP_COMPANION_SCRIPT;
    }

    const hasSearch = selectedTools.includes('search');
    const customGroups = selectedTools.filter((t) => t !== 'search');

    if (runtime === 'typescript') {
      const declBlocks: string[] = [];
      if (customGroups.includes('tasks')) {
        declBlocks.push(`  {
    name: "create_task",
    description: "Create a personal task or reminder.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Task description" },
        priority: { type: Type.STRING, description: "low, medium, or high" },
      },
      required: ["title"],
    },
  }`);
      }
      if (customGroups.includes('timers')) {
        declBlocks.push(`  {
    name: "set_timer",
    description: "Start a countdown timer in minutes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING, description: "Timer name" },
        minutes: { type: Type.NUMBER, description: "Duration in minutes" },
      },
      required: ["label", "minutes"],
    },
  }`);
      }
      if (customGroups.includes('memory')) {
        declBlocks.push(`  {
    name: "remember_fact",
    description: "Save an enduring user preference or project fact.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        key: { type: Type.STRING },
        value: { type: Type.STRING },
      },
      required: ["key", "value"],
    },
  }`);
      }
      if (customGroups.includes('environment')) {
        declBlocks.push(`  {
    name: "set_room_lighting",
    description: "Adjust studio light brightness (0-100) and color temperature.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        brightness: { type: Type.NUMBER },
        colorTemperature: { type: Type.STRING },
      },
      required: ["brightness"],
    },
  }`);
      }

      const toolsArrayParts: string[] = [];
      if (hasSearch) toolsArrayParts.push(`{ googleSearch: {} }`);
      if (declBlocks.length > 0) toolsArrayParts.push(`{ functionDeclarations }`);

      const ttsEndpoint = includeTts
        ? `
app.post("/api/tts", async (req, res) => {
  const { text } = req.body as { text: string };
  const speech = await ai.models.generateContent({
    model: "gemini-3.8-flash-lite-tts",
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
      },
    },
  });
  const audioBase64 = speech.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  res.json({ audioBase64, mimeType: "audio/wav" });
});`
        : '';

      return `// server.ts — Minimal Jarvis Backend (Node.js + Express + @google/genai)
// Install: npm install express dotenv @google/genai
// Run: GEMINI_API_KEY="your-key" npx tsx server.ts

import "dotenv/config";
import express from "express";
import { GoogleGenAI, Type, type Content, type FunctionDeclaration } from "@google/genai";

const app = express();
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Persistent workspace store (swap for SQLite / Postgres in production)
const memoryStore = new Map<string, string>();
const taskList: Array<{ title: string; priority: string }> = [];

${
  declBlocks.length > 0
    ? `const functionDeclarations: FunctionDeclaration[] = [\n${declBlocks.join(',\n')}\n];`
    : 'const functionDeclarations: FunctionDeclaration[] = [];'
}

function executeTool(name: string, args: Record<string, unknown>) {
  if (name === "create_task") {
    const task = { title: String(args.title), priority: String(args.priority || "medium") };
    taskList.push(task);
    return { status: "created", task };
  }
  if (name === "set_timer") {
    return { status: "started", label: args.label, minutes: args.minutes };
  }
  if (name === "remember_fact") {
    memoryStore.set(String(args.key), String(args.value));
    return { status: "stored", key: args.key, value: args.value };
  }
  if (name === "set_room_lighting") {
    // Forward to Home Assistant or Philips Hue webhook here
    return { status: "applied", ...args };
  }
  return { status: "unknown_tool" };
}

app.post("/api/chat", async (req, res) => {
  const { message, history = [] } = req.body as {
    message: string;
    history?: Content[];
  };

  const memoryContext = Array.from(memoryStore.entries())
    .map(([k, v]) => \`- \${k}: \${v}\`)
    .join("\\n");

  const config = {
    systemInstruction: \`You are Jarvis, a concise personal AI assistant.
Known User Context:
\${memoryContext || "None yet."}\`,
    ${toolsArrayParts.length > 0 ? `tools: [${toolsArrayParts.join(', ')}],` : ''}
    ${
      hasSearch && declBlocks.length > 0
        ? 'toolConfig: { includeServerSideToolInvocations: true },'
        : ''
    }
  };

  const contents: Content[] = [
    ...history,
    { role: "user", parts: [{ text: message }] },
  ];

  let response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents,
    config,
  });

  // Agentic tool-calling loop (capped at 4 steps)
  let steps = 0;
  while (response.functionCalls?.length && steps < 4) {
    steps += 1;
    const modelTurn = response.candidates?.[0]?.content;
    if (modelTurn) contents.push(modelTurn);

    const toolParts = response.functionCalls.map((call) => ({
      functionResponse: {
        id: call.id,
        name: call.name!,
        response: executeTool(call.name!, (call.args || {}) as Record<string, unknown>),
      },
    }));

    contents.push({ role: "user", parts: toolParts });
    response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents,
      config,
    });
  }

  res.json({ reply: response.text, tasks: taskList });
});
${ttsEndpoint}

app.listen(3000, () => console.log("Jarvis server running on http://localhost:3000"));
`;
    }

    // Python + FastAPI starter
    const pyTools: string[] = [];
    if (customGroups.includes('tasks')) {
      pyTools.push(`def create_task(title: str, priority: str = "medium") -> dict:
    """Create a personal task or reminder."""
    task = {"title": title, "priority": priority}
    task_list.append(task)
    return {"status": "created", "task": task}`);
    }
    if (customGroups.includes('timers')) {
      pyTools.push(`def set_timer(label: str, minutes: float) -> dict:
    """Start a countdown timer in minutes."""
    return {"status": "started", "label": label, "minutes": minutes}`);
    }
    if (customGroups.includes('memory')) {
      pyTools.push(`def remember_fact(key: str, value: str) -> dict:
    """Persist an enduring user preference or fact."""
    memory_store[key] = value
    return {"status": "stored", "key": key, "value": value}`);
    }
    if (customGroups.includes('environment')) {
      pyTools.push(`def set_room_lighting(brightness: int, color_temperature: str = "daylight") -> dict:
    """Control studio light brightness (0-100) and color temperature."""
    return {"status": "applied", "brightness": brightness, "color_temperature": color_temperature}`);
    }

    const toolNames: string[] = [];
    if (customGroups.includes('tasks')) toolNames.push('create_task');
    if (customGroups.includes('timers')) toolNames.push('set_timer');
    if (customGroups.includes('memory')) toolNames.push('remember_fact');
    if (customGroups.includes('environment')) toolNames.push('set_room_lighting');
    if (hasSearch) toolNames.push('{"google_search": {}}');

    return `# main.py — Minimal Jarvis Backend (Python + FastAPI + google-genai)
# Install: pip install fastapi uvicorn google-genai python-dotenv
# Run: GEMINI_API_KEY="your-key" uvicorn main:app --port 3000

import os
from fastapi import FastAPI
from pydantic import BaseModel
from google import genai
from google.genai import types

app = FastAPI()
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

memory_store: dict[str, str] = {}
task_list: list[dict[str, str]] = []

${pyTools.join('\n\n')}

class ChatRequest(BaseModel):
    message: str

@app.post("/api/chat")
def chat(req: ChatRequest):
    memory_context = "\\n".join(f"- {k}: {v}" for k, v in memory_store.items()) or "None yet."
    system_prompt = f"""You are Jarvis, a calm and concise personal AI assistant.
Known User Context:
{memory_context}"""

    # Automatic function calling + optional search grounding
    response = client.models.generate_content(
        model="gemini-4-hydrogen",
        contents=req.message,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            ${toolNames.length > 0 ? `tools=[${toolNames.join(', ')}],` : ''}
        ),
    )
    return {"reply": response.text, "tasks": task_list}
${
  includeTts
    ? `
@app.post("/api/tts")
def synthesize(req: ChatRequest):
    speech = client.models.generate_content(
        model="gemini-3.8-flash-lite-tts",
        contents=req.message,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Charon")
                )
            ),
        ),
    )
    part = speech.candidates[0].content.parts[0]
    return {"audio_base64": part.inline_data.data, "mime_type": "audio/wav"}`
    : ''
}
`;
  }, [runtime, includeTts, selectedTools]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownload = () => {
    const filename =
      runtime === 'typescript'
        ? 'jarvis-server.ts'
        : runtime === 'python'
        ? 'jarvis_main.py'
        : 'jarvis-companion.mjs';
    const blob = new Blob([generatedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-slate-900">
            Runnable Starter Code Generator
          </h1>
          <p className="mt-2 text-[15px] text-slate-600 leading-relaxed">
            Configure your runtime and tool modules to generate a clean, production-structured backend using the modern Gemini SDK with automatic tool orchestration.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Code'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              Download{' '}
              {runtime === 'typescript'
                ? 'jarvis-server.ts'
                : runtime === 'python'
                ? 'jarvis_main.py'
                : 'jarvis-companion.mjs'}
            </span>
          </button>
        </div>
      </div>

      {/* Config + Code Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Config Sidebar */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-2.5">Backend Runtime</h2>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setRuntime('typescript')}
                className={`py-2 px-1 text-[11px] font-medium rounded-md transition-colors ${
                  runtime === 'typescript'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Node.js + TS
              </button>
              <button
                type="button"
                onClick={() => setRuntime('python')}
                className={`py-2 px-1 text-[11px] font-medium rounded-md transition-colors ${
                  runtime === 'python'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Python FastAPI
              </button>
              <button
                type="button"
                onClick={() => setRuntime('companion')}
                className={`py-2 px-1 text-[11px] font-medium rounded-md transition-colors ${
                  runtime === 'companion'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                PC Bridge
              </button>
            </div>
          </div>

          <div className="pt-5 border-t border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 mb-2.5">Included Capabilities</h2>
            <div className="divide-y divide-slate-100">
              {TOOL_GROUP_INFO.map((tool) => {
                const checked = selectedTools.includes(tool.id);
                return (
                  <label
                    key={tool.id}
                    className="py-2.5 flex items-start justify-between gap-3 cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-medium text-slate-900">{tool.label}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {tool.functions.join(', ')}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTool(tool.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                  </label>
                );
              })}

              <label className="py-2.5 flex items-start justify-between gap-3 cursor-pointer">
                <div>
                  <div className="text-xs font-medium text-slate-900">
                    Speech Output Endpoint (TTS)
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    gemini-3.8-flash-lite-tts WAV synthesis
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeTts}
                  onChange={() => setIncludeTts((v) => !v)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
              </label>
            </div>
          </div>

          <div className="pt-5 border-t border-slate-100 space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">Next Integration Step</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Once your backend server responds on port 3000, pair it with an always-on local listener (such as{' '}
              <span className="font-mono text-slate-800">openWakeWord</span> +{' '}
              <span className="font-mono text-slate-800">Silero VAD</span>) that POSTs transcribed audio directly to{' '}
              <span className="font-mono text-slate-800">/api/chat</span>.
            </p>
          </div>
        </aside>

        {/* Right Code Output */}
        <section className="lg:col-span-8 rounded-xl border border-slate-200 bg-slate-950 text-slate-100 overflow-hidden">
          <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono">
              {runtime === 'typescript'
                ? 'server.ts'
                : runtime === 'python'
                ? 'main.py'
                : 'jarvis-companion.mjs'}{' '}
              · {generatedCode.split('\n').length} lines
            </span>
            <span className="font-mono text-slate-500">
              {runtime === 'typescript'
                ? '@google/genai'
                : runtime === 'python'
                ? 'google-genai'
                : 'ws://127.0.0.1:4849'}
            </span>
          </div>
          <pre className="p-5 overflow-x-auto text-[13px] leading-relaxed font-mono text-slate-100 max-h-[680px]">
            <code>{generatedCode}</code>
          </pre>
        </section>
      </div>
    </div>
  );
};

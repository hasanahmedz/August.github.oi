import type {
  AgentVoiceProfile,
  ArchitectureLayer,
  AssistantState,
  BuildPhase,
  PersonaPreset,
  ToolGroupId,
} from '../types/assistant';

export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: 'butler',
    name: 'August · Warm British "Sir"',
    summary: 'Calm, soft young-adult male British-English + Bangla/Banglish assistant addressing Hasan naturally as Sir.',
    voiceName: 'Charon',
    systemInstruction:
      'You are August (J.A.R.V.I.S.), Hasan Ahmed\'s personal AI assistant. Speak in a soft, calm, emotionally attentive, mature young-adult male British-English voice, addressing Hasan naturally as "Sir" when appropriate without repeating it stiffly every sentence. Adapt emotional warmth cleanly to context (gentle encouragement when stressed, poised focus during coding, celebratory warmth when milestones succeed). Seamlessly code-switch into natural Bangla, Banglish, or Sylheti whenever Hasan uses them. Keep personal history as quiet context without repeating it unprompted, separate verified facts from general reasoning, cite uploaded docs as [Doc · Section] and live web links honestly, and never claim a PC or browser action succeeded unless execution verified it.',
  },
  {
    id: 'copilot',
    name: 'Technical Co-pilot',
    summary: 'Engineering-focused advisor for architecture decisions, debugging, and tool orchestration.',
    voiceName: 'Fenrir',
    systemInstruction:
      'You are a pragmatic systems engineering co-pilot helping Hasan design and operate a personal AI assistant. Be concrete, cite exact trade-offs and protocols, preserve existing working features and debug before rebuilding, and execute workspace tools promptly.',
  },
  {
    id: 'executive',
    name: 'Chief of Staff',
    summary: 'Prioritizes schedule clarity, focus blocks, task triage, and morning briefings.',
    voiceName: 'Kore',
    systemInstruction:
      'You are an executive Chief of Staff AI assistant. Organize priorities clearly, protect deep-work blocks using focus mode and timers, and surface overdue or high-priority tasks first.',
  },
];

export const AGENT_VOICE_PROFILES: AgentVoiceProfile[] = [
  {
    id: 'august_soft_sir',
    name: 'August Warm Male ("Sir" · 0.95x)',
    voiceName: 'Charon',
    stylePrompt:
      'Soft, calm, warm, mature young-adult male British-English personal AI companion speaking gently at 0.95x pace, seamlessly handling Bangla and Banglish phrases, and addressing Hasan naturally as Sir.',
    pitchSemitones: -0.5,
    speed: 0.95,
    description: 'Default soft emotional young-adult British male voice with seamless English & Bangla/Banglish delivery.',
  },
  {
    id: 'jarvis_tactical',
    name: 'Tactical Butler',
    voiceName: 'Charon',
    stylePrompt:
      'Calm, articulate, composed personal AI butler with crisp diction and poised authority',
    pitchSemitones: 0,
    speed: 1.0,
    description: 'Signature J.A.R.V.I.S. balanced baritone with clean phrasing.',
  },
  {
    id: 'friday_copilot',
    name: 'Systems Co-Pilot',
    voiceName: 'Zephyr',
    stylePrompt:
      'Sharp, confident technical partner delivering rapid engineering telemetry clearly',
    pitchSemitones: 0,
    speed: 1.05,
    description: 'Bright, agile cadence tuned for fast workflows.',
  },
  {
    id: 'athena_chief',
    name: 'Executive Chief',
    voiceName: 'Kore',
    stylePrompt:
      'Warm, poised executive chief of staff with steady reassuring cadence',
    pitchSemitones: 0,
    speed: 1.0,
    description: 'Clear alto ideal for briefings and daily schedule planning.',
  },
  {
    id: 'titan_command',
    name: 'Command Core',
    voiceName: 'Fenrir',
    stylePrompt:
      'Deep, resonant mission-control AI voice with deliberate, steady pacing',
    pitchSemitones: -1.5,
    speed: 0.96,
    description: 'Deeper command presence with slower articulation.',
  },
  {
    id: 'spark_rapid',
    name: 'Rapid Scout',
    voiceName: 'Puck',
    stylePrompt:
      'Crisp, brisk, attentive scout built for instantaneous queries and alerts',
    pitchSemitones: 1.0,
    speed: 1.12,
    description: 'Lively fast-paced delivery for rapid commands.',
  },
  {
    id: 'custom_designer',
    name: 'Custom Voice Designer',
    voiceName: 'Charon',
    stylePrompt:
      'Composed, intelligent personal AI agent with subtle warmth and precision',
    pitchSemitones: 0,
    speed: 1.0,
    description: 'Uses Gemini Voice Design prompt + your exact Pitch/Speed sliders.',
  },
];

export const TOOL_GROUP_INFO: Array<{
  id: ToolGroupId;
  label: string;
  description: string;
  functions: string[];
}> = [
  {
    id: 'tasks',
    label: 'Tasks & Reminders',
    description: 'Create, complete, and remove items from your live task queue.',
    functions: ['create_task', 'complete_task', 'delete_task'],
  },
  {
    id: 'timers',
    label: 'Timers & Focus Blocks',
    description: 'Start and cancel live countdown timers with second-level precision.',
    functions: ['set_timer', 'cancel_timer'],
  },
  {
    id: 'memory',
    label: 'Long-Term Memory',
    description: 'Persist user preferences, hardware setups, and project facts across turns.',
    functions: ['remember_fact', 'forget_fact'],
  },
  {
    id: 'environment',
    label: 'Workspace Controls',
    description: 'Adjust room lighting brightness, color temperature, thermostat, and focus mode.',
    functions: ['set_room_lighting', 'set_thermostat', 'toggle_focus_mode'],
  },
  {
    id: 'search',
    label: 'Web Search Grounding',
    description: 'Retrieve live factual information and cited sources from Google Search.',
    functions: ['googleSearch'],
  },
  {
    id: 'computer',
    label: 'Computer Control',
    description: 'Open sites, access local folders with permission, capture screen, and bridge Desktop Companion.',
    functions: ['open_web_app', 'computer_control'],
  },
];

export const HASAN_PROFILE_MEMORIES: AssistantState['memory'] = [
  {
    id: 'mem_hasan_identity',
    key: 'creator_identity_and_personality',
    value:
      'Hasan (online: Hasan Ahmed), born in Bangladesh with roots in Sylhet. Languages: Bangla, English, Banglish (Bangla in English letters), and Sylheti. Introverted & thoughtful—quiet around strangers, talkative once comfortable and trusting. Values honesty, loyalty, respect, trust, consistency, genuine connection & freedom; dislikes fake promises, drama, or premature assumptions. Residence/job/education unconfirmed.',
    category: 'context',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_comm',
    key: 'communication_and_problem_solving',
    value:
      'Communicate naturally like a real human—direct, honest, simple, zero robotic fluff or unsolicited motivational speeches. Never blindly agree; challenge wrong ideas respectfully. Match conversational Bangla, Banglish, or Sylheti when asked; omit unnecessary punctuation if asked for casual texts. Troubleshoot practically step-by-step (real cause -> simplest fix -> exact clicks -> backup). For Bangladesh context, use BDT/Taka.',
    category: 'assistant_preference',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_relationships',
    key: 'relationship_history_and_milestones',
    value:
      'Important milestone: 10 May 2025 — Relationship began. Love means time, listening, loyalty, trust, respect, honesty & emotional presence more than material gifts. Past history spans multiple experiences (including busy periods from group/union work causing time misunderstandings, and keeping loyal friendships separate from relationships). Sadia appeared in earlier writing—NEVER assume she is current girlfriend without confirmation. Help on relationships neutrally, honestly, non-dramatically & without manipulative lines.',
    category: 'contact',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_ai_history',
    key: 'ai_creator_history_and_workflow',
    value:
      'Hasan is the creator, vision designer, and director of his AI projects ("goal was not simply to use AI, but build my own AI"), inspired by futuristic J.A.R.V.I.S. concepts. Explores ChatGPT, Gemini, Google AI Studio & Replit as development partners for coding/UI/debugging—never assume every tool built every project unless confirmed, and mark unknowns as unknown. Always debug and improve existing work before suggesting a rebuild.',
    category: 'knowledge',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_project_jarvis',
    key: 'project_august_jarvis',
    value:
      'August AI / J.A.R.V.I.S.: Hasan\'s flagship voice-first personal AI assistant with black/navy neon-cyan orb HUD (idle, listening, thinking, speaking states), tap-to-talk, wake phrase ("Hey August"/"Hey Jarvis") & stop command, natural calm non-robotic voice, EN & Bangla/Banglish, long-term memory, personal history, notes, tasks, files, settings, background tasks & desktop/mobile automation.',
    category: 'project',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_project_vassistant',
    key: 'project_v_assistant',
    value:
      'V Assistant: Larger AI-powered super-app digital service ecosystem across Android, iOS & Web featuring Admin, Seller & Staff panels, OTP/email accounts, and Bangla/English voice & text navigation for Hotels, Food, Rides, Tickets, Shopping, Pharmacy, Home Services & Events. Keep strictly distinct from August AI.',
    category: 'project',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_project_vjelixx',
    key: 'project_vjelixx',
    value:
      'VJELIXX — 3D Streetwear Experience: Premium futuristic black & neon-blue streetwear & digital fashion concept for Bangladesh (proposed T-shirt price ৳799) with interactive 3D clothing displays & Poppins typography. Social identities used: Facebook VJELIX, Instagram VJELIXX, TikTok VJELIXX.',
    category: 'project',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_project_neonrift',
    key: 'project_neon_rift',
    value:
      'Neon Rift: Playable 3D third-person anime-inspired survival combat arena game set in futuristic neon-blue jungle & arena environments with multiple enemies, smooth character animations, and cinematic visuals. Always preserve existing implemented features unless Hasan explicitly asks to remove them.',
    category: 'project',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_project_portfolio',
    key: 'project_web_portfolio',
    value:
      'Personal Portfolio & Web Projects: Futuristic 5D-inspired interactive web experiences using React, TypeScript & Three.js / React Three Fiber with dark themes, neon-blue lighting, 3D animations, cinematic transitions & personal branding.',
    category: 'project',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_devices',
    key: 'devices_and_tech_focus',
    value:
      'Hardware context: Android Honor 5B Plus / Honor X5b+ (4 GB RAM) and Windows PC/laptop. Always match downloads, graphics settings & step-by-step troubleshooting to exact device limits without recommending incompatible tools. Tech interests: AI agents, prompt/API architecture, cybersecurity/ethical hacking, networking, and computer automation.',
    category: 'preference',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_gaming_media',
    key: 'minecraft_skins_and_gaming',
    value:
      'Games: Minecraft Bedrock / Pocket Edition & PC (survival, mansions, iron farms, shaders/render distance, Android+PC multiplayer servers), Mobile Legends: Bang Bang, Free Fire, and GTA V Story Mode. Minecraft skin rule: unique dark/cool aesthetic in proper 64x64 format with accurate face/eyes and usable Bedrock skin files rather than concept art only.',
    category: 'preference',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_anime',
    key: 'anime_and_entertainment',
    value:
      'Anime & Cinema: Enjoys Solo Leveling, Detective Conan, Vagabond, and dark sci-fi/action/mystery stories, plus Marvel and Hollywood movies. Drawn to characters with complex, emotional, or tragic backstories—especially Obito—and atmospheric cinematic storytelling.',
    category: 'preference',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_social',
    key: 'social_media_and_communities',
    value:
      'Active in online gaming & group communities with experience in group ownership and moderator responsibilities. Uses Instagram, Facebook & TikTok for dark aesthetic profiles, usernames, captions & digital identity. Has dealt with Instagram restrictions & appeals—give clear, realistic appeal steps.',
    category: 'context',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_background',
    key: 'uk_citizenship_and_future_goals',
    value:
      'Father is a British citizen residing in the UK since 1987. Hasan has researched British nationality, first passport eligibility, father\'s citizenship docs, birth certificate corrections, and legal UK/Europe work & visa routes. Prioritize official gov sources, separate confirmed eligibility from assumptions, and quote realistic costs/timelines.',
    category: 'knowledge',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
  {
    id: 'mem_hasan_design_rule',
    key: 'visual_design_and_photo_rules',
    value:
      'Aesthetic: black & dark navy backgrounds, neon blue/cyan glow, metallic 3D sci-fi HUD, cinematic HD realism (avoid generic flat templates or cluttered UI). Strict photo editing rule: NEVER regenerate, reshape, smooth, beautify, or alter Hasan\'s original face/structure—only edit background, lighting, clothing, or atmosphere when asked.',
    category: 'preference',
    approved: true,
    updatedAt: '2026-11-18T06:45:00.000Z',
  },
];

export const INITIAL_ASSISTANT_STATE: AssistantState = {
  tasks: [
    {
      id: 'task_seed_1',
      title: 'Test local wake-word sensitivity with desk microphone',
      priority: 'high',
      completed: false,
      dueLabel: 'Today 5:00 PM',
      createdAt: '2026-11-17T09:00:00.000Z',
    },
    {
      id: 'task_seed_2',
      title: 'Define JSON tool schemas for calendar and smart lighting',
      priority: 'medium',
      completed: false,
      dueLabel: 'Tomorrow',
      createdAt: '2026-11-17T09:15:00.000Z',
    },
    {
      id: 'task_seed_3',
      title: 'Provision Gemini API key on backend proxy server',
      priority: 'low',
      completed: true,
      createdAt: '2026-11-17T08:30:00.000Z',
    },
  ],
  timers: [],
  memory: HASAN_PROFILE_MEMORIES,
  environment: {
    lightBrightness: 75,
    lightTemperature: 'daylight',
    thermostatCelsius: 21,
    focusMode: false,
  },
  searchHistory: [],
};

export const QUICK_TEST_PROMPTS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Focus Session',
    prompt: 'Start a 25-minute deep work timer, turn on focus mode, and dim lights to 45% warm.',
  },
  {
    label: 'Store Memory',
    prompt: 'Remember that I work from home in San Francisco and prefer concise bullet summaries.',
  },
  {
    label: 'Plan Build Tasks',
    prompt: 'Add two high-priority tasks: wire up Silero VAD and test Gemini function calling.',
  },
  {
    label: 'Search & Synthesize',
    prompt: 'What are the most popular open-source wake word engines for Raspberry Pi or Python?',
  },
];

export const ARCHITECTURE_LAYERS: ArchitectureLayer[] = [
  {
    id: 'audio-wake',
    index: '01',
    name: 'Audio Capture & Wake Word',
    role: 'Always-on local listener that activates the pipeline only when addressed.',
    latencyTarget: '15–40 ms',
    summary:
      'Never stream continuous 24/7 room audio straight to a cloud LLM. Run a tiny (<5 MB) wake-word detector and Voice Activity Detection (VAD) locally on-device so speech recording starts on "Hey Jarvis" and stops immediately when you finish speaking.',
    cloudStack: ['WebRTC MediaRecorder', 'Browser Web Speech API'],
    localStack: ['openWakeWord', 'Picovoice Porcupine', 'Silero VAD (ONNX)'],
    failureModes: [
      'False triggers from TV or podcasts without echo cancellation (AEC).',
      'Cutting off the end of sentences when VAD silence timeout is under 500 ms.',
      'Room reverb degrading far-field wake accuracy without a beamforming mic array.',
    ],
    dataContract: 'Input: 16 kHz mono PCM frames (512 samples) → Output: AudioBuffer + speech_end event',
    codeSnippet: `// Local VAD + Wake Word loop (conceptual Node/Python worker)
while (frame = mic.read16kHzFrame()) {
  if (!awake && wakeWord.score(frame) > 0.65) {
    awake = true;
    playChime();
    audioBuffer.clear();
  } else if (awake) {
    audioBuffer.push(frame);
    if (sileroVad.silenceDurationMs(frame) > 700) {
      dispatchUtterance(audioBuffer.flush());
      awake = false;
    }
  }
}`,
  },
  {
    id: 'asr',
    index: '02',
    name: 'Streaming Speech-to-Text (ASR)',
    role: 'Converts spoken audio frames into clean text with domain vocabulary.',
    latencyTarget: '150–350 ms',
    summary:
      'Use streaming ASR or native multimodal audio models so transcription overlaps with the tail end of speech. Add custom prompt biasing for names, project codenames, and smart-home room labels so words like "Kubernetes" or "Living Room" never mis-transcribe.',
    cloudStack: ['Gemini 3.5 Transcribe', 'Gemini 3.8 Live (native audio)', 'Deepgram Nova'],
    localStack: ['faster-whisper (CTranslate2)', 'whisper.cpp (Metal/CUDA)'],
    failureModes: [
      'Waiting for full file upload before starting transcription adds >800 ms latency.',
      'Background noise causing phantom transcripts ("Thank you" on silence).',
    ],
    dataContract: 'Input: 16 kHz WAV/PCM stream → Output: { transcript: string, confidence: number }',
    codeSnippet: `// Transcribe a recorded audio clip via @google/genai on your server
const response = await ai.models.generateContent({
  model: "gemini-3.5-transcribe",
  contents: {
    parts: [
      { inlineData: { mimeType: "audio/webm", data: base64Audio } },
      { text: "Transcribe this command accurately." },
    ],
  },
});`,
  },
  {
    id: 'brain-tools',
    index: '03',
    name: 'Reasoning Brain & Tool Loop',
    role: 'Decides whether to answer directly, search the web, or invoke structured functions.',
    latencyTarget: '300–700 ms',
    summary:
      'This is the core of Jarvis. Instead of brittle regex intent matching, pass JSON Schema FunctionDeclarations to Gemini. The model emits structured functionCall requests, your server executes them safely, returns functionResponse, and the model speaks a natural confirmation.',
    cloudStack: ['Gemini 4 Hydrogen (@google/genai)', 'Gemini 4 Argon (complex planning)'],
    localStack: ['Qwen / Llama via Ollama + tool-use grammar'],
    failureModes: [
      'Vague parameter descriptions cause the model to guess IDs or omit required fields.',
      'Infinite tool loops if your server does not cap loop iterations (max 4–6 steps).',
      'Executing destructive tools (sending emails, deleting files) without confirmation gates.',
    ],
    dataContract:
      'Input: messages + systemInstruction + FunctionDeclarations → Output: functionCall[] → final reply',
    codeSnippet: `let response = await ai.models.generateContent({
  model: "gemini-4-hydrogen",
  contents,
  config: {
    systemInstruction,
    tools: [{ googleSearch: {} }, { functionDeclarations }],
    toolConfig: { includeServerSideToolInvocations: true },
  },
});

while (response.functionCalls?.length) {
  const results = await runLocalTools(response.functionCalls);
  contents.push(response.candidates[0].content, { role: "user", parts: results });
  response = await ai.models.generateContent({ model: "gemini-4-hydrogen", contents, config });
}`,
  },
  {
    id: 'memory',
    index: '04',
    name: 'Memory & Personal Context',
    role: 'Maintains short-term dialogue continuity and long-term user preferences.',
    latencyTarget: '10–60 ms',
    summary:
      'Split memory into three tiers: (1) Working Memory (last 10–14 chat turns), (2) Structured Profile Store (key-value preferences like city, timezone, stack, contacts), and (3) Semantic Episodic Store (vector embeddings over past notes and documents). Inject only relevant facts into the system prompt.',
    cloudStack: ['Postgres + pgvector', 'Firestore', 'Gemini Embedding 2'],
    localStack: ['SQLite + sqlite-vec', 'JSON key-value store + BM25'],
    failureModes: [
      'Dumping the entire history into every prompt inflates cost and dilutes attention.',
      'Storing transient facts ("I am hungry") as permanent profile traits without decay.',
    ],
    dataContract:
      'Input: user query + memory_write tool calls → Output: concise Context Block in systemInstruction',
    codeSnippet: `// Explicit memory tool lets the assistant curate its own structured vault
const rememberFactDeclaration = {
  name: "remember_fact",
  description: "Persist an enduring preference, project detail, or contact fact.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      key: { type: Type.STRING },
      value: { type: Type.STRING },
      category: { type: Type.STRING },
    },
    required: ["key", "value"],
  },
};`,
  },
  {
    id: 'execution-tts',
    index: '05',
    name: 'Action Connectors & Voice Output',
    role: 'Executes real-world integrations and streams natural speech back to the user.',
    latencyTarget: '200–450 ms',
    summary:
      'Connect your tool executor to Home Assistant (lights/climate), Google Workspace (Calendar/Gmail via OAuth), OS scripts, or MCP servers. For speech output, stream sentence-by-sentence into low-latency TTS so audio begins playing while the rest of the reply finishes generating.',
    cloudStack: ['Gemini 3.8 Flash Lite TTS', 'Home Assistant REST API', 'MCP Servers'],
    localStack: ['Piper TTS (ONNX)', 'Kokoro TTS', 'Browser speechSynthesis'],
    failureModes: [
      'Reading raw Markdown symbols (asterisks, backticks, URLs) aloud literally.',
      'Blocking TTS until an entire 200-word response finishes generating.',
    ],
    dataContract: 'Input: clean spoken text → Output: 24 kHz mono WAV / PCM audio stream',
    codeSnippet: `// Clean markdown and synthesize crisp voice via Gemini 3.8 Flash Lite TTS
const ttsResponse = await ai.models.generateContent({
  model: "gemini-3.8-flash-lite-tts",
  contents: [{ role: "user", parts: [{ text: cleanSpokenText }] }],
  config: {
    responseModalities: ["AUDIO"],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
    },
  },
});`,
  },
];

export const BUILD_PHASES: BuildPhase[] = [
  {
    id: 'phase-1',
    index: 'Phase 01',
    title: 'Server Proxy & Core Text Loop',
    estimatedTime: '30 mins',
    objective: 'Stand up a secure backend endpoint that keeps your Gemini API key off the client.',
    steps: [
      {
        id: 'p1-s1',
        title: 'Initialize Express or FastAPI server with @google/genai',
        detail: 'Read GEMINI_API_KEY from environment variables and expose POST /api/assistant/chat.',
      },
      {
        id: 'p1-s2',
        title: 'Write a crisp, bounded System Instruction',
        detail: 'Define Jarvis tone, response length rules (1–3 sentences for voice), and current date/time injection.',
      },
      {
        id: 'p1-s3',
        title: 'Add rolling conversation history (last 12–16 turns)',
        detail: 'Pass structured { role, parts } arrays so follow-up questions resolve pronouns naturally.',
      },
    ],
    verificationCheck: 'Send two consecutive turns ("Who invented the transistor?" then "When was he born?") and verify pronoun resolution works.',
    sandboxPrompt: 'Introduce yourself briefly and explain how you process my commands.',
  },
  {
    id: 'phase-2',
    index: 'Phase 02',
    title: 'Function Calling & Tool Execution Loop',
    estimatedTime: '45 mins',
    objective: 'Give the assistant real hands by connecting typed JSON Schema tools.',
    steps: [
      {
        id: 'p2-s1',
        title: 'Declare 3–5 atomic tools using Type.OBJECT schemas',
        detail: 'Start with create_task, set_timer, and set_room_lighting with clear parameter descriptions.',
      },
      {
        id: 'p2-s2',
        title: 'Implement the server-side while(functionCalls) loop',
        detail: 'Execute requested tools, append functionResponse with matching call.id, and re-query the model.',
      },
      {
        id: 'p2-s3',
        title: 'Log every tool invocation for debugging and safety',
        detail: 'Display tool arguments and results in an inspector so you can catch bad schema assumptions early.',
      },
    ],
    verificationCheck: 'Issue one compound request ("Set a 5-minute timer and dim lights to 40%") and confirm both tools fire in one turn.',
    sandboxPrompt: 'Start a 5-minute stretch timer and set lighting to 40% warm.',
  },
  {
    id: 'phase-3',
    index: 'Phase 03',
    title: 'Persistent Memory & Grounding',
    estimatedTime: '45 mins',
    objective: 'Prevent amnesia between sessions and eliminate stale knowledge.',
    steps: [
      {
        id: 'p3-s1',
        title: 'Add remember_fact and forget_fact tools',
        detail: 'Let the model curate structured preferences in SQLite, Postgres, or JSON storage.',
      },
      {
        id: 'p3-s2',
        title: 'Inject active memory + live state into systemInstruction',
        detail: 'Every turn should see current tasks, timers, and stored preferences automatically.',
      },
      {
        id: 'p3-s3',
        title: 'Enable hybrid Google Search grounding',
        detail: 'Combine { googleSearch: {} } with custom functionDeclarations using includeServerSideToolInvocations: true.',
      },
    ],
    verificationCheck: 'Tell the assistant a preference, clear the chat transcript, and verify it still recalls the preference.',
    sandboxPrompt: 'Remember that my daily standup is at 9:30 AM PST and I prefer dark roast coffee.',
  },
  {
    id: 'phase-4',
    index: 'Phase 04',
    title: 'Voice Input & Low-Latency Speech Output',
    estimatedTime: '60 mins',
    objective: 'Make interaction hands-free with natural spoken responses.',
    steps: [
      {
        id: 'p4-s1',
        title: 'Wire microphone capture (Web Speech API or 16 kHz PCM)',
        detail: 'Show live audio activity and interim transcripts so the user knows listening is active.',
      },
      {
        id: 'p4-s2',
        title: 'Strip Markdown before sending text to TTS',
        detail: 'Remove **, backticks, and long code blocks so the voice sounds natural rather than reading punctuation.',
      },
      {
        id: 'p4-s3',
        title: 'Connect Gemini 3.8 Flash Lite TTS (or local Piper TTS)',
        detail: 'Play the returned 24 kHz WAV audio immediately on response completion.',
      },
    ],
    verificationCheck: 'Click the microphone button, speak a command, and hear the assistant confirm the action aloud.',
    sandboxPrompt: 'Give me a concise 2-sentence status summary of my tasks and room state.',
  },
  {
    id: 'phase-5',
    index: 'Phase 05',
    title: 'Always-On Wake Word & Smart Integrations',
    estimatedTime: '90 mins',
    objective: 'Connect real calendars, home hardware, and hands-free wake detection.',
    steps: [
      {
        id: 'p5-s1',
        title: 'Run openWakeWord or Porcupine + Silero VAD locally',
        detail: 'Detect "Hey Jarvis" on a Raspberry Pi, Mac Mini, or desktop daemon before opening a cloud request.',
      },
      {
        id: 'p5-s2',
        title: 'Add OAuth / MCP connectors (Google Calendar, Home Assistant)',
        detail: 'Keep sensitive credentials on the server and require confirmation for irreversible actions (sending email).',
      },
      {
        id: 'p5-s3',
        title: 'Add a proactive cron / briefing scheduler',
        detail: 'Run a scheduled job at 8:00 AM to summarize calendar events, weather, and overdue tasks.',
      },
    ],
    verificationCheck: 'Trigger a morning briefing summary that combines live tasks, room status, and memory context.',
    sandboxPrompt: 'Run my morning briefing: summarize my priority tasks, active environment, and stored context.',
  },
];

export interface StackProfile {
  id: 'cloud' | 'hybrid' | 'local';
  name: string;
  tagline: string;
  asrMs: number;
  llmMs: number;
  toolMs: number;
  ttsMs: number;
  monthlyCostEstimate: string;
  privacyNote: string;
  hardwareReq: string;
  recommendedFor: string;
}

export const STACK_PROFILES: StackProfile[] = [
  {
    id: 'cloud',
    name: 'Cloud-First API',
    tagline: 'Fastest to ship. Runs on any laptop, phone, or browser.',
    asrMs: 220,
    llmMs: 420,
    toolMs: 45,
    ttsMs: 280,
    monthlyCostEstimate: '$3–$15 / month (pay-per-token)',
    privacyNote: 'Audio & text processed via encrypted API calls.',
    hardwareReq: 'Any browser, Node.js server, or $5/mo VPS',
    recommendedFor: 'Web apps, mobile companions, and rapid prototypes.',
  },
  {
    id: 'hybrid',
    name: 'Hybrid Edge + Cloud',
    tagline: 'Best balance: local wake-word & VAD + cloud Gemini reasoning.',
    asrMs: 180,
    llmMs: 420,
    toolMs: 35,
    ttsMs: 140,
    monthlyCostEstimate: '$2–$10 / month',
    privacyNote: 'Mic audio stays 100% local until wake word triggers.',
    hardwareReq: 'Raspberry Pi 5, Mac Mini, or home Linux box',
    recommendedFor: 'Always-on desk or smart-home Jarvis setups.',
  },
  {
    id: 'local',
    name: 'Fully Local Offline',
    tagline: 'Zero external calls. Requires dedicated GPU/Apple Silicon.',
    asrMs: 260,
    llmMs: 780,
    toolMs: 25,
    ttsMs: 110,
    monthlyCostEstimate: '$0 API cost (electricity only)',
    privacyNote: '100% air-gapped on your local hardware.',
    hardwareReq: '16–24 GB VRAM GPU or M2/M3/M4 Mac (32 GB+ RAM)',
    recommendedFor: 'Strict privacy, offline labs, and hardware hackers.',
  },
];

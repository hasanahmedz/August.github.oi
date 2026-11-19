import type { GeminiVoiceName, VoiceLanguageCode, VoiceMood } from '../types/assistant';

export interface AgentVoiceSpeakOptions {
  voiceName: GeminiVoiceName;
  stylePrompt?: string;
  useVoiceDesign?: boolean;
  mood?: VoiceMood;
  language?: VoiceLanguageCode;
  volume: number;
  speed: number;
  pitchSemitones: number;
  onSpeakingChange?: (speaking: boolean) => void;
  onAnalyserReady?: (analyser: AnalyserNode) => void;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export class AgentVoiceSpeaker {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private abortController: AbortController | null = null;
  private ttsCooldownUntilMs = 0;
  private queue: Array<{
    text: string;
    options: AgentVoiceSpeakOptions;
    resolve: () => void;
  }> = [];
  private processing = false;

  public get isQuotaCoolingDown(): boolean {
    return Date.now() < this.ttsCooldownUntilMs;
  }

  private ensureAudioGraph(volume: number): {
    ctx: AudioContext;
    gainNode: GainNode;
    analyser: AnalyserNode;
  } {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();
      this.gainNode = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.78;
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(
        Math.max(0, Math.min(1, volume)),
        this.ctx.currentTime
      );
    }

    return {
      ctx: this.ctx,
      gainNode: this.gainNode!,
      analyser: this.analyser!,
    };
  }

  public updateVolume(volume: number): void {
    if (this.ctx && this.gainNode && this.ctx.state !== 'closed') {
      this.gainNode.gain.setValueAtTime(
        Math.max(0, Math.min(1, volume)),
        this.ctx.currentTime
      );
    }
  }

  public stop(): void {
    this.queue.forEach((item) => item.resolve());
    this.queue = [];
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.activeSource) {
      try {
        this.activeSource.stop();
      } catch {
        // ignore already stopped
      }
      this.activeSource = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

  public speak(text: string, options: AgentVoiceSpeakOptions): Promise<void> {
    const cleaned = text.trim();
    if (!cleaned || options.volume <= 0.01) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push({ text: cleaned, options, resolve });
      if (!this.processing) {
        void this.drainQueue();
      }
    });
  }

  private async drainQueue(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      try {
        await this.playOne(next.text, next.options);
      } catch {
        // never crash queue
      } finally {
        next.resolve();
      }
    }
    this.processing = false;
  }

  private async playOne(
    text: string,
    options: AgentVoiceSpeakOptions
  ): Promise<void> {
    const controller = new AbortController();
    this.abortController = controller;
    options.onSpeakingChange?.(true);

    try {
      // Skip Gemini TTS network call during active quota cooldown
      if (Date.now() < this.ttsCooldownUntilMs) {
        await this.speakBrowserFallback(text, options);
        return;
      }

      const res = await fetch('/api/assistant/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          text,
          voiceName: options.voiceName,
          style: options.stylePrompt,
          useVoiceDesign: options.useVoiceDesign,
          mood: options.mood || 'normal',
          language: options.language || 'en-US',
        }),
      });

      if (res.status === 429) {
        let retrySeconds = 60;
        try {
          const errBody = (await res.json()) as { retryAfterSeconds?: number };
          if (typeof errBody.retryAfterSeconds === 'number' && errBody.retryAfterSeconds > 0) {
            retrySeconds = errBody.retryAfterSeconds;
          }
        } catch {
          // ignore
        }
        this.ttsCooldownUntilMs = Date.now() + retrySeconds * 1000;
        throw new Error('TTS quota cooldown');
      }

      if (!res.ok) {
        throw new Error(`TTS HTTP ${res.status}`);
      }

      const data = (await res.json()) as { audioBase64?: string };
      if (!data.audioBase64) {
        throw new Error('Missing audio payload');
      }

      const { ctx, gainNode, analyser } = this.ensureAudioGraph(options.volume);
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      options.onAnalyserReady?.(analyser);

      const audioBuf = await ctx.decodeAudioData(
        base64ToArrayBuffer(data.audioBase64)
      );

      await new Promise<void>((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = audioBuf;
        source.playbackRate.value = Math.max(0.75, Math.min(1.4, options.speed));
        if ('detune' in source) {
          source.detune.value =
            Math.max(-6, Math.min(6, options.pitchSemitones)) * 100;
        }
        source.connect(gainNode);
        this.activeSource = source;

        source.onended = () => {
          if (this.activeSource === source) {
            this.activeSource = null;
          }
          resolve();
        };
        source.start(0);
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      // Browser speechSynthesis fallback if Gemini TTS is offline or quota-limited
      await this.speakBrowserFallback(text, options);
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
      }
      options.onSpeakingChange?.(false);
    }
  }

  private speakBrowserFallback(
    text: string,
    options: AgentVoiceSpeakOptions
  ): Promise<void> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = Math.max(0, Math.min(1, options.volume));

        const mood = options.mood || 'normal';
        const moodRateDelta =
          mood === 'sad' ? -0.06 : mood === 'serious' ? -0.04 : mood === 'excited' ? 0.05 : 0;
        const moodPitchDelta =
          mood === 'sad' ? -0.06 : mood === 'excited' ? 0.05 : mood === 'serious' ? -0.04 : 0;

        utterance.rate = Math.max(0.75, Math.min(1.4, options.speed + moodRateDelta));
        utterance.pitch = Math.max(
          0.6,
          Math.min(1.5, 1 + options.pitchSemitones * 0.08 + moodPitchDelta)
        );

        const hasBengaliScript = /[\u0980-\u09FF]/.test(text);
        const targetLang = hasBengaliScript
          ? 'bn-BD'
          : options.language === 'bn-BD'
          ? 'bn-BD'
          : 'en-GB';
        utterance.lang = targetLang;

        const voices = window.speechSynthesis.getVoices?.() || [];
        if (voices.length > 0) {
          const picked = hasBengaliScript
            ? voices.find((v) => v.lang.toLowerCase().startsWith('bn')) || voices[0]
            : voices.find(
                (v) =>
                  v.lang.toLowerCase().startsWith('en-gb') &&
                  /ryan|george|daniel|oliver|thomas|male/i.test(v.name)
              ) ||
              voices.find((v) => v.lang.toLowerCase().startsWith('en-gb')) ||
              voices.find((v) => /male|daniel|david|guy|mark|george/i.test(v.name)) ||
              voices.find((v) => v.lang.toLowerCase().startsWith('en'));
          if (picked) utterance.voice = picked;
        }

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve();
      }
    });
  }
}

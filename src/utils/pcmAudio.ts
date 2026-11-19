export function downsampleFloat32(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): Float32Array {
  if (!input.length || inputSampleRate <= 0 || inputSampleRate === targetSampleRate) {
    return input;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i += 1) {
    const srcPos = i * ratio;
    const low = Math.floor(srcPos);
    const high = Math.min(input.length - 1, low + 1);
    const frac = srcPos - low;
    result[i] = input[low] * (1 - frac) + input[high] * frac;
  }

  return result;
}

export function float32ToInt16Base64(
  float32: Float32Array,
  inputSampleRate = 16000
): string {
  const resampled = downsampleFloat32(float32, inputSampleRate, 16000);
  const int16 = new Int16Array(resampled.length);
  for (let i = 0; i < resampled.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, resampled[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x4000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64Int16ToAudioBuffer(
  base64: string,
  audioCtx: AudioContext
): AudioBuffer {
  const binary = atob(base64);
  const byteLength = binary.length;
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const sampleCount = Math.floor(byteLength / 2);
  if (sampleCount === 0) {
    return audioCtx.createBuffer(1, 1, 24000);
  }
  const int16 = new Int16Array(bytes.buffer, 0, sampleCount);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i += 1) {
    float32[i] = int16[i] / 32768;
  }
  const buffer = audioCtx.createBuffer(1, float32.length, 24000);
  buffer.getChannelData(0).set(float32);
  return buffer;
}

export function playWakeChime(volume = 0.08): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.11); // G5

    const peak = Math.max(0.01, Math.min(0.2, volume));
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.24);
    osc.onended = () => {
      void ctx.close().catch(() => {});
    };
  } catch {
    // ignore audio chime errors if blocked
  }
}

export function playTimerCompleteChime(volume = 0.12): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const peak = Math.max(0.02, Math.min(0.25, volume));

    const notes = [587.33, 880, 1174.66]; // D5 -> A5 -> D6
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.13;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.37);
      if (idx === notes.length - 1) {
        osc.onended = () => {
          void ctx.close().catch(() => {});
        };
      }
    });
  } catch {
    // ignore chime failures
  }
}

export function playStateCue(
  kind: 'timer' | 'alarm' | 'searching' | 'executing' | 'completed' | 'error' | 'call',
  volume = 0.08
): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const peak = Math.max(0.015, Math.min(0.18, volume));

    const patterns: Record<typeof kind, number[]> = {
      timer: [659.25, 987.77],
      alarm: [880, 1046.5, 880],
      searching: [440, 587.33],
      executing: [523.25, 659.25],
      completed: [587.33, 880, 1174.66],
      error: [280, 210],
      call: [740, 987.77, 740],
    };
    const freqs = patterns[kind];
    freqs.forEach((f, idx) => {
      const start = now + idx * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'error' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
      if (idx === freqs.length - 1) {
        osc.onended = () => {
          void ctx.close().catch(() => {});
        };
      }
    });
  } catch {
    // ignore audio cues if blocked
  }
}


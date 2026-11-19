import {
  BuiltInKeyword,
  Porcupine,
  PorcupineWorker,
} from '@picovoice/porcupine-web';
import { WebVoiceProcessor } from '@picovoice/web-voice-processor';
import type { VoiceLanguageCode, WakeEnginePreference } from '../types/assistant';

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export interface VoiceEnvironmentDiagnostics {
  isSecureContext: boolean;
  hasSpeechRecognition: boolean;
  hasMediaDevices: boolean;
  micPermission: 'granted' | 'prompt' | 'denied' | 'unknown';
}

export async function inspectVoiceEnvironment(): Promise<VoiceEnvironmentDiagnostics> {
  const isSecureContext =
    typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false;
  const hasSpeechRecognition = Boolean(getSpeechRecognitionCtor());
  const hasMediaDevices =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  let micPermission: VoiceEnvironmentDiagnostics['micPermission'] = 'unknown';
  try {
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      const perm = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      if (
        perm.state === 'granted' ||
        perm.state === 'prompt' ||
        perm.state === 'denied'
      ) {
        micPermission = perm.state;
      }
    }
  } catch {
    micPermission = 'unknown';
  }

  return {
    isSecureContext,
    hasSpeechRecognition,
    hasMediaDevices,
    micPermission,
  };
}

export interface AudioInputDeviceOption {
  deviceId: string;
  label: string;
}

export async function listAudioInputDevices(): Promise<AudioInputDeviceOption[]> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.enumerateDevices
  ) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${idx + 1}`,
      }));
  } catch {
    return [];
  }
}

export function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export type ActiveWakeEngineType =
  | 'porcupine_local'
  | 'browser_speech'
  | 'manual_only';

export function resolveActiveWakeEngine(
  preference: WakeEnginePreference,
  picovoiceAccessKey?: string
): {
  type: ActiveWakeEngineType;
  label: string;
  isLocalOffline: boolean;
} {
  const hasPorcupineKey = Boolean(
    picovoiceAccessKey && picovoiceAccessKey.trim().length > 8
  );
  const hasSpeechRec = Boolean(getSpeechRecognitionCtor());
  const isSecure =
    typeof window !== 'undefined' ? Boolean(window.isSecureContext) : true;

  if (preference === 'manual') {
    return {
      type: 'manual_only',
      label: 'Manual Tap-to-Talk (Wake Standby Off)',
      isLocalOffline: true,
    };
  }

  if ((preference === 'porcupine' || preference === 'auto') && hasPorcupineKey) {
    return {
      type: 'porcupine_local',
      label: 'Porcupine Local WASM ("Jarvis")',
      isLocalOffline: true,
    };
  }

  if (
    (preference === 'speech_recognition' || preference === 'auto') &&
    hasSpeechRec &&
    isSecure
  ) {
    return {
      type: 'browser_speech',
      label: 'Browser SpeechRecognition Standby',
      isLocalOffline: false,
    };
  }

  return {
    type: 'manual_only',
    label: !hasSpeechRec
      ? 'Manual Voice Controls (SpeechRecognition Unsupported)'
      : !isSecure
      ? 'Manual Voice Controls (HTTPS Required)'
      : 'Manual Voice Controls (Wake Engine Unavailable)',
    isLocalOffline: true,
  };
}

export interface WakeStandbyController {
  engineType: ActiveWakeEngineType;
  engineLabel: string;
  stop: () => Promise<void>;
}

interface StartWakeOptions {
  preference: WakeEnginePreference;
  picovoiceAccessKey?: string;
  language?: VoiceLanguageCode;
  sensitivity?: number;
  isAutoAttempt: boolean;
  onInterimSubtitle: (text: string) => void;
  onWakeDetected: (trailingCommand?: string) => void;
  onNeedsGesture: () => void;
  onError: (message: string) => void;
}

function cleanStutteredTranscript(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const words = trimmed.split(' ');
  if (words.length >= 2 && words.length % 2 === 0) {
    const mid = words.length / 2;
    const first = words.slice(0, mid).join(' ').toLowerCase();
    const second = words.slice(mid).join(' ').toLowerCase();
    if (first === second) {
      return words.slice(0, mid).join(' ');
    }
  }
  return trimmed;
}

function formatSpeechErrorDetail(code: string): string {
  switch (code) {
    case 'network':
      return 'Browser SpeechRecognition network error (this browser or sandbox blocked cloud speech recognition). Use Tap to Talk for direct microphone capture, or add a Porcupine key in Settings.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone or speech recognition permission denied. Allow microphone access in your browser address bar, then click Enable Auto-Voice.';
    case 'audio-capture':
      return 'No active microphone hardware detected. Connect a mic and check OS input settings.';
    case 'language-not-supported':
      return 'Selected speech language is not supported by this browser SpeechRecognition engine.';
    default:
      return `Browser wake listener unavailable (${code}). Use Tap to Talk or check Settings.`;
  }
}

export async function startWakeStandbyEngine(
  options: StartWakeOptions
): Promise<WakeStandbyController | null> {
  const diagnostics = await inspectVoiceEnvironment();
  if (!diagnostics.isSecureContext) {
    if (!options.isAutoAttempt) {
      options.onError(
        'Voice recognition requires a secure HTTPS or localhost origin.'
      );
    }
    options.onNeedsGesture();
    return null;
  }

  if (diagnostics.micPermission === 'denied') {
    options.onError(
      'Microphone permission is blocked in browser settings. Enable mic permission and retry.'
    );
    options.onNeedsGesture();
    return null;
  }

  const resolved = resolveActiveWakeEngine(
    options.preference,
    options.picovoiceAccessKey
  );

  if (resolved.type === 'manual_only') {
    return null;
  }

  let disposed = false;
  let triggered = false;
  let porcupineEngine: Porcupine | PorcupineWorker | null = null;
  let speechRec: SpeechRecognitionLike | null = null;
  let debounceTimer: number | null = null;
  let restartTimer: number | null = null;
  let consecutiveErrors = 0;
  let fatalStop = false;

  const stopAll = async () => {
    disposed = true;
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (restartTimer !== null) {
      window.clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (speechRec) {
      const rec = speechRec;
      speechRec = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
      try {
        rec.abort();
      } catch {
        // ignore
      }
    }
    if (porcupineEngine) {
      const engine = porcupineEngine;
      porcupineEngine = null;
      try {
        await WebVoiceProcessor.unsubscribe(engine);
      } catch {
        // ignore
      }
      try {
        if ('terminate' in engine && typeof engine.terminate === 'function') {
          await engine.terminate();
        } else if ('release' in engine && typeof engine.release === 'function') {
          await engine.release();
        }
      } catch {
        // ignore
      }
    }
  };

  try {
    // 1. Porcupine Local WASM Engine (WebVoiceProcessor owns microphone exclusively)
    if (resolved.type === 'porcupine_local' && options.picovoiceAccessKey) {
      const modelConfig = {
        publicPath: '/assets/porcupine_params.pv',
        customWritePath: 'jarvis_porcupine_params_v1',
        version: 1,
      };
      const clampedSens = Math.max(
        0.2,
        Math.min(0.95, options.sensitivity ?? 0.6)
      );

      const onDetection = () => {
        if (disposed || triggered) return;
        triggered = true;
        options.onInterimSubtitle('Jarvis');
        void stopAll().finally(() => {
          options.onWakeDetected(undefined);
        });
      };

      const onPorcupineError = (err: { message?: string }) => {
        if (disposed) return;
        options.onError(err?.message || 'Porcupine wake engine error.');
      };

      try {
        if (window.crossOriginIsolated) {
          porcupineEngine = await PorcupineWorker.create(
            options.picovoiceAccessKey.trim(),
            { builtin: BuiltInKeyword.Jarvis, sensitivity: clampedSens },
            onDetection,
            modelConfig,
            { processErrorCallback: onPorcupineError }
          );
        } else {
          porcupineEngine = await Porcupine.create(
            options.picovoiceAccessKey.trim(),
            { builtin: BuiltInKeyword.Jarvis, sensitivity: clampedSens },
            onDetection,
            modelConfig,
            { device: 'cpu:1', processErrorCallback: onPorcupineError }
          );
        }
        await WebVoiceProcessor.subscribe(porcupineEngine);

        return {
          engineType: 'porcupine_local',
          engineLabel: window.crossOriginIsolated
            ? 'Porcupine Local Worker ("Jarvis")'
            : 'Porcupine Local WASM ("Jarvis")',
          stop: stopAll,
        };
      } catch (porcupineErr) {
        if (porcupineEngine) {
          await stopAll();
          disposed = false;
        }
        const fallbackCtor = getSpeechRecognitionCtor();
        if (!fallbackCtor) {
          throw porcupineErr;
        }
        options.onError(
          `Porcupine key error (${
            porcupineErr instanceof Error ? porcupineErr.message : 'invalid key'
          }). Trying Browser SpeechRecognition standby.`
        );
      }
    }

    // 2. Browser SpeechRecognition Standby (with fail-fast diagnostics on network/blocked)
    const SpeechRecCtor = getSpeechRecognitionCtor();
    if (!SpeechRecCtor) {
      await stopAll();
      return null;
    }

    const rec = new SpeechRecCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = options.language || 'en-US';
    speechRec = rec;

    let latestTrailingCommand = '';

    const fireWake = () => {
      if (disposed || triggered) return;
      triggered = true;
      const cmd = cleanStutteredTranscript(latestTrailingCommand);
      void stopAll().finally(() => {
        options.onWakeDetected(cmd || undefined);
      });
    };

    rec.onstart = () => {
      consecutiveErrors = 0;
    };

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      if (disposed || triggered) return;
      consecutiveErrors = 0;

      let segment = '';
      let sawFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        if (res.isFinal) sawFinal = true;
        segment += (res[0]?.transcript || '') + ' ';
      }

      const match = segment.match(
        /\b(?:(?:hey|ok(?:ay)?|hi|hello|yo)\s+)?(august|augst|ogast|agast|jarvis|j\.a\.r\.v\.i\.s\.?)\b[\s,.:!?-]*(.*)/i
      );
      if (match) {
        const wakeName = /jarvis|j\.a\.r\.v\.i\.s/i.test(match[1])
          ? 'Jarvis'
          : 'August';
        latestTrailingCommand = cleanStutteredTranscript(match[2] || '');
        options.onInterimSubtitle(
          latestTrailingCommand ? `${wakeName}, ${latestTrailingCommand}` : wakeName
        );

        if (sawFinal && latestTrailingCommand) {
          if (debounceTimer !== null) {
            window.clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          fireWake();
        } else {
          if (debounceTimer !== null) {
            window.clearTimeout(debounceTimer);
          }
          debounceTimer = window.setTimeout(() => {
            debounceTimer = null;
            fireWake();
          }, latestTrailingCommand ? 650 : 950);
        }
      }
    };

    rec.onerror = (event) => {
      if (disposed || triggered) return;
      const code = event?.error || 'unknown';

      if (code === 'not-allowed' || code === 'service-not-allowed') {
        fatalStop = true;
        void stopAll();
        if (!options.isAutoAttempt) {
          options.onError(formatSpeechErrorDetail(code));
        }
        options.onNeedsGesture();
        return;
      }

      if (
        code === 'network' ||
        code === 'audio-capture' ||
        code === 'language-not-supported'
      ) {
        fatalStop = true;
        void stopAll();
        options.onError(formatSpeechErrorDetail(code));
        options.onNeedsGesture();
        return;
      }

      if (code === 'no-speech' || code === 'aborted') {
        return;
      }

      consecutiveErrors += 1;
      if (consecutiveErrors >= 3) {
        fatalStop = true;
        void stopAll();
        options.onError(formatSpeechErrorDetail(code));
        options.onNeedsGesture();
      }
    };

    rec.onend = () => {
      if (!disposed && !triggered && !fatalStop) {
        const delayMs = Math.min(2000, 350 + consecutiveErrors * 350);
        restartTimer = window.setTimeout(() => {
          if (!disposed && !triggered && !fatalStop && speechRec === rec) {
            try {
              rec.start();
            } catch {
              fatalStop = true;
              void stopAll();
              options.onNeedsGesture();
            }
          }
        }, delayMs);
      }
    };

    rec.start();
    return {
      engineType: 'browser_speech',
      engineLabel: `Wake Standby (${options.language || 'en-US'} · "Hey August" / "Hey Jarvis")`,
      stop: stopAll,
    };
  } catch (err) {
    await stopAll();
    const isGestureOrPerm =
      err instanceof Error &&
      (err.name === 'NotAllowedError' ||
        err.name === 'SecurityError' ||
        err.name === 'AbortError');
    if (options.isAutoAttempt || isGestureOrPerm) {
      options.onNeedsGesture();
    } else {
      options.onError(
        err instanceof Error ? err.message : 'Unable to start wake-word listener.'
      );
    }
    return null;
  }
}

export function tryOneShotSpeechRecognition(options: {
  language?: VoiceLanguageCode;
  timeoutMs?: number;
  onInterim?: (text: string) => void;
}): Promise<{ transcript: string; error?: string }> {
  const SpeechRecCtor = getSpeechRecognitionCtor();
  if (!SpeechRecCtor || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return Promise.resolve({
      transcript: '',
      error: SpeechRecCtor ? 'offline' : 'unsupported',
    });
  }

  return new Promise((resolve) => {
    let finished = false;
    let bestTranscript = '';
    const rec = new SpeechRecCtor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = options.language || 'en-US';

    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        rec.abort();
      } catch {
        // ignore
      }
      resolve({ transcript: cleanStutteredTranscript(bestTranscript) });
    }, options.timeoutMs ?? 6500);

    const finalize = (result: { transcript: string; error?: string }) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      resolve(result);
    };

    rec.onresult = (event) => {
      let segment = '';
      let isFinal = false;
      for (let i = 0; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) isFinal = true;
        segment += (event.results[i][0]?.transcript || '') + ' ';
      }
      const cleaned = cleanStutteredTranscript(segment);
      if (cleaned) {
        bestTranscript = cleaned;
        options.onInterim?.(cleaned);
      }
      if (isFinal && cleaned) {
        try {
          rec.stop();
        } catch {
          // ignore
        }
        finalize({ transcript: cleaned });
      }
    };

    rec.onerror = (ev) => {
      finalize({
        transcript: cleanStutteredTranscript(bestTranscript),
        error: ev?.error || 'speech_error',
      });
    };

    rec.onend = () => {
      finalize({ transcript: cleanStutteredTranscript(bestTranscript) });
    };

    try {
      rec.start();
    } catch {
      finalize({ transcript: '', error: 'start_failed' });
    }
  });
}

export function startSpeechInterruptionMonitor(options: {
  language?: VoiceLanguageCode;
  onStopRequested: () => void;
  onNewCommandWhileSpeaking?: (command: string) => void;
}): { stop: () => void } | null {
  const SpeechRecCtor = getSpeechRecognitionCtor();
  if (!SpeechRecCtor) return null;

  let disposed = false;
  let rec: SpeechRecognitionLike | null = null;
  let handled = false;
  let errored = false;

  const stop = () => {
    disposed = true;
    if (rec) {
      const active = rec;
      rec = null;
      active.onresult = null;
      active.onerror = null;
      active.onend = null;
      try {
        active.abort();
      } catch {
        // ignore
      }
    }
  };

  try {
    rec = new SpeechRecCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = options.language || 'en-US';

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      if (disposed || handled) return;
      let text = '';
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) isFinal = true;
        text += (event.results[i][0]?.transcript || '') + ' ';
      }
      const cleaned = text.trim();
      if (!cleaned) return;

      if (
        /\b(?:august\s+stop|jarvis\s+stop|stop\s+speaking|stop\s+talking|be\s+quiet|shut\s+up|thamo|chup\s+koro)\b/i.test(
          cleaned
        )
      ) {
        handled = true;
        stop();
        options.onStopRequested();
        return;
      }

      const wakeCmd = cleaned.match(
        /\b(?:(?:hey|ok(?:ay)?)\s+)?(?:august|jarvis)\b[\s,.:-]+(.{3,})/i
      );
      if (wakeCmd && isFinal && options.onNewCommandWhileSpeaking) {
        const trailing = cleanStutteredTranscript(wakeCmd[1]);
        if (trailing) {
          handled = true;
          stop();
          options.onNewCommandWhileSpeaking(trailing);
        }
      }
    };

    rec.onerror = (ev) => {
      if (ev?.error === 'network' || ev?.error === 'not-allowed') {
        errored = true;
        stop();
      }
    };
    rec.onend = () => {
      if (!disposed && !handled && !errored && rec) {
        try {
          rec.start();
        } catch {
          errored = true;
        }
      }
    };
    rec.start();
    return { stop };
  } catch {
    stop();
    return null;
  }
}

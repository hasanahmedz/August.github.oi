import React, { useEffect, useRef, useState } from 'react';
import type { JarvisLogoState } from '../types/assistant';

interface JarvisCoreLogoProps {
  coreState: JarvisLogoState;
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
  standbyAnalyser: AnalyserNode | null;
  isMuted: boolean;
  onCoreClick?: () => void;
}

export const JarvisCoreLogo: React.FC<JarvisCoreLogoProps> = ({
  coreState,
  inputAnalyser,
  outputAnalyser,
  standbyAnalyser,
  isMuted,
  onCoreClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const [logoSrc, setLogoSrc] = useState('/assets/jarvis-logo.png');
  const [audioScale, setAudioScale] = useState(1);

  const stateRef = useRef(coreState);
  stateRef.current = coreState;
  const inputRef = useRef(inputAnalyser);
  inputRef.current = inputAnalyser;
  const outputRef = useRef(outputAnalyser);
  outputRef.current = outputAnalyser;
  const standbyRef = useRef(standbyAnalyser);
  standbyRef.current = standbyAnalyser;
  const mutedRef = useRef(isMuted);
  mutedRef.current = isMuted;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const freqData = new Uint8Array(64);
    let smoothLevel = 0;
    let lastScaleUpdate = 0;

    const renderFrame = (timeMs: number) => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const targetW = Math.round(rect.width * dpr);
        const targetH = Math.round(rect.height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);

      const phase = stateRef.current;
      const activeAnalyser =
        phase === 'speaking'
          ? outputRef.current
          : phase === 'listening' && !mutedRef.current
          ? inputRef.current
          : phase === 'standby'
          ? standbyRef.current
          : null;

      let rawEnergy = 0;
      if (activeAnalyser) {
        activeAnalyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i += 1) {
          sum += freqData[i];
        }
        rawEnergy = sum / (freqData.length * 255);
      }

      smoothLevel = smoothLevel * 0.78 + rawEnergy * 0.22;

      if (!prefersReducedMotion && timeMs - lastScaleUpdate > 45) {
        lastScaleUpdate = timeMs;
        if (phase === 'speaking' || (phase === 'listening' && !mutedRef.current)) {
          setAudioScale(1 + Math.min(0.08, smoothLevel * 0.14));
        } else if (phase === 'waking') {
          setAudioScale(1.045);
        } else {
          setAudioScale(1);
        }
      }

      const ringBase = Math.min(w, h) * 0.36;

      // Ambient radial halo behind the exact uploaded logo (using external lighting layer only)
      const glowRadius = ringBase + 42 + smoothLevel * 48;
      const grad = ctx.createRadialGradient(cx, cy, ringBase * 0.45, cx, cy, glowRadius);
      if (phase === 'error') {
        grad.addColorStop(0, 'rgba(244, 63, 94, 0.26)');
        grad.addColorStop(1, 'rgba(244, 63, 94, 0)');
      } else if (phase === 'disconnected') {
        grad.addColorStop(0, 'rgba(100, 116, 139, 0.12)');
        grad.addColorStop(1, 'rgba(100, 116, 139, 0)');
      } else if (phase === 'speaking') {
        grad.addColorStop(0, `rgba(6, 182, 212, ${0.28 + smoothLevel * 0.38})`);
        grad.addColorStop(0.55, `rgba(37, 99, 235, ${0.18 + smoothLevel * 0.25})`);
        grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
      } else if (phase === 'waking') {
        grad.addColorStop(0, 'rgba(34, 211, 238, 0.42)');
        grad.addColorStop(0.6, 'rgba(37, 99, 235, 0.22)');
        grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
      } else if (phase === 'executing') {
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.34)');
        grad.addColorStop(0.55, 'rgba(6, 182, 212, 0.22)');
        grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
      } else if (phase === 'thinking') {
        grad.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
        grad.addColorStop(1, 'rgba(59, 130, 246, 0)');
      } else if (phase === 'listening') {
        grad.addColorStop(0, `rgba(34, 211, 238, ${0.2 + smoothLevel * 0.35})`);
        grad.addColorStop(1, 'rgba(34, 211, 238, 0)');
      } else if (phase === 'standby') {
        const breath = prefersReducedMotion ? 0.16 : 0.14 + Math.sin(timeMs * 0.0022) * 0.06;
        grad.addColorStop(0, `rgba(6, 182, 212, ${breath})`);
        grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
      } else {
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.12)');
        grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Primary structural containment ring
      ctx.beginPath();
      ctx.arc(cx, cy, ringBase + 14, 0, Math.PI * 2);
      ctx.strokeStyle =
        phase === 'error'
          ? 'rgba(244, 63, 94, 0.45)'
          : phase === 'disconnected'
          ? 'rgba(148, 163, 184, 0.18)'
          : phase === 'speaking' || phase === 'waking'
          ? 'rgba(34, 211, 238, 0.45)'
          : 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 1.25;
      ctx.stroke();

      // State-specific orbital arcs
      if (!prefersReducedMotion) {
        if (phase === 'standby' || phase === 'idle') {
          const speed = phase === 'standby' ? 0.0009 : 0.00045;
          const start = (timeMs * speed) % (Math.PI * 2);
          ctx.beginPath();
          ctx.arc(cx, cy, ringBase + 14, start, start + Math.PI * 0.45);
          ctx.strokeStyle =
            phase === 'standby'
              ? 'rgba(34, 211, 238, 0.72)'
              : 'rgba(56, 189, 248, 0.35)';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.stroke();
        } else if (phase === 'waking') {
          const sweep = (timeMs * 0.0045) % (Math.PI * 2);
          ctx.beginPath();
          ctx.arc(cx, cy, ringBase + 18, sweep, sweep + Math.PI * 1.15);
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.stroke();
        } else if (phase === 'executing') {
          const cw = (timeMs * 0.0042) % (Math.PI * 2);
          const ccw = -(timeMs * 0.0031) % (Math.PI * 2);
          ctx.beginPath();
          ctx.arc(cx, cy, ringBase + 16, cw, cw + Math.PI * 0.9);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.6;
          ctx.lineCap = 'round';
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(cx, cy, ringBase + 24, ccw, ccw + Math.PI * 0.65);
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.stroke();
        } else if (phase === 'thinking') {
          const cw = (timeMs * 0.0028) % (Math.PI * 2);
          const ccw = -(timeMs * 0.0021) % (Math.PI * 2);
          ctx.beginPath();
          ctx.arc(cx, cy, ringBase + 16, cw, cw + Math.PI * 0.75);
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2.4;
          ctx.lineCap = 'round';
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(cx, cy, ringBase + 24, ccw, ccw + Math.PI * 0.55);
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1.8;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }

      // Acoustic spectrum bars outside the core perimeter (never overlapping the logo center)
      const barCount = 56;
      for (let i = 0; i < barCount; i += 1) {
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        const binIndex = Math.min(freqData.length - 1, Math.floor((i / barCount) * 38));
        const binNorm = activeAnalyser ? freqData[binIndex] / 255 : 0;

        let barLen = 2;
        if (!prefersReducedMotion) {
          if (phase === 'speaking') {
            barLen = 5 + binNorm * 28;
          } else if (phase === 'listening' && !mutedRef.current) {
            barLen = 4 + binNorm * 24;
          } else if (phase === 'standby') {
            barLen = 2.5 + binNorm * 9;
          } else if (phase === 'thinking') {
            barLen = 4 + Math.max(0, Math.sin(timeMs * 0.007 + i * 0.35)) * 8;
          } else if (phase === 'waking') {
            barLen = 10;
          }
        }

        const r0 = ringBase + 20;
        const r1 = r0 + barLen;

        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0);
        ctx.lineTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
        ctx.strokeStyle =
          phase === 'error'
            ? 'rgba(244, 63, 94, 0.75)'
            : phase === 'disconnected'
            ? 'rgba(148, 163, 184, 0.25)'
            : phase === 'speaking'
            ? 'rgba(34, 211, 238, 0.85)'
            : phase === 'thinking'
            ? 'rgba(59, 130, 246, 0.78)'
            : phase === 'listening' && !mutedRef.current
            ? 'rgba(56, 189, 248, 0.8)'
            : 'rgba(34, 211, 238, 0.35)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      ctx.restore();
      animRef.current = window.requestAnimationFrame(renderFrame);
    };

    animRef.current = window.requestAnimationFrame(renderFrame);
    return () => {
      if (animRef.current !== null) {
        window.cancelAnimationFrame(animRef.current);
      }
    };
  }, []);

  // CSS animation classes applied strictly via transforms/opacity/filter on the exact logo container
  const logoFilterClass =
    coreState === 'disconnected'
      ? 'opacity-45 grayscale'
      : coreState === 'error'
      ? 'brightness-90 drop-shadow-[0_0_24px_rgba(244,63,94,0.45)]'
      : coreState === 'executing'
      ? 'brightness-115 drop-shadow-[0_0_32px_rgba(16,185,129,0.55)]'
      : coreState === 'speaking'
      ? 'brightness-110 drop-shadow-[0_0_32px_rgba(34,211,238,0.55)]'
      : coreState === 'waking'
      ? 'brightness-125 drop-shadow-[0_0_36px_rgba(34,211,238,0.65)]'
      : coreState === 'thinking'
      ? 'drop-shadow-[0_0_28px_rgba(59,130,246,0.5)]'
      : 'drop-shadow-[0_0_20px_rgba(6,182,212,0.32)]';

  return (
    <div className="relative w-72 h-72 sm:w-84 sm:h-84 flex items-center justify-center select-none">
      {/* Canvas aura & frequency field behind/around the core */}
      <canvas
        ref={canvasRef}
        aria-label="J.A.R.V.I.S. acoustic energy ring visualizer"
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Official JARVIS Core Logo — exact uploaded asset, never cropped or redesigned */}
      <button
        type="button"
        onClick={onCoreClick}
        aria-label="Interact with J.A.R.V.I.S. AI Core"
        style={{ transform: `scale(${audioScale.toFixed(3)})` }}
        className="relative z-10 w-44 h-44 sm:w-52 sm:h-52 rounded-full flex items-center justify-center transition-transform duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400"
      >
        <img
          src={logoSrc}
          alt="Official J.A.R.V.I.S. Glowing Spherical AI Core"
          referrerPolicy="no-referrer"
          onError={() => {
            if (logoSrc !== '/assets/aistudio/image_b4cd0d5f.png') {
              setLogoSrc('/assets/aistudio/image_b4cd0d5f.png');
            }
          }}
          className={`w-full h-full object-contain rounded-full mix-blend-screen transition-all duration-300 ${
            coreState === 'idle' || coreState === 'standby'
              ? 'animate-[spin_42s_linear_infinite]'
              : coreState === 'thinking'
              ? 'animate-[spin_10s_linear_infinite]'
              : ''
          } ${logoFilterClass}`}
        />
      </button>
    </div>
  );
};

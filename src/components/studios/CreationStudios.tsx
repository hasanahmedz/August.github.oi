import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import {
  Box,
  Download,
  Gamepad2,
  Layers,
  LineChart,
  Pause,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { CreativeAssetEntry } from '../../types/assistant';
import type { DesktopCompanionBridge } from '../../utils/computerControl';

export interface CreationStudiosProps {
  initialTab?: '3d' | '2d' | '1d';
  assets: CreativeAssetEntry[];
  companionBridge: DesktopCompanionBridge;
  companionConnected: boolean;
  onSaveAsset: (asset: Omit<CreativeAssetEntry, 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDeleteAsset: (id: string) => Promise<void>;
  onLogAction: (command: string, detail: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

interface Part3DSpec {
  name: string;
  shape: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'capsule' | 'dodecahedron';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  metalness: number;
  roughness: number;
  emissive?: string;
}

interface Scene3DSpec {
  title: string;
  category: string;
  animation: 'turntable' | 'idle_float' | 'pulse' | 'none';
  parts: Part3DSpec[];
}

interface Shape2DSpec {
  type: 'rect' | 'circle' | 'polygon' | 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  stroke: string;
  label?: string;
  dx?: number;
  dy?: number;
}

interface Scene2DSpec {
  title: string;
  category: string;
  background: string;
  fps: number;
  shapes: Shape2DSpec[];
}

interface Spec1DData {
  title: string;
  mode: 'math_plot' | 'data_chart' | 'linear_sequence' | 'physics_wave';
  equation: string;
  xMin: number;
  xMax: number;
  steps: string[];
  points: Array<{ label: string; value: number }>;
}

const PRESET_3D_SCENES: Record<string, Scene3DSpec> = {
  mech: {
    title: 'Sentinel Mech Rig',
    category: 'character',
    animation: 'idle_float',
    parts: [
      { name: 'chassis', shape: 'box', position: [0, 0.2, 0], rotation: [0, 0, 0], scale: [1.0, 1.15, 0.72], color: '#1e293b', metalness: 0.82, roughness: 0.24 },
      { name: 'arc_core', shape: 'torus', position: [0, 0.25, 0.4], rotation: [0, 0, 0], scale: [0.24, 0.24, 0.24], color: '#38bdf8', metalness: 0.2, roughness: 0.15, emissive: '#0284c7' },
      { name: 'helm', shape: 'dodecahedron', position: [0, 1.08, 0], rotation: [0, 0, 0], scale: [0.42, 0.44, 0.42], color: '#334155', metalness: 0.85, roughness: 0.2 },
      { name: 'visor', shape: 'box', position: [0, 1.12, 0.32], rotation: [0, 0, 0], scale: [0.46, 0.12, 0.14], color: '#38bdf8', metalness: 0.1, roughness: 0.1, emissive: '#38bdf8' },
      { name: 'pauldron_l', shape: 'cylinder', position: [-0.82, 0.52, 0], rotation: [0, 0, 0.35], scale: [0.34, 0.55, 0.34], color: '#475569', metalness: 0.75, roughness: 0.3 },
      { name: 'pauldron_r', shape: 'cylinder', position: [0.82, 0.52, 0], rotation: [0, 0, -0.35], scale: [0.34, 0.55, 0.34], color: '#475569', metalness: 0.75, roughness: 0.3 },
      { name: 'thruster_l', shape: 'cone', position: [-0.32, -0.58, -0.18], rotation: [3.14, 0, 0], scale: [0.2, 0.42, 0.2], color: '#0ea5e9', metalness: 0.5, roughness: 0.3, emissive: '#0369a1' },
      { name: 'thruster_r', shape: 'cone', position: [0.32, -0.58, -0.18], rotation: [3.14, 0, 0], scale: [0.2, 0.42, 0.2], color: '#0ea5e9', metalness: 0.5, roughness: 0.3, emissive: '#0369a1' },
    ],
  },
  house: {
    title: 'Minimalist Modern Villa',
    category: 'building',
    animation: 'turntable',
    parts: [
      { name: 'plinth', shape: 'box', position: [0, -0.55, 0], rotation: [0, 0, 0], scale: [2.8, 0.24, 2.2], color: '#334155', metalness: 0.15, roughness: 0.8 },
      { name: 'main_wing', shape: 'box', position: [-0.35, 0.08, 0], rotation: [0, 0, 0], scale: [1.65, 1.0, 1.5], color: '#cbd5e1', metalness: 0.1, roughness: 0.65 },
      { name: 'upper_cantilever', shape: 'box', position: [0.3, 0.78, 0.1], rotation: [0, 0, 0], scale: [1.75, 0.72, 1.35], color: '#94a3b8', metalness: 0.2, roughness: 0.5 },
      { name: 'glass_wall', shape: 'box', position: [0.45, 0.08, 0.55], rotation: [0, 0, 0], scale: [1.1, 0.85, 0.08], color: '#38bdf8', metalness: 0.1, roughness: 0.08, emissive: '#0c4a6e' },
      { name: 'solar_roof', shape: 'box', position: [0.3, 1.2, 0.1], rotation: [0, 0, 0.04], scale: [1.9, 0.1, 1.55], color: '#0f172a', metalness: 0.75, roughness: 0.22 },
      { name: 'pool_basin', shape: 'box', position: [0.78, -0.4, 0.72], rotation: [0, 0, 0], scale: [0.95, 0.1, 0.62], color: '#0ea5e9', metalness: 0.2, roughness: 0.1, emissive: '#0369a1' },
    ],
  },
  satellite: {
    title: 'Orbital Relay Satellite',
    category: 'environment_prop',
    animation: 'turntable',
    parts: [
      { name: 'bus', shape: 'cylinder', position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.55, 0.9, 0.55], color: '#f59e0b', metalness: 0.88, roughness: 0.22 },
      { name: 'dish', shape: 'cone', position: [0, 0.68, 0], rotation: [3.14, 0, 0], scale: [0.65, 0.38, 0.65], color: '#e2e8f0', metalness: 0.7, roughness: 0.28 },
      { name: 'beacon', shape: 'sphere', position: [0, 0.9, 0], rotation: [0, 0, 0], scale: [0.14, 0.14, 0.14], color: '#22d3ee', metalness: 0.1, roughness: 0.1, emissive: '#22d3ee' },
      { name: 'solar_left', shape: 'box', position: [-1.45, 0, 0], rotation: [0.3, 0, 0], scale: [1.85, 0.05, 0.78], color: '#1d4ed8', metalness: 0.6, roughness: 0.2 },
      { name: 'solar_right', shape: 'box', position: [1.45, 0, 0], rotation: [0.3, 0, 0], scale: [1.85, 0.05, 0.78], color: '#1d4ed8', metalness: 0.6, roughness: 0.2 },
    ],
  },
};

const PRESET_2D_SCENES: Record<string, Scene2DSpec> = {
  sprite: {
    title: 'Cyber Guardian Sprite',
    category: '2d_character',
    background: '#080c14',
    fps: 24,
    shapes: [
      { type: 'circle', x: 400, y: 240, w: 170, h: 170, color: '#0c4a6e', stroke: '#38bdf8', dx: 0, dy: 6 },
      { type: 'rect', x: 325, y: 175, w: 150, h: 120, color: '#1e293b', stroke: '#7dd3fc', dx: 0, dy: 4 },
      { type: 'rect', x: 348, y: 205, w: 104, h: 26, color: '#38bdf8', stroke: '#e0f2fe', dx: 4, dy: 0 },
      { type: 'polygon', x: 400, y: 120, w: 90, h: 60, color: '#0284c7', stroke: '#bae6fd', dx: 0, dy: -5 },
      { type: 'text', x: 400, y: 375, w: 0, h: 0, color: '#e2e8f0', stroke: '#38bdf8', label: 'UNIT // 01', dx: 0, dy: 0 },
    ],
  },
  ui_card: {
    title: 'Tactical HUD Widget',
    category: 'ui_design',
    background: '#05080f',
    fps: 18,
    shapes: [
      { type: 'rect', x: 140, y: 90, w: 520, h: 320, color: '#0f172a', stroke: '#0ea5e9', dx: 0, dy: 0 },
      { type: 'circle', x: 250, y: 250, w: 110, h: 110, color: '#082f49', stroke: '#22d3ee', dx: 0, dy: 4 },
      { type: 'rect', x: 345, y: 165, w: 260, h: 28, color: '#0284c7', stroke: '#7dd3fc', dx: 12, dy: 0 },
      { type: 'rect', x: 345, y: 220, w: 210, h: 22, color: '#1e293b', stroke: '#38bdf8', dx: 6, dy: 0 },
      { type: 'text', x: 475, y: 315, w: 0, h: 0, color: '#f8fafc', stroke: '#38bdf8', label: 'SYSTEM DIAGNOSTICS READY', dx: 0, dy: 0 },
    ],
  },
};

/** Safe recursive-descent mathematical evaluator (zero eval/Function). */
function evaluateSafeMath(expr: string, xVal: number): number {
  const s = expr
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\bpi\b/g, String(Math.PI))
    .replace(/\be\b/g, String(Math.E));
  let pos = 0;

  function peek() {
    return s[pos] || '';
  }

  function parseExpression(): number {
    let val = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = s[pos++];
      const rhs = parseTerm();
      val = op === '+' ? val + rhs : val - rhs;
    }
    return val;
  }

  function parseTerm(): number {
    let val = parsePower();
    while (peek() === '*' || peek() === '/') {
      const op = s[pos++];
      const rhs = parsePower();
      val = op === '*' ? val * rhs : rhs === 0 ? NaN : val / rhs;
    }
    return val;
  }

  function parsePower(): number {
    let val = parseUnary();
    if (peek() === '^') {
      pos++;
      val = Math.pow(val, parsePower());
    }
    return val;
  }

  function parseUnary(): number {
    if (peek() === '-') {
      pos++;
      return -parseUnary();
    }
    if (peek() === '+') {
      pos++;
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    if (peek() === '(') {
      pos++;
      const v = parseExpression();
      if (peek() === ')') pos++;
      return v;
    }
    if (s.slice(pos).startsWith('x')) {
      pos++;
      return xVal;
    }
    const funcs: Array<[string, (n: number) => number]> = [
      ['sin(', Math.sin],
      ['cos(', Math.cos],
      ['tan(', Math.tan],
      ['abs(', Math.abs],
      ['sqrt(', Math.sqrt],
      ['exp(', Math.exp],
      ['log(', Math.log],
    ];
    for (const [prefix, fn] of funcs) {
      if (s.slice(pos).startsWith(prefix)) {
        pos += prefix.length;
        const inner = parseExpression();
        if (peek() === ')') pos++;
        return fn(inner);
      }
    }
    const numMatch = s.slice(pos).match(/^\d+(?:\.\d+)?/);
    if (numMatch) {
      pos += numMatch[0].length;
      return parseFloat(numMatch[0]);
    }
    pos++;
    return 0;
  }

  const res = parseExpression();
  return Number.isFinite(res) ? res : 0;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const CreationStudios: React.FC<CreationStudiosProps> = ({
  initialTab = '3d',
  assets,
  companionBridge,
  companionConnected,
  onSaveAsset,
  onDeleteAsset,
  onLogAction,
  getAuthHeaders,
}) => {
  const [subTab, setSubTab] = useState<'3d' | '2d' | '1d'>(initialTab);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [statusNote, setStatusNote] = useState('');

  // 3D State
  const [scene3D, setScene3D] = useState<Scene3DSpec>(PRESET_3D_SCENES.mech);
  const [selectedPartIdx, setSelectedPartIdx] = useState(0);
  const [gameMode, setGameMode] = useState(false);
  const [gameScore, setGameScore] = useState(0);
  const [blenderStatus, setBlenderStatus] = useState<{ checked: boolean; installed: boolean; text: string }>({
    checked: false,
    installed: false,
    text: '',
  });
  const mount3DRef = useRef<HTMLDivElement | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const gameKeysRef = useRef<Record<string, boolean>>({});

  // 2D State
  const [scene2D, setScene2D] = useState<Scene2DSpec>(PRESET_2D_SCENES.sprite);
  const [is2DPlaying, setIs2DPlaying] = useState(true);
  const [onionSkin, setOnionSkin] = useState(false);
  const [frameTick, setFrameTick] = useState(0);
  const canvas2DRef = useRef<HTMLCanvasElement | null>(null);

  // 1D State
  const [spec1D, setSpec1D] = useState<Spec1DData>({
    title: 'Damped Harmonic Response',
    mode: 'math_plot',
    equation: 'sin(x) * exp(-0.15 * abs(x))',
    xMin: -10,
    xMax: 10,
    steps: ['Initialize Domain [-10, 10]', 'Apply Exponential Decay Envelope', 'Sample 120 Points', 'Render Curve'],
    points: [
      { label: 'Q1', value: 42 },
      { label: 'Q2', value: 68 },
      { label: 'Q3', value: 54 },
      { label: 'Q4', value: 89 },
    ],
  });
  const [wavePhase, setWavePhase] = useState(0);
  const [wavePlaying, setWavePlaying] = useState(false);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  // 3D Viewport Lifecycle
  useEffect(() => {
    if (subTab !== '3d') return;
    const container = mount3DRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setStatusNote('WebGL renderer unavailable in this browser.');
      return;
    }

    const w = Math.max(container.clientWidth || 540, 320);
    const h = Math.max(container.clientHeight || 360, 280);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060a12);
    const camera = new THREE.PerspectiveCamera(44, w / h, 0.1, 100);
    camera.position.set(3.2, 2.4, 4.4);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.75);
    const dirKey = new THREE.DirectionalLight(0xffffff, 2.0);
    dirKey.position.set(4, 6, 4);
    const rim = new THREE.DirectionalLight(0x38bdf8, 1.2);
    rim.position.set(-4, 2, -4);
    scene.add(hemi, dirKey, rim);

    const grid = new THREE.GridHelper(10, 20, 0x1e293b, 0x0f172a);
    grid.position.y = -1.0;
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const assembly = new THREE.Group();
    scene.add(assembly);
    modelGroupRef.current = assembly;

    // Build procedural parts
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const materialsToDispose: THREE.Material[] = [];

    for (const part of scene3D.parts) {
      let geo: THREE.BufferGeometry;
      switch (part.shape) {
        case 'sphere':
          geo = new THREE.SphereGeometry(0.5, 24, 18);
          break;
        case 'cylinder':
          geo = new THREE.CylinderGeometry(0.45, 0.45, 1, 20);
          break;
        case 'cone':
          geo = new THREE.ConeGeometry(0.5, 1, 20);
          break;
        case 'torus':
          geo = new THREE.TorusGeometry(0.5, 0.18, 14, 36);
          break;
        case 'capsule':
          geo = new THREE.CapsuleGeometry(0.32, 0.6, 8, 16);
          break;
        case 'dodecahedron':
          geo = new THREE.DodecahedronGeometry(0.55, 0);
          break;
        default:
          geo = new THREE.BoxGeometry(1, 1, 1);
      }
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(part.color || '#38bdf8'),
        metalness: Math.max(0, Math.min(1, Number(part.metalness ?? 0.5))),
        roughness: Math.max(0.05, Math.min(1, Number(part.roughness ?? 0.35))),
        emissive: new THREE.Color(part.emissive || '#000000'),
        emissiveIntensity: part.emissive ? 0.9 : 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = part.name;
      mesh.position.set(...part.position);
      mesh.rotation.set(...part.rotation);
      mesh.scale.set(...part.scale);
      assembly.add(mesh);
      geometriesToDispose.push(geo);
      materialsToDispose.push(mat);
    }

    // Mini-game collectible orbs when gameMode === true
    const orbs: THREE.Mesh[] = [];
    const orbGeo = new THREE.OctahedronGeometry(0.22, 0);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x22d3ee,
      emissiveIntensity: 1.5,
      metalness: 0.2,
      roughness: 0.1,
    });
    if (gameMode) {
      for (let i = 0; i < 6; i += 1) {
        const orb = new THREE.Mesh(orbGeo, orbMat);
        const ang = (i / 6) * Math.PI * 2;
        orb.position.set(Math.cos(ang) * 3.1, -0.4, Math.sin(ang) * 3.1);
        scene.add(orb);
        orbs.push(orb);
      }
    }

    let contextLost = false;
    const onLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
    };
    const onRestored = () => {
      contextLost = false;
    };
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    renderer.domElement.addEventListener('webglcontextrestored', onRestored);

    const onKeyDown = (e: KeyboardEvent) => {
      gameKeysRef.current[e.key.toLowerCase()] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      gameKeysRef.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const ro = new ResizeObserver(() => {
      if (!container) return;
      const cw = Math.max(container.clientWidth, 300);
      const ch = Math.max(container.clientHeight, 260);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    });
    ro.observe(container);

    const clock = new THREE.Clock();
    let rafId = 0;
    let disposed = false;

    const animate = () => {
      if (disposed) return;
      rafId = window.requestAnimationFrame(animate);
      if (contextLost) return;

      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();

      if (gameMode) {
        const speed = 3.2 * dt;
        const k = gameKeysRef.current;
        if (k['w'] || k['arrowup']) assembly.position.z -= speed;
        if (k['s'] || k['arrowdown']) assembly.position.z += speed;
        if (k['a'] || k['arrowleft']) assembly.position.x -= speed;
        if (k['d'] || k['arrowright']) assembly.position.x += speed;
        assembly.position.x = THREE.MathUtils.clamp(assembly.position.x, -4.2, 4.2);
        assembly.position.z = THREE.MathUtils.clamp(assembly.position.z, -4.2, 4.2);

        for (const orb of orbs) {
          orb.rotation.y += dt * 2.4;
          const dist = Math.hypot(assembly.position.x - orb.position.x, assembly.position.z - orb.position.z);
          if (dist < 1.05) {
            setGameScore((prev) => prev + 10);
            const nextAng = Math.random() * Math.PI * 2;
            const nextRad = 1.6 + Math.random() * 2.5;
            orb.position.set(Math.cos(nextAng) * nextRad, -0.4, Math.sin(nextAng) * nextRad);
          }
        }
      } else {
        assembly.position.set(0, 0, 0);
        if (scene3D.animation === 'turntable') {
          assembly.rotation.y += dt * 0.55;
        } else if (scene3D.animation === 'idle_float') {
          assembly.position.y = Math.sin(t * 1.8) * 0.1;
          assembly.rotation.y = Math.sin(t * 0.5) * 0.25;
        } else if (scene3D.animation === 'pulse') {
          const s = 1 + Math.sin(t * 3.0) * 0.04;
          assembly.scale.setScalar(s);
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      controls.dispose();
      geometriesToDispose.forEach((g) => g.dispose());
      materialsToDispose.forEach((m) => m.dispose());
      orbGeo.dispose();
      orbMat.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      modelGroupRef.current = null;
    };
  }, [subTab, scene3D, gameMode]);

  // 2D Canvas Render & Animation Loop
  useEffect(() => {
    if (subTab !== '2d') return;
    if (!is2DPlaying) return;
    const interval = window.setInterval(() => {
      setFrameTick((prev) => (prev + 1) % 120);
    }, Math.max(25, Math.round(1000 / Math.max(1, scene2D.fps || 24))));
    return () => window.clearInterval(interval);
  }, [subTab, is2DPlaying, scene2D.fps]);

  useEffect(() => {
    if (subTab !== '2d') return;
    const canvas = canvas2DRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = scene2D.background || '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle grid
    ctx.strokeStyle = 'rgba(148,163,184,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const drawShapesAtTick = (tVal: number, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      const wave = Math.sin((tVal / 20) * Math.PI * 2);
      for (const sh of scene2D.shapes) {
        const ox = sh.x + (sh.dx || 0) * wave;
        const oy = sh.y + (sh.dy || 0) * wave;
        ctx.fillStyle = sh.color || '#38bdf8';
        ctx.strokeStyle = sh.stroke || '#e2e8f0';
        ctx.lineWidth = 2;
        if (sh.type === 'rect') {
          ctx.fillRect(ox, oy, sh.w, sh.h);
          ctx.strokeRect(ox, oy, sh.w, sh.h);
        } else if (sh.type === 'circle') {
          ctx.beginPath();
          ctx.arc(ox, oy, Math.max(8, sh.w / 2), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (sh.type === 'polygon') {
          ctx.beginPath();
          ctx.moveTo(ox, oy - sh.h / 2);
          ctx.lineTo(ox + sh.w / 2, oy + sh.h / 2);
          ctx.lineTo(ox - sh.w / 2, oy + sh.h / 2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (sh.type === 'text') {
          ctx.font = '600 18px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(sh.label || 'JARVIS', ox, oy);
        }
      }
      ctx.restore();
    };

    if (onionSkin && frameTick > 0) {
      drawShapesAtTick(frameTick - 2, 0.25);
    }
    drawShapesAtTick(frameTick, 1.0);
  }, [subTab, scene2D, frameTick, onionSkin]);

  // 1D Wave Simulator
  useEffect(() => {
    if (subTab !== '1d' || !wavePlaying) return;
    const id = window.setInterval(() => {
      setWavePhase((p) => (p + 0.22) % (Math.PI * 20));
    }, 45);
    return () => window.clearInterval(id);
  }, [subTab, wavePlaying]);

  const svg1DPoints = useMemo(() => {
    const pts: Array<{ x: number; y: number; px: number; py: number }> = [];
    const n = 100;
    const min = Number.isFinite(spec1D.xMin) ? spec1D.xMin : -10;
    const max = Number.isFinite(spec1D.xMax) && spec1D.xMax > min ? spec1D.xMax : min + 20;
    const rawYs: number[] = [];
    for (let i = 0; i <= n; i += 1) {
      const x = min + (i / n) * (max - min);
      const val =
        spec1D.mode === 'physics_wave'
          ? Math.sin(x * 1.4 - wavePhase) * Math.exp(-0.08 * Math.abs(x))
          : evaluateSafeMath(spec1D.equation, x + wavePhase * 0.1);
      rawYs.push(Number.isFinite(val) ? val : 0);
    }
    const maxAbs = Math.max(1, ...rawYs.map((v) => Math.abs(v)));
    for (let i = 0; i <= n; i += 1) {
      const px = 40 + (i / n) * 680;
      const py = 160 - (rawYs[i] / maxAbs) * 120;
      pts.push({ x: min + (i / n) * (max - min), y: rawYs[i], px, py });
    }
    return pts;
  }, [spec1D, wavePhase]);

  const handleGenerateBlueprint = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setStatusNote('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/creative/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ dimension: subTab, prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (data.ok && data.spec) {
        if (subTab === '3d') {
          setScene3D({
            title: String(data.spec.title || prompt.slice(0, 40)),
            category: String(data.spec.category || 'custom'),
            animation: data.spec.animation || 'idle_float',
            parts: Array.isArray(data.spec.parts) && data.spec.parts.length > 0 ? data.spec.parts : PRESET_3D_SCENES.mech.parts,
          });
          setSelectedPartIdx(0);
        } else if (subTab === '2d') {
          setScene2D({
            title: String(data.spec.title || prompt.slice(0, 40)),
            category: String(data.spec.category || '2d_art'),
            background: String(data.spec.background || '#090d16'),
            fps: Number(data.spec.fps || 24),
            shapes: Array.isArray(data.spec.shapes) && data.spec.shapes.length > 0 ? data.spec.shapes : PRESET_2D_SCENES.sprite.shapes,
          });
        } else {
          setSpec1D({
            title: String(data.spec.title || prompt.slice(0, 40)),
            mode: data.spec.mode || 'math_plot',
            equation: String(data.spec.equation || 'sin(x)'),
            xMin: Number(data.spec.xMin ?? -10),
            xMax: Number(data.spec.xMax ?? 10),
            steps: Array.isArray(data.spec.steps) ? data.spec.steps.map(String) : ['Evaluated equation'],
            points: Array.isArray(data.spec.points) ? data.spec.points : spec1D.points,
          });
        }
        setStatusNote(`Generated ${subTab.toUpperCase()} blueprint (${data.source === 'gemini' ? 'Gemini' : 'Procedural Engine'}).`);
        onLogAction(`creative:${subTab}`, `Generated ${subTab.toUpperCase()} design for "${prompt.slice(0, 50)}"`);
      } else {
        setStatusNote(data.error || 'Unable to generate blueprint.');
      }
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Generation request failed.');
    } finally {
      setGenerating(false);
    }
  };

  const handleExport3D = useCallback(
    (format: 'glb' | 'gltf' | 'obj') => {
      const group = modelGroupRef.current;
      if (!group) return;
      const slug = (scene3D.title || 'jarvis_model').toLowerCase().replace(/[^a-z0-9]+/g, '_');
      if (format === 'obj') {
        const exporter = new OBJExporter();
        const objText = exporter.parse(group);
        downloadBlob(new Blob([objText], { type: 'text/plain;charset=utf-8' }), `${slug}.obj`);
        setStatusNote(`Exported ${slug}.obj`);
        onLogAction('export:obj', `Downloaded ${slug}.obj`);
        return;
      }
      const gltfExporter = new GLTFExporter();
      gltfExporter.parse(
        group,
        (result) => {
          if (result instanceof ArrayBuffer) {
            downloadBlob(new Blob([result], { type: 'model/gltf-binary' }), `${slug}.glb`);
            setStatusNote(`Exported binary ${slug}.glb`);
            onLogAction('export:glb', `Downloaded ${slug}.glb`);
          } else {
            downloadBlob(
              new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' }),
              `${slug}.gltf`
            );
            setStatusNote(`Exported ${slug}.gltf`);
            onLogAction('export:gltf', `Downloaded ${slug}.gltf`);
          }
        },
        (err) => {
          setStatusNote(`3D export error: ${String(err)}`);
        },
        { binary: format === 'glb' }
      );
    },
    [scene3D.title, onLogAction]
  );

  const handleExport2D = (format: 'png' | 'svg') => {
    const slug = (scene2D.title || 'jarvis_2d').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (format === 'png') {
      const canvas = canvas2DRef.current;
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, `${slug}.png`);
          setStatusNote(`Exported ${slug}.png`);
          onLogAction('export:png', `Downloaded ${slug}.png`);
        }
      }, 'image/png');
      return;
    }
    const svgParts = scene2D.shapes.map((sh) => {
      if (sh.type === 'rect') {
        return `<rect x="${sh.x}" y="${sh.y}" width="${sh.w}" height="${sh.h}" fill="${sh.color}" stroke="${sh.stroke}" stroke-width="2" />`;
      }
      if (sh.type === 'circle') {
        return `<circle cx="${sh.x}" cy="${sh.y}" r="${Math.max(8, sh.w / 2)}" fill="${sh.color}" stroke="${sh.stroke}" stroke-width="2" />`;
      }
      if (sh.type === 'polygon') {
        const p1 = `${sh.x},${sh.y - sh.h / 2}`;
        const p2 = `${sh.x + sh.w / 2},${sh.y + sh.h / 2}`;
        const p3 = `${sh.x - sh.w / 2},${sh.y + sh.h / 2}`;
        return `<polygon points="${p1} ${p2} ${p3}" fill="${sh.color}" stroke="${sh.stroke}" stroke-width="2" />`;
      }
      return `<text x="${sh.x}" y="${sh.y}" fill="${sh.color}" font-family="monospace" font-size="18" text-anchor="middle">${sh.label || ''}</text>`;
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" style="background:${scene2D.background}">${svgParts.join('')}</svg>`;
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${slug}.svg`);
    setStatusNote(`Exported ${slug}.svg`);
    onLogAction('export:svg', `Downloaded ${slug}.svg`);
  };

  const handleExport1D = (format: 'svg' | 'csv') => {
    const slug = (spec1D.title || 'jarvis_1d').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (format === 'csv') {
      const rows =
        spec1D.mode === 'data_chart'
          ? ['Label,Value', ...spec1D.points.map((p) => `${p.label},${p.value}`)]
          : ['x,y', ...svg1DPoints.map((pt) => `${pt.x.toFixed(4)},${pt.y.toFixed(4)}`)];
      downloadBlob(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }), `${slug}.csv`);
      setStatusNote(`Exported ${slug}.csv`);
      return;
    }
    const polyline = svg1DPoints.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="320" style="background:#080c14"><polyline fill="none" stroke="#38bdf8" stroke-width="2.5" points="${polyline}" /></svg>`;
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${slug}.svg`);
    setStatusNote(`Exported ${slug}.svg`);
  };

  const handleSaveCurrentAsset = async () => {
    const title = subTab === '3d' ? scene3D.title : subTab === '2d' ? scene2D.title : spec1D.title;
    const specJson = JSON.stringify(subTab === '3d' ? scene3D : subTab === '2d' ? scene2D : spec1D);
    await onSaveAsset({
      id: `asset_${subTab}_${Date.now()}`,
      dimension: subTab,
      title,
      category: subTab === '3d' ? scene3D.category : subTab === '2d' ? scene2D.category : spec1D.mode,
      exportFormat: subTab === '3d' ? 'glb' : subTab === '2d' ? 'png' : 'svg',
      specJson,
    });
    setStatusNote(`Saved "${title}" to Creation History.`);
  };

  const handleCheckBlender = async () => {
    if (!companionConnected) {
      setBlenderStatus({
        checked: true,
        installed: false,
        text: 'Connect Local Desktop Companion to probe Blender on this PC.',
      });
      return;
    }
    const res = await companionBridge.checkBlender();
    setBlenderStatus({
      checked: true,
      installed: Boolean(res.data?.installed),
      text: res.message,
    });
  };

  const selectedPart = scene3D.parts[selectedPartIdx];

  return (
    <div className="flex flex-col gap-4 w-full text-slate-200">
      {/* Header & Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('3d')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border transition ${
              subTab === '3d'
                ? 'bg-sky-500/15 border-sky-400/60 text-sky-300'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Box className="w-3.5 h-3.5" /> 3D Studio
          </button>
          <button
            type="button"
            onClick={() => setSubTab('2d')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border transition ${
              subTab === '2d'
                ? 'bg-sky-500/15 border-sky-400/60 text-sky-300'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> 2D Studio
          </button>
          <button
            type="button"
            onClick={() => setSubTab('1d')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border transition ${
              subTab === '1d'
                ? 'bg-sky-500/15 border-sky-400/60 text-sky-300'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <LineChart className="w-3.5 h-3.5" /> 1D Math & Data
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveCurrentAsset}
            className="px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-1.5 hover:bg-emerald-500/25"
          >
            <Save className="w-3.5 h-3.5" /> Save Asset
          </button>
        </div>
      </div>

      {/* Natural Language Generator Bar */}
      <div className="flex flex-wrap gap-2 items-center bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleGenerateBlueprint();
          }}
          placeholder={
            subTab === '3d'
              ? 'Describe a 3D character, house, robot, vehicle, or scene...'
              : subTab === '2d'
              ? 'Describe a 2D character sprite, UI widget, or animated banner...'
              : 'Describe a mathematical curve, physics wave, or linear sequence...'
          }
          className="flex-1 min-w-[220px] bg-slate-900/90 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
        />
        <button
          type="button"
          disabled={generating || !prompt.trim()}
          onClick={() => void handleGenerateBlueprint()}
          className="px-3.5 py-2 rounded-md bg-sky-500/20 border border-sky-400/50 text-sky-200 text-xs font-medium flex items-center gap-1.5 hover:bg-sky-500/30 disabled:opacity-45"
        >
          <Sparkles className="w-3.5 h-3.5" /> {generating ? 'Synthesizing...' : 'Generate'}
        </button>
        {statusNote && (
          <span className="text-[11px] font-mono text-sky-300/90 px-2">{statusNote}</span>
        )}
      </div>

      {/* 3D STUDIO */}
      {subTab === '3d' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 flex flex-col gap-2">
            <div className="relative h-[380px] w-full rounded-lg border border-slate-800 bg-[#060a12] overflow-hidden">
              <div ref={mount3DRef} className="w-full h-full" />
              <div className="absolute top-2.5 left-2.5 flex items-center gap-2 bg-slate-950/85 border border-slate-800 px-2.5 py-1 rounded text-[11px] font-mono">
                <span className="text-sky-300">{scene3D.title}</span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400 tabular-nums">{scene3D.parts.length} parts</span>
              </div>
              {gameMode && (
                <div className="absolute top-2.5 right-2.5 bg-emerald-950/90 border border-emerald-500/50 px-3 py-1 rounded text-xs font-mono text-emerald-300 tabular-nums">
                  WASD / Arrows Move • Score: {gameScore}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setScene3D(PRESET_3D_SCENES.mech);
                    setSelectedPartIdx(0);
                  }}
                  className="px-2.5 py-1 rounded border border-slate-800 bg-slate-900 text-[11px] hover:border-sky-500/50"
                >
                  Mech Character
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScene3D(PRESET_3D_SCENES.house);
                    setSelectedPartIdx(0);
                  }}
                  className="px-2.5 py-1 rounded border border-slate-800 bg-slate-900 text-[11px] hover:border-sky-500/50"
                >
                  Modern Villa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScene3D(PRESET_3D_SCENES.satellite);
                    setSelectedPartIdx(0);
                  }}
                  className="px-2.5 py-1 rounded border border-slate-800 bg-slate-900 text-[11px] hover:border-sky-500/50"
                >
                  Satellite Rig
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGameMode((v) => !v);
                    setGameScore(0);
                  }}
                  className={`px-2.5 py-1 rounded border text-[11px] flex items-center gap-1 ${
                    gameMode
                      ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                      : 'border-slate-800 bg-slate-900 text-slate-300'
                  }`}
                >
                  <Gamepad2 className="w-3 h-3" /> {gameMode ? 'Exit 3D Game' : 'Play 3D Arena'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleExport3D('glb')}
                  className="px-2.5 py-1 rounded bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-mono flex items-center gap-1 hover:bg-sky-500/25"
                >
                  <Download className="w-3 h-3" /> .GLB
                </button>
                <button
                  type="button"
                  onClick={() => handleExport3D('gltf')}
                  className="px-2.5 py-1 rounded bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-mono flex items-center gap-1 hover:bg-sky-500/25"
                >
                  <Download className="w-3 h-3" /> .GLTF
                </button>
                <button
                  type="button"
                  onClick={() => handleExport3D('obj')}
                  className="px-2.5 py-1 rounded bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-mono flex items-center gap-1 hover:bg-sky-500/25"
                >
                  <Download className="w-3 h-3" /> .OBJ
                </button>
                <button
                  type="button"
                  onClick={() => void handleCheckBlender()}
                  className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 text-[11px]"
                >
                  Blender Check
                </button>
              </div>
            </div>
            {blenderStatus.checked && (
              <div className="text-[11px] font-mono px-2.5 py-1.5 rounded bg-slate-900/90 border border-slate-800 text-slate-300">
                {blenderStatus.text}
              </div>
            )}
          </div>

          {/* 3D Parts & Material Inspector */}
          <div className="lg:col-span-4 bg-slate-950/70 border border-slate-800 rounded-lg p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Mesh Assembly ({scene3D.parts.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  const nextPart: Part3DSpec = {
                    name: `part_${scene3D.parts.length + 1}`,
                    shape: 'box',
                    position: [0, 0.4, 0],
                    rotation: [0, 0, 0],
                    scale: [0.4, 0.4, 0.4],
                    color: '#38bdf8',
                    metalness: 0.6,
                    roughness: 0.3,
                  };
                  setScene3D((prev) => ({ ...prev, parts: [...prev.parts, nextPart] }));
                  setSelectedPartIdx(scene3D.parts.length);
                }}
                className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Part
              </button>
            </div>

            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {scene3D.parts.map((p, idx) => (
                <button
                  key={`${p.name}-${idx}`}
                  type="button"
                  onClick={() => setSelectedPartIdx(idx)}
                  className={`px-2 py-1 rounded text-[11px] font-mono border ${
                    idx === selectedPartIdx
                      ? 'border-sky-400 bg-sky-500/15 text-sky-200'
                      : 'border-slate-800 bg-slate-900 text-slate-400'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {selectedPart && (
              <div className="space-y-2 border-t border-slate-800 pt-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-400">Shape</span>
                    <select
                      value={selectedPart.shape}
                      onChange={(e) => {
                        const val = e.target.value as Part3DSpec['shape'];
                        setScene3D((prev) => ({
                          ...prev,
                          parts: prev.parts.map((pt, i) => (i === selectedPartIdx ? { ...pt, shape: val } : pt)),
                        }));
                      }}
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
                    >
                      <option value="box">Box</option>
                      <option value="sphere">Sphere</option>
                      <option value="cylinder">Cylinder</option>
                      <option value="cone">Cone</option>
                      <option value="torus">Torus</option>
                      <option value="capsule">Capsule</option>
                      <option value="dodecahedron">Dodecahedron</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-400">Albedo Color</span>
                    <input
                      type="color"
                      value={selectedPart.color || '#38bdf8'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setScene3D((prev) => ({
                          ...prev,
                          parts: prev.parts.map((pt, i) => (i === selectedPartIdx ? { ...pt, color: val } : pt)),
                        }));
                      }}
                      className="h-7 w-full bg-slate-900 border border-slate-800 rounded cursor-pointer"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-400 flex justify-between">
                    <span>Metalness</span>
                    <span className="font-mono tabular-nums">{selectedPart.metalness.toFixed(2)}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selectedPart.metalness}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setScene3D((prev) => ({
                        ...prev,
                        parts: prev.parts.map((pt, i) => (i === selectedPartIdx ? { ...pt, metalness: val } : pt)),
                      }));
                    }}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-400">Scene Motion</span>
                  <select
                    value={scene3D.animation}
                    onChange={(e) =>
                      setScene3D((prev) => ({
                        ...prev,
                        animation: e.target.value as Scene3DSpec['animation'],
                      }))
                    }
                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
                  >
                    <option value="idle_float">Idle Float</option>
                    <option value="turntable">Turntable Spin</option>
                    <option value="pulse">Pulse</option>
                    <option value="none">Static</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2D STUDIO */}
      {subTab === '2d' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 flex flex-col gap-2">
            <canvas
              ref={canvas2DRef}
              width={800}
              height={460}
              className="w-full h-auto rounded-lg border border-slate-800 bg-[#080c14]"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIs2DPlaying((p) => !p)}
                  className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs flex items-center gap-1"
                >
                  {is2DPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {is2DPlaying ? 'Pause' : 'Play'}
                </button>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={onionSkin}
                    onChange={(e) => setOnionSkin(e.target.checked)}
                  />
                  Onion Skin
                </label>
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  Frame {frameTick} @ {scene2D.fps}fps
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setScene2D(PRESET_2D_SCENES.sprite)}
                  className="px-2.5 py-1 rounded border border-slate-800 bg-slate-900 text-[11px]"
                >
                  Sprite Preset
                </button>
                <button
                  type="button"
                  onClick={() => setScene2D(PRESET_2D_SCENES.ui_card)}
                  className="px-2.5 py-1 rounded border border-slate-800 bg-slate-900 text-[11px]"
                >
                  HUD Preset
                </button>
                <button
                  type="button"
                  onClick={() => handleExport2D('png')}
                  className="px-2.5 py-1 rounded bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-mono flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> .PNG
                </button>
                <button
                  type="button"
                  onClick={() => handleExport2D('svg')}
                  className="px-2.5 py-1 rounded bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-mono flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> .SVG
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase text-slate-400">
                2D Vector Layers ({scene2D.shapes.length})
              </span>
              <button
                type="button"
                onClick={() =>
                  setScene2D((prev) => ({
                    ...prev,
                    shapes: [
                      ...prev.shapes,
                      { type: 'circle', x: 400, y: 230, w: 80, h: 80, color: '#0284c7', stroke: '#7dd3fc', dx: 6, dy: 0 },
                    ],
                  }))
                }
                className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Shape
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={119}
              value={frameTick}
              onChange={(e) => {
                setIs2DPlaying(false);
                setFrameTick(parseInt(e.target.value, 10));
              }}
              className="w-full"
            />
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {scene2D.shapes.map((sh, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 px-2.5 py-1.5 rounded text-xs">
                  <span className="font-mono text-slate-300">
                    #{i + 1} {sh.type} {sh.label ? `(${sh.label})` : ''}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={sh.color || '#38bdf8'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setScene2D((prev) => ({
                          ...prev,
                          shapes: prev.shapes.map((item, idx) => (idx === i ? { ...item, color: val } : item)),
                        }));
                      }}
                      className="w-6 h-5 rounded border border-slate-700 bg-transparent"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setScene2D((prev) => ({
                          ...prev,
                          shapes: prev.shapes.filter((_, idx) => idx !== i),
                        }))
                      }
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 1D STUDIO */}
      {subTab === '1d' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 flex flex-col gap-3">
            <div className="rounded-lg border border-slate-800 bg-[#080c14] p-4">
              {spec1D.mode === 'data_chart' ? (
                <svg viewBox="0 0 760 280" className="w-full h-64">
                  <line x1="40" y1="240" x2="720" y2="240" stroke="#334155" strokeWidth="1" />
                  {spec1D.points.map((pt, idx) => {
                    const maxV = Math.max(1, ...spec1D.points.map((p) => Math.abs(p.value)));
                    const barW = Math.min(70, Math.floor(600 / Math.max(1, spec1D.points.length)) - 12);
                    const barH = Math.max(8, (Math.abs(pt.value) / maxV) * 180);
                    const bx = 65 + idx * (barW + 18);
                    const by = 240 - barH;
                    return (
                      <g key={`${pt.label}-${idx}`}>
                        <rect x={bx} y={by} width={barW} height={barH} fill="#0ea5e9" rx="3" />
                        <text x={bx + barW / 2} y="258" fill="#94a3b8" fontSize="11" textAnchor="middle">
                          {pt.label}
                        </text>
                        <text x={bx + barW / 2} y={by - 6} fill="#7dd3fc" fontSize="11" textAnchor="middle">
                          {pt.value}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              ) : spec1D.mode === 'linear_sequence' ? (
                <div className="flex flex-wrap items-center gap-3 py-8 justify-center">
                  {spec1D.steps.map((st, idx) => (
                    <React.Fragment key={idx}>
                      <div className="px-3.5 py-2 rounded-md border border-sky-500/40 bg-slate-900 text-xs font-mono text-sky-200">
                        {idx + 1}. {st}
                      </div>
                      {idx < spec1D.steps.length - 1 && <span className="text-sky-400 font-mono">→</span>}
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <svg viewBox="0 0 760 300" className="w-full h-64">
                  <line x1="40" y1="160" x2="720" y2="160" stroke="#1e293b" strokeWidth="1" />
                  <line x1="380" y1="20" x2="380" y2="280" stroke="#1e293b" strokeWidth="1" />
                  <polyline
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.5"
                    points={svg1DPoints.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ')}
                  />
                </svg>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
              <div className="flex items-center gap-2">
                {(['math_plot', 'data_chart', 'linear_sequence', 'physics_wave'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSpec1D((prev) => ({ ...prev, mode: m }))}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono border ${
                      spec1D.mode === m
                        ? 'border-sky-400 bg-sky-500/15 text-sky-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {m.replace('_', ' ')}
                  </button>
                ))}
                {(spec1D.mode === 'physics_wave' || spec1D.mode === 'math_plot') && (
                  <button
                    type="button"
                    onClick={() => setWavePlaying((w) => !w)}
                    className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-[11px]"
                  >
                    {wavePlaying ? 'Pause Wave' : 'Animate'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleExport1D('svg')}
                  className="px-2.5 py-1 rounded bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-mono flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> .SVG
                </button>
                <button
                  type="button"
                  onClick={() => handleExport1D('csv')}
                  className="px-2.5 py-1 rounded bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-mono flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> .CSV
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-400">Equation y = f(x)</span>
              <input
                type="text"
                value={spec1D.equation}
                onChange={(e) => setSpec1D((prev) => ({ ...prev, equation: e.target.value }))}
                className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-xs text-sky-200"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-400">xMin</span>
                <input
                  type="number"
                  value={spec1D.xMin}
                  onChange={(e) => setSpec1D((prev) => ({ ...prev, xMin: Number(e.target.value) }))}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 font-mono text-xs"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-400">xMax</span>
                <input
                  type="number"
                  value={spec1D.xMax}
                  onChange={(e) => setSpec1D((prev) => ({ ...prev, xMax: Number(e.target.value) }))}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 font-mono text-xs"
                />
              </label>
            </div>
            <div className="border-t border-slate-800 pt-2">
              <span className="text-[11px] text-slate-400 block mb-1.5">Saved Creation History ({assets.length})</span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {assets.slice(0, 12).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 px-2 py-1.5 rounded">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(a.specJson);
                          if (a.dimension === '3d') {
                            setSubTab('3d');
                            setScene3D(parsed);
                          } else if (a.dimension === '2d') {
                            setSubTab('2d');
                            setScene2D(parsed);
                          } else {
                            setSubTab('1d');
                            setSpec1D(parsed);
                          }
                        } catch {
                          // ignore
                        }
                      }}
                      className="text-left truncate flex-1 hover:text-sky-300"
                    >
                      <span className="font-mono text-[10px] text-sky-400 mr-1.5">[{a.dimension.toUpperCase()}]</span>
                      {a.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteAsset(a.id)}
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {assets.length === 0 && (
                  <p className="text-[11px] text-slate-500">Save any 3D, 2D, or 1D design to persist it to Firestore.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

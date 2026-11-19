import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { CoreAvatarMode, CoreVisualQuality, JarvisLogoState } from '../types/assistant';

interface Jarvis3DCoreProps {
  coreState: JarvisLogoState;
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
  standbyAnalyser: AnalyserNode | null;
  isMuted: boolean;
  visualQuality?: CoreVisualQuality;
  avatarMode?: CoreAvatarMode;
  timerProgress?: number; // 0..1 remaining fraction when timer active
  onCoreClick?: () => void;
}

interface StatePalette {
  colorA: number;
  colorB: number;
  ringColor: number;
  speedMul: number;
  bloomStrength: number;
  displacement: number;
  flowMode: number;
  camDist: number;
  camFov: number;
  dimFactor: number;
}

const STATE_PALETTES: Record<JarvisLogoState, StatePalette> = {
  idle: {
    colorA: 0x0ea5e9,
    colorB: 0x1d4ed8,
    ringColor: 0x22d3ee,
    speedMul: 0.42,
    bloomStrength: 0.62,
    displacement: 0.055,
    flowMode: 0,
    camDist: 5.55,
    camFov: 40,
    dimFactor: 1.0,
  },
  standby: {
    colorA: 0x22d3ee,
    colorB: 0x0284c7,
    ringColor: 0x38bdf8,
    speedMul: 0.72,
    bloomStrength: 0.72,
    displacement: 0.075,
    flowMode: 0,
    camDist: 5.45,
    camFov: 40,
    dimFactor: 1.0,
  },
  waking: {
    colorA: 0x67e8f9,
    colorB: 0x2563eb,
    ringColor: 0x38bdf8,
    speedMul: 2.35,
    bloomStrength: 1.18,
    displacement: 0.16,
    flowMode: -1,
    camDist: 5.15,
    camFov: 42,
    dimFactor: 1.15,
  },
  listening: {
    colorA: 0x38bdf8,
    colorB: 0x06b6d4,
    ringColor: 0x67e8f9,
    speedMul: 1.28,
    bloomStrength: 0.94,
    displacement: 0.13,
    flowMode: 1,
    camDist: 5.2,
    camFov: 41,
    dimFactor: 1.05,
  },
  thinking: {
    colorA: 0x818cf8,
    colorB: 0x7c3aed,
    ringColor: 0xa78bfa,
    speedMul: 2.1,
    bloomStrength: 1.02,
    displacement: 0.14,
    flowMode: 1,
    camDist: 5.3,
    camFov: 40,
    dimFactor: 1.05,
  },
  speaking: {
    colorA: 0x22d3ee,
    colorB: 0x3b82f6,
    ringColor: 0x7dd3fc,
    speedMul: 1.65,
    bloomStrength: 1.12,
    displacement: 0.19,
    flowMode: 0,
    camDist: 5.18,
    camFov: 41,
    dimFactor: 1.1,
  },
  executing: {
    colorA: 0x34d399,
    colorB: 0x059669,
    ringColor: 0x10b981,
    speedMul: 2.55,
    bloomStrength: 1.08,
    displacement: 0.15,
    flowMode: 1,
    camDist: 5.25,
    camFov: 41,
    dimFactor: 1.08,
  },
  timer: {
    colorA: 0xfbbf24,
    colorB: 0xd97706,
    ringColor: 0xfcd34d,
    speedMul: 0.95,
    bloomStrength: 0.88,
    displacement: 0.085,
    flowMode: 0,
    camDist: 5.65,
    camFov: 40,
    dimFactor: 1.0,
  },
  alarm: {
    colorA: 0xf43f5e,
    colorB: 0xf59e0b,
    ringColor: 0xfb7185,
    speedMul: 2.9,
    bloomStrength: 1.25,
    displacement: 0.22,
    flowMode: 2,
    camDist: 5.05,
    camFov: 43,
    dimFactor: 1.2,
  },
  reminder: {
    colorA: 0x14b8a6,
    colorB: 0x0ea5e9,
    ringColor: 0x5eead4,
    speedMul: 1.15,
    bloomStrength: 0.88,
    displacement: 0.1,
    flowMode: 0,
    camDist: 5.4,
    camFov: 40,
    dimFactor: 1.0,
  },
  searching: {
    colorA: 0x06b6d4,
    colorB: 0x2563eb,
    ringColor: 0x67e8f9,
    speedMul: 2.15,
    bloomStrength: 0.98,
    displacement: 0.12,
    flowMode: -1,
    camDist: 5.5,
    camFov: 41,
    dimFactor: 1.05,
  },
  browser: {
    colorA: 0x38bdf8,
    colorB: 0x10b981,
    ringColor: 0x22d3ee,
    speedMul: 1.75,
    bloomStrength: 0.92,
    displacement: 0.11,
    flowMode: -1,
    camDist: 5.45,
    camFov: 41,
    dimFactor: 1.0,
  },
  gaming: {
    colorA: 0x6366f1,
    colorB: 0xec4899,
    ringColor: 0x818cf8,
    speedMul: 1.55,
    bloomStrength: 0.96,
    displacement: 0.125,
    flowMode: 0,
    camDist: 5.4,
    camFov: 40,
    dimFactor: 1.02,
  },
  focus: {
    colorA: 0x60a5fa,
    colorB: 0x1e3a8a,
    ringColor: 0x93c5fd,
    speedMul: 0.48,
    bloomStrength: 0.54,
    displacement: 0.045,
    flowMode: 1,
    camDist: 5.6,
    camFov: 39,
    dimFactor: 0.9,
  },
  care: {
    colorA: 0xf472b6,
    colorB: 0x60a5fa,
    ringColor: 0xf9a8d4,
    speedMul: 0.44,
    bloomStrength: 0.72,
    displacement: 0.065,
    flowMode: 0,
    camDist: 5.45,
    camFov: 40,
    dimFactor: 0.96,
  },
  sleep: {
    colorA: 0x1e40af,
    colorB: 0x0f172a,
    ringColor: 0x3b82f6,
    speedMul: 0.16,
    bloomStrength: 0.28,
    displacement: 0.025,
    flowMode: 0,
    camDist: 5.75,
    camFov: 39,
    dimFactor: 0.45,
  },
  error: {
    colorA: 0xf43f5e,
    colorB: 0xf97316,
    ringColor: 0xfb7185,
    speedMul: 1.35,
    bloomStrength: 0.98,
    displacement: 0.16,
    flowMode: -1,
    camDist: 5.25,
    camFov: 42,
    dimFactor: 1.08,
  },
  completed: {
    colorA: 0x10b981,
    colorB: 0x06b6d4,
    ringColor: 0x6ee7b7,
    speedMul: 1.85,
    bloomStrength: 1.15,
    displacement: 0.13,
    flowMode: 2,
    camDist: 5.3,
    camFov: 41,
    dimFactor: 1.12,
  },
  disconnected: {
    colorA: 0x64748b,
    colorB: 0x334155,
    ringColor: 0x475569,
    speedMul: 0.18,
    bloomStrength: 0.25,
    displacement: 0.02,
    flowMode: 0,
    camDist: 5.7,
    camFov: 40,
    dimFactor: 0.45,
  },
};

const CORE_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uAudio;
  uniform float uDisplacement;
  varying vec3 vNormalView;
  varying vec3 vWorldPos;
  varying float vWave;

  float harmonicWave(vec3 p, float t) {
    float n1 = sin(p.x * 3.5 + t * 2.15) * cos(p.y * 3.2 - t * 1.65) * sin(p.z * 3.6 + t * 1.45);
    float n2 = sin(p.y * 6.8 - t * 3.1) * cos(p.z * 5.9 + t * 2.6) * 0.42;
    return n1 + n2;
  }

  void main() {
    float wave = harmonicWave(position, uTime);
    vWave = wave;
    float amp = uDisplacement * (0.45 + uAudio * 1.65);
    vec3 displaced = position + normal * (wave * amp);

    vNormalView = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const CORE_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uAudio;
  uniform float uHover;
  uniform float uDim;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec3 vNormalView;
  varying vec3 vWorldPos;
  varying float vWave;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 worldNorm = normalize(vWorldPos);
    float fresnel = pow(1.0 - max(0.0, dot(viewDir, worldNorm)), 2.35);

    float scan = 0.5 + 0.5 * sin(vWorldPos.y * 24.0 - uTime * 3.8);
    float coreMix = clamp(vWave * 0.5 + 0.5, 0.0, 1.0);

    vec3 baseCol = mix(uColorB, uColorA, coreMix);
    vec3 rimCol = mix(uColorA, vec3(0.9, 0.98, 1.0), 0.45 + uHover * 0.25);

    vec3 finalCol = (baseCol * (0.45 + scan * 0.28 + uAudio * 0.55) + rimCol * fresnel * (1.28 + uAudio * 0.95)) * uDim;
    float alpha = clamp((0.42 + fresnel * 0.58 + uAudio * 0.22) * clamp(uDim, 0.45, 1.0), 0.28, 0.98);

    gl_FragColor = vec4(finalCol, alpha);
  }
`;

const PARTICLE_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uAudio;
  uniform float uPixelRatio;
  uniform float uFlowMode;
  attribute float aScale;
  attribute float aPhase;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    float speed = (0.18 + aScale * 0.14);
    float angle = uTime * speed + aPhase;
    float c = cos(angle * 0.35);
    float s = sin(angle * 0.35);
    pos.xz = mat2(c, -s, s, c) * pos.xz;

    if (uFlowMode > 0.5 && uFlowMode < 1.5) {
      // Thinking/Focus: inward breathing vortex
      float pull = 0.72 + 0.28 * fract(-uTime * 0.22 + aPhase / 6.2831);
      pos *= pull;
    } else if (uFlowMode < -0.5) {
      // Searching/Browser: outward radar waves
      float expand = 0.8 + 0.55 * fract(uTime * 0.28 + aPhase / 6.2831);
      pos *= expand;
    } else if (uFlowMode > 1.5) {
      // Completed/Alarm: rising burst aura
      pos.y += fract(uTime * 0.35 + aPhase / 6.2831) * 0.9 - 0.35;
    } else {
      pos.y += sin(uTime * 1.4 + aPhase) * (0.06 + uAudio * 0.14);
    }

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = clamp((18.0 + uAudio * 14.0) * aScale * uPixelRatio / max(1.0, -mvPos.z), 1.5, 16.0);
    vAlpha = 0.42 + 0.46 * sin(uTime * 2.2 + aPhase);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const PARTICLE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uDim;
  varying float vAlpha;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float strength = pow(1.0 - dist * 2.0, 2.2);
    gl_FragColor = vec4(uColor * (1.28 * uDim), strength * vAlpha);
  }
`;

const TIMER_ARC_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TIMER_ARC_FRAGMENT_SHADER = `
  uniform float uProgress;
  uniform float uVisible;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    if (uVisible < 0.02) discard;
    // Torus uv.x wraps 0..1 around the full circle
    float frac = 1.0 - vUv.x;
    float arcFillMask = step(frac, clamp(uProgress, 0.0, 1.0));
    float baseTrack = 0.14;
    float alpha = mix(baseTrack, 0.95, arcFillMask) * uVisible;
    vec3 col = mix(uColor * 0.35, uColor * 1.4, arcFillMask);
    gl_FragColor = vec4(col, alpha);
  }
`;

const FLOOR_GLOW_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLOOR_GLOW_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uEnergy;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;
    float ring = smoothstep(0.95, 0.18, d);
    float innerPulse = pow(max(0.0, 1.0 - d), 2.4);
    float alpha = (ring * 0.12 + innerPulse * 0.22) * (0.7 + uEnergy * 0.6);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export const Jarvis3DCore: React.FC<Jarvis3DCoreProps> = ({
  coreState,
  inputAnalyser,
  outputAnalyser,
  standbyAnalyser,
  isMuted,
  visualQuality = 'balanced',
  avatarMode = 'orb',
  timerProgress = 0,
  onCoreClick,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglUnsupported, setWebglUnsupported] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

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
  const qualityRef = useRef<CoreVisualQuality>(visualQuality);
  qualityRef.current = visualQuality;
  const avatarModeRef = useRef<CoreAvatarMode>(avatarMode);
  avatarModeRef.current = avatarMode;
  const timerProgressRef = useRef<number>(timerProgress);
  timerProgressRef.current = timerProgress;
  const onClickRef = useRef(onCoreClick);
  onClickRef.current = onCoreClick;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: qualityRef.current !== 'low',
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnsupported(true);
      return;
    }

    const glCtx = renderer.getContext();
    const debugExt = glCtx.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = debugExt
      ? String(glCtx.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) || '')
      : '';
    const isSoftwareGl = /swiftshader|llvmpipe|software|microsoft basic/i.test(
      rendererStr
    );

    const maxDpr = isSoftwareGl
      ? 1
      : qualityRef.current === 'high'
      ? Math.min(window.devicePixelRatio || 1, 2)
      : qualityRef.current === 'balanced'
      ? Math.min(window.devicePixelRatio || 1, 1.5)
      : 1;

    renderer.setPixelRatio(maxDpr);
    const initW = Math.max(container.clientWidth || 360, 260);
    const initH = Math.max(container.clientHeight || 360, 260);
    renderer.setSize(initW, initH);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.outline = 'none';

    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, initW / initH, 0.1, 100);
    camera.position.set(0, 0.18, 5.55);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x94a3b8, 0.65);
    scene.add(ambientLight);
    const keyLight = new THREE.DirectionalLight(0x67e8f9, 2.2);
    keyLight.position.set(4, 5, 4);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x3b82f6, 3.2, 18);
    rimLight.position.set(-4, -2, -3);
    scene.add(rimLight);
    const corePointLight = new THREE.PointLight(0x22d3ee, 2.8, 11);
    scene.add(corePointLight);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const orbGroup = new THREE.Group();
    rootGroup.add(orbGroup);

    // 1. Inner Brushed-Titanium Metallic Nucleus
    const nucleusGeo = new THREE.OctahedronGeometry(0.38, 1);
    const nucleusMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      emissive: 0x22d3ee,
      emissiveIntensity: 1.15,
      metalness: 0.9,
      roughness: 0.16,
      clearcoat: 0.7,
      clearcoatRoughness: 0.2,
    });
    const nucleusMesh = new THREE.Mesh(nucleusGeo, nucleusMat);
    orbGroup.add(nucleusMesh);

    // 2. Inner Harmonic Plasma Core Sphere
    const coreGeo = new THREE.IcosahedronGeometry(0.9, isSoftwareGl ? 3 : 5);
    const coreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAudio: { value: 0 },
        uDisplacement: { value: 0.06 },
        uHover: { value: 0 },
        uDim: { value: 1.0 },
        uColorA: { value: new THREE.Color(STATE_PALETTES.idle.colorA) },
        uColorB: { value: new THREE.Color(STATE_PALETTES.idle.colorB) },
      },
      vertexShader: CORE_VERTEX_SHADER,
      fragmentShader: CORE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    orbGroup.add(coreMesh);

    // 3. Optical Glass Containment Shell (frosted translucent lens layer)
    const glassGeo = new THREE.IcosahedronGeometry(1.05, 2);
    const glassMat = isSoftwareGl
      ? new THREE.MeshStandardMaterial({
          color: 0xbae6fd,
          transparent: true,
          opacity: 0.14,
          roughness: 0.2,
          metalness: 0.15,
          depthWrite: false,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xe0f2fe,
          transmission: 0.68,
          opacity: 0.28,
          transparent: true,
          roughness: 0.16,
          metalness: 0.05,
          ior: 1.42,
          thickness: 0.35,
          depthWrite: false,
        });
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.renderOrder = 2;
    orbGroup.add(glassMesh);

    // 4. Dual Geodesic Containment Wireframes
    const innerCageGeo = new THREE.IcosahedronGeometry(1.18, 2);
    const innerWireGeo = new THREE.WireframeGeometry(innerCageGeo);
    innerCageGeo.dispose();
    const innerWireMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.36,
    });
    const innerWireMesh = new THREE.LineSegments(innerWireGeo, innerWireMat);
    orbGroup.add(innerWireMesh);

    const outerCageGeo = new THREE.IcosahedronGeometry(1.34, 1);
    const outerWireGeo = new THREE.WireframeGeometry(outerCageGeo);
    outerCageGeo.dispose();
    const outerWireMat = new THREE.LineBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.18,
    });
    const outerWireMesh = new THREE.LineSegments(outerWireGeo, outerWireMat);
    orbGroup.add(outerWireMesh);

    // 5. Four Multi-Axis Mechanical Gimbal Rings + 8 Sensor Nodes
    const gimbalGroup = new THREE.Group();
    orbGroup.add(gimbalGroup);

    const ringSpecs = [
      { radius: 1.5, tube: 0.022, tiltX: Math.PI * 0.22, tiltY: 0.25 },
      { radius: 1.67, tube: 0.017, tiltX: -Math.PI * 0.34, tiltY: -0.45 },
      { radius: 1.84, tube: 0.014, tiltX: Math.PI * 0.48, tiltY: 0.15 },
      { radius: 2.02, tube: 0.012, tiltX: -Math.PI * 0.16, tiltY: 0.65 },
    ];

    const ringMatPrimary = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.72,
      metalness: 0.9,
      roughness: 0.22,
    });

    const nodeGeo = new THREE.SphereGeometry(0.044, 12, 12);
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });

    const ringGroups: THREE.Group[] = [];
    const ringGeometries: THREE.BufferGeometry[] = [];

    ringSpecs.forEach((spec, idx) => {
      const rGroup = new THREE.Group();
      rGroup.rotation.set(spec.tiltX, spec.tiltY, idx * 0.55);

      const tGeo = new THREE.TorusGeometry(
        spec.radius,
        spec.tube,
        12,
        isSoftwareGl ? 64 : 96
      );
      ringGeometries.push(tGeo);
      const tMesh = new THREE.Mesh(tGeo, ringMatPrimary);
      rGroup.add(tMesh);

      for (let s = 0; s < 2; s += 1) {
        const node = new THREE.Mesh(nodeGeo, nodeMat);
        const angle = s * Math.PI + idx * 0.7;
        node.position.set(
          Math.cos(angle) * spec.radius,
          Math.sin(angle) * spec.radius,
          0
        );
        rGroup.add(node);
      }

      gimbalGroup.add(rGroup);
      ringGroups.push(rGroup);
    });

    // 6. Dedicated 3D Timer Progress Arc Ring
    const timerArcGeo = new THREE.TorusGeometry(2.2, 0.03, 12, isSoftwareGl ? 64 : 96);
    const timerArcMat = new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uVisible: { value: 0 },
        uColor: { value: new THREE.Color(0xfbbf24) },
      },
      vertexShader: TIMER_ARC_VERTEX_SHADER,
      fragmentShader: TIMER_ARC_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const timerArcMesh = new THREE.Mesh(timerArcGeo, timerArcMat);
    timerArcMesh.rotation.x = Math.PI * 0.08;
    timerArcMesh.rotation.z = Math.PI * 0.5;
    rootGroup.add(timerArcMesh);

    // 7. Audio-Reactive 3D Frequency Crown (InstancedMesh)
    const BAR_COUNT = isSoftwareGl ? 40 : 64;
    const barGeo = new THREE.BoxGeometry(0.03, 0.18, 0.03);
    const barMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.15,
      metalness: 0.45,
      roughness: 0.25,
      transparent: true,
      opacity: 0.9,
    });
    const spectrumBars = new THREE.InstancedMesh(barGeo, barMat, BAR_COUNT);
    spectrumBars.frustumCulled = false;
    const spectrumRingGroup = new THREE.Group();
    spectrumRingGroup.rotation.x = Math.PI * 0.12;
    spectrumRingGroup.add(spectrumBars);
    orbGroup.add(spectrumRingGroup);

    // 7b. Expressive 3D Holographic Character Construct (toggled via avatarMode === 'character')
    const characterGroup = new THREE.Group();
    characterGroup.visible = avatarModeRef.current === 'character';
    rootGroup.add(characterGroup);

    const charArmorMat = new THREE.MeshPhysicalMaterial({
      color: 0x162032,
      metalness: 0.86,
      roughness: 0.24,
      clearcoat: 0.65,
      clearcoatRoughness: 0.2,
    });
    const charAccentMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x22d3ee,
      emissiveIntensity: 1.45,
      metalness: 0.3,
      roughness: 0.18,
    });
    const charDarkGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x090d16,
      metalness: 0.4,
      roughness: 0.12,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
    });

    const charShoulderGeo = new THREE.CylinderGeometry(0.92, 1.15, 0.44, 8);
    const charShoulderMesh = new THREE.Mesh(charShoulderGeo, charArmorMat);
    charShoulderMesh.position.set(0, -1.06, 0);
    characterGroup.add(charShoulderMesh);

    const charChestCoreGeo = new THREE.OctahedronGeometry(0.18, 0);
    const charChestCore = new THREE.Mesh(charChestCoreGeo, charAccentMat);
    charChestCore.position.set(0, -1.0, 0.82);
    charChestCore.scale.set(1, 1, 0.55);
    characterGroup.add(charChestCore);

    const charNeckGeo = new THREE.CylinderGeometry(0.24, 0.3, 0.42, 12);
    const charNeckMesh = new THREE.Mesh(charNeckGeo, charArmorMat);
    charNeckMesh.position.set(0, -0.66, -0.04);
    characterGroup.add(charNeckMesh);

    const charHeadGroup = new THREE.Group();
    charHeadGroup.position.set(0, 0.08, 0);
    characterGroup.add(charHeadGroup);

    const charCraniumGeo = new THREE.SphereGeometry(0.76, 24, 20);
    const charCranium = new THREE.Mesh(charCraniumGeo, charArmorMat);
    charCranium.scale.set(0.92, 1.12, 0.98);
    charHeadGroup.add(charCranium);

    const charFaceplateGeo = new THREE.BoxGeometry(0.96, 0.88, 0.48);
    const charFaceplate = new THREE.Mesh(charFaceplateGeo, charDarkGlassMat);
    charFaceplate.position.set(0, -0.02, 0.48);
    charHeadGroup.add(charFaceplate);

    const charBrowGeo = new THREE.BoxGeometry(1.06, 0.13, 0.54);
    const charBrowMesh = new THREE.Mesh(charBrowGeo, charArmorMat);
    charBrowMesh.position.set(0, 0.36, 0.48);
    charHeadGroup.add(charBrowMesh);

    const charFinGeo = new THREE.BoxGeometry(0.1, 0.54, 0.36);
    const charLeftFin = new THREE.Mesh(charFinGeo, charArmorMat);
    charLeftFin.position.set(-0.74, 0.06, 0.05);
    const charRightFin = new THREE.Mesh(charFinGeo, charArmorMat);
    charRightFin.position.set(0.74, 0.06, 0.05);
    charHeadGroup.add(charLeftFin, charRightFin);

    const charHaloGeo = new THREE.TorusGeometry(1.18, 0.022, 10, 48, Math.PI * 1.35);
    const charHaloMesh = new THREE.Mesh(charHaloGeo, charAccentMat);
    charHaloMesh.position.set(0, 0.16, -0.22);
    charHaloMesh.rotation.z = -Math.PI * 0.18;
    charHeadGroup.add(charHaloMesh);

    const charEyeGeo = new THREE.CapsuleGeometry(0.065, 0.14, 6, 12);
    const charLeftEye = new THREE.Mesh(charEyeGeo, charAccentMat);
    charLeftEye.rotation.z = Math.PI * 0.5;
    charLeftEye.position.set(-0.22, 0.14, 0.72);
    const charRightEye = new THREE.Mesh(charEyeGeo, charAccentMat);
    charRightEye.rotation.z = Math.PI * 0.5;
    charRightEye.position.set(0.22, 0.14, 0.72);
    charHeadGroup.add(charLeftEye, charRightEye);

    const charJawGroup = new THREE.Group();
    charJawGroup.position.set(0, -0.26, 0.64);
    charHeadGroup.add(charJawGroup);

    const charJawGeo = new THREE.BoxGeometry(0.68, 0.18, 0.28);
    const charJawPlate = new THREE.Mesh(charJawGeo, charArmorMat);
    charJawPlate.position.set(0, -0.1, 0);
    charJawGroup.add(charJawPlate);

    const vocalBarGeo = new THREE.BoxGeometry(0.065, 0.09, 0.06);
    const vocalBars: THREE.Mesh[] = [];
    for (let v = 0; v < 5; v += 1) {
      const bar = new THREE.Mesh(vocalBarGeo, charAccentMat);
      bar.position.set((v - 2) * 0.1, 0.03, 0.1);
      charJawGroup.add(bar);
      vocalBars.push(bar);
    }

    const dummyObj = new THREE.Object3D();

    // 8. State-Aware Volumetric Particle Cloud
    const PARTICLE_COUNT = isSoftwareGl ? 180 : 440;
    const pPositions = new Float32Array(PARTICLE_COUNT * 3);
    const pScales = new Float32Array(PARTICLE_COUNT);
    const pPhases = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const r = 1.48 + Math.random() * 1.45;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pPositions[i * 3 + 2] = r * Math.cos(phi);
      pScales[i] = 0.5 + Math.random() * 1.15;
      pPhases[i] = Math.random() * Math.PI * 2;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    particleGeo.setAttribute('aScale', new THREE.BufferAttribute(pScales, 1));
    particleGeo.setAttribute('aPhase', new THREE.BufferAttribute(pPhases, 1));

    const particleMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAudio: { value: 0 },
        uPixelRatio: { value: maxDpr },
        uFlowMode: { value: 0 },
        uDim: { value: 1.0 },
        uColor: { value: new THREE.Color(0x67e8f9) },
      },
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particlePoints = new THREE.Points(particleGeo, particleMat);
    rootGroup.add(particlePoints);

    // 9. Radial Floor Projection Halo
    const floorGeo = new THREE.PlaneGeometry(4.4, 4.4);
    const floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x22d3ee) },
        uEnergy: { value: 0.25 },
      },
      vertexShader: FLOOR_GLOW_VERTEX_SHADER,
      fragmentShader: FLOOR_GLOW_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI * 0.5;
    floorMesh.position.y = -2.18;
    scene.add(floorMesh);

    // Invisible click/hover raycast sphere
    const hitGeo = new THREE.SphereGeometry(1.5, 16, 16);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    rootGroup.add(hitMesh);

    // Post-processing Composer (GPU only, quality != low)
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    const useComposer = !isSoftwareGl && qualityRef.current !== 'low';

    if (useComposer) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(initW, initH),
        qualityRef.current === 'high' ? 0.85 : 0.55,
        0.48,
        0.52
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 3.8;
    controls.maxDistance = 7.4;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.55;

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2(-99, -99);
    const parallaxTarget = new THREE.Vector2(0, 0);
    let pointerDownPos: { x: number; y: number } | null = null;
    let hovered = false;
    let hoverWeight = 0;

    const updatePointer = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      pointerNdc.set(nx, ny);
      parallaxTarget.set(nx * 0.22, ny * 0.16);
    };

    const onPointerMove = (ev: PointerEvent) => {
      updatePointer(ev);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(hitMesh, false);
      const nextHovered = hits.length > 0;
      if (nextHovered !== hovered) {
        hovered = nextHovered;
        setIsHovered(nextHovered);
      }
    };

    const onPointerDown = (ev: PointerEvent) => {
      pointerDownPos = { x: ev.clientX, y: ev.clientY };
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (!pointerDownPos) return;
      const dx = ev.clientX - pointerDownPos.x;
      const dy = ev.clientY - pointerDownPos.y;
      pointerDownPos = null;
      if (Math.hypot(dx, dy) < 8) {
        updatePointer(ev);
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObject(hitMesh, false);
        if (hits.length > 0) {
          onClickRef.current?.();
        }
      }
    };

    const onPointerLeave = () => {
      parallaxTarget.set(0, 0);
      if (hovered) {
        hovered = false;
        setIsHovered(false);
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    let contextLost = false;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
    };
    const onContextRestored = () => {
      contextLost = false;
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 260);
      const h = Math.max(container.clientHeight, 260);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer?.setSize(w, h);
      bloomPass?.resolution.set(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const freqData = new Uint8Array(64);
    const clock = new THREE.Clock();
    const targetColorA = new THREE.Color();
    const targetColorB = new THREE.Color();
    const targetRingColor = new THREE.Color();
    const camDirVec = new THREE.Vector3();

    let smoothEnergy = 0;
    let smoothScale = 1;
    let currentSpeedMul = 0.45;
    let smoothDim = 1.0;
    let smoothFlowMode = 0;
    let animFrameId: number | null = null;
    let timeoutId: number | null = null;
    let disposed = false;

    const afterDraw = (fn: () => void) => {
      if (disposed) return;
      if (isSoftwareGl) {
        timeoutId = window.setTimeout(fn, 24);
      } else {
        animFrameId = window.requestAnimationFrame(fn);
      }
    };

    const tick = () => {
      if (disposed) return;
      if (contextLost) {
        afterDraw(tick);
        return;
      }

      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const phase = stateRef.current;
      const palette = STATE_PALETTES[phase] || STATE_PALETTES.idle;

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
      } else if (phase === 'speaking') {
        rawEnergy =
          0.22 +
          Math.abs(Math.sin(elapsed * 7.8) * Math.cos(elapsed * 3.4)) * 0.42;
      } else if (phase === 'alarm') {
        rawEnergy = 0.35 + Math.abs(Math.sin(elapsed * 9.5)) * 0.4;
      } else if (phase === 'thinking' || phase === 'executing' || phase === 'searching' || phase === 'browser') {
        rawEnergy = 0.18 + Math.abs(Math.sin(elapsed * 4.5)) * 0.16;
      } else if (phase === 'waking' || phase === 'completed') {
        rawEnergy = 0.38;
      } else if (phase === 'timer' || phase === 'reminder') {
        rawEnergy = 0.12 + Math.abs(Math.sin(elapsed * 2.1)) * 0.1;
      } else if (phase === 'standby') {
        rawEnergy = 0.05 + Math.sin(elapsed * 2.2) * 0.03;
      }

      smoothEnergy = THREE.MathUtils.damp(smoothEnergy, rawEnergy, 10, delta);
      hoverWeight = THREE.MathUtils.damp(hoverWeight, hovered ? 1 : 0, 8, delta);
      currentSpeedMul = THREE.MathUtils.damp(currentSpeedMul, palette.speedMul, 4.5, delta);
      smoothDim = THREE.MathUtils.damp(smoothDim, palette.dimFactor, 4.5, delta);
      smoothFlowMode = THREE.MathUtils.damp(smoothFlowMode, palette.flowMode, 5, delta);

      targetColorA.setHex(palette.colorA);
      targetColorB.setHex(palette.colorB);
      targetRingColor.setHex(palette.ringColor);

      const colorLerp = Math.min(1, delta * 5.2);
      coreMat.uniforms.uColorA.value.lerp(targetColorA, colorLerp);
      coreMat.uniforms.uColorB.value.lerp(targetColorB, colorLerp);
      coreMat.uniforms.uTime.value = elapsed;
      coreMat.uniforms.uAudio.value = smoothEnergy;
      coreMat.uniforms.uHover.value = hoverWeight;
      coreMat.uniforms.uDim.value = smoothDim;
      coreMat.uniforms.uDisplacement.value = THREE.MathUtils.damp(
        coreMat.uniforms.uDisplacement.value,
        palette.displacement,
        5,
        delta
      );

      nucleusMat.emissive.lerp(targetColorA, colorLerp);
      nucleusMat.emissiveIntensity = (0.85 + smoothEnergy * 1.45) * smoothDim;
      innerWireMat.color.lerp(targetRingColor, colorLerp);
      outerWireMat.color.lerp(targetColorA, colorLerp);
      ringMatPrimary.emissive.lerp(targetRingColor, colorLerp);
      ringMatPrimary.emissiveIntensity = (0.55 + smoothEnergy * 0.9) * smoothDim;
      nodeMat.color.lerp(targetRingColor, colorLerp);
      barMat.color.lerp(targetColorA, colorLerp);
      barMat.emissive.lerp(targetRingColor, colorLerp);
      barMat.emissiveIntensity = (0.8 + smoothEnergy * 1.35) * smoothDim;
      corePointLight.color.lerp(targetColorA, colorLerp);
      corePointLight.intensity = (1.9 + smoothEnergy * 3.1) * smoothDim;
      floorMat.uniforms.uColor.value.lerp(targetRingColor, colorLerp);
      floorMat.uniforms.uEnergy.value = (0.25 + smoothEnergy * 0.9) * smoothDim;

      particleMat.uniforms.uTime.value = elapsed;
      particleMat.uniforms.uAudio.value = smoothEnergy;
      particleMat.uniforms.uFlowMode.value = smoothFlowMode;
      particleMat.uniforms.uDim.value = smoothDim;
      particleMat.uniforms.uColor.value.lerp(targetRingColor, colorLerp);

      // Update 3D Timer Arc Ring
      const showTimer = phase === 'timer' || timerProgressRef.current > 0;
      timerArcMat.uniforms.uVisible.value = THREE.MathUtils.damp(
        timerArcMat.uniforms.uVisible.value,
        showTimer ? 1.0 : 0.0,
        7,
        delta
      );
      timerArcMat.uniforms.uProgress.value = THREE.MathUtils.damp(
        timerArcMat.uniforms.uProgress.value,
        Math.max(0, Math.min(1, timerProgressRef.current || (phase === 'timer' ? 0.65 : 0))),
        10,
        delta
      );
      timerArcMat.uniforms.uColor.value.lerp(
        phase === 'alarm' ? targetColorA : targetRingColor,
        colorLerp
      );

      if (bloomPass) {
        const qualityMul = qualityRef.current === 'high' ? 1.0 : 0.65;
        bloomPass.strength = THREE.MathUtils.damp(
          bloomPass.strength,
          palette.bloomStrength * qualityMul + smoothEnergy * 0.35,
          6,
          delta
        );
      }

      // Smooth damped FoV adaptation per state
      if (Math.abs(camera.fov - palette.camFov) > 0.05) {
        camera.fov = THREE.MathUtils.damp(camera.fov, palette.camFov, 4, delta);
        camera.updateProjectionMatrix();
      }
      // Subtle distance damping when user is not actively zooming
      const currentDist = camera.position.length();
      if (currentDist > 0.5) {
        const nextDist = THREE.MathUtils.damp(currentDist, palette.camDist, 1.5, delta);
        camDirVec.copy(camera.position).normalize().multiplyScalar(nextDist);
        camera.position.lerp(camDirVec, Math.min(1, delta * 2.5));
      }

      const isCharMode = avatarModeRef.current === 'character';
      orbGroup.visible = !isCharMode;
      characterGroup.visible = isCharMode;

      charAccentMat.color.lerp(targetColorA, colorLerp);
      charAccentMat.emissive.lerp(targetRingColor, colorLerp);
      charAccentMat.emissiveIntensity = (1.1 + smoothEnergy * 1.9) * smoothDim;

      if (!prefersReducedMotion) {
        const motionStep = delta * currentSpeedMul;
        if (!isCharMode) {
          nucleusMesh.rotation.y += motionStep * 0.95;
          nucleusMesh.rotation.x += motionStep * 0.45;
          coreMesh.rotation.y += motionStep * 0.32;
          glassMesh.rotation.y -= motionStep * 0.14;
          innerWireMesh.rotation.y -= motionStep * 0.28;
          innerWireMesh.rotation.z += motionStep * 0.18;
          outerWireMesh.rotation.y += motionStep * 0.16;
          outerWireMesh.rotation.x -= motionStep * 0.12;

          ringGroups[0].rotation.z += motionStep * 0.65;
          ringGroups[1].rotation.z -= motionStep * 0.52;
          ringGroups[2].rotation.y += motionStep * 0.44;
          ringGroups[3].rotation.x += motionStep * 0.34;
          spectrumRingGroup.rotation.y += motionStep * 0.22;
        } else {
          // Expressive Character Rig: Gaze + Blink + Mood Posture + Vocal Lip-Sync
          const blinkCycle = elapsed % 3.6;
          const isBlinking = blinkCycle > 3.44 && blinkCycle < 3.58;
          const sleepSquint = phase === 'sleep' ? 0.14 : phase === 'thinking' ? 0.68 : 1.0;
          const eyeScaleY = isBlinking ? 0.08 : sleepSquint + smoothEnergy * 0.15;
          charLeftEye.scale.y = THREE.MathUtils.damp(charLeftEye.scale.y, eyeScaleY, 18, delta);
          charRightEye.scale.y = THREE.MathUtils.damp(charRightEye.scale.y, eyeScaleY, 18, delta);

          const headTiltZ =
            phase === 'thinking'
              ? 0.09
              : phase === 'care'
              ? -0.07
              : Math.sin(elapsed * 0.85) * 0.03;
          const headPitchX =
            phase === 'sleep'
              ? 0.22
              : phase === 'listening'
              ? -0.06
              : phase === 'alarm'
              ? Math.sin(elapsed * 6) * 0.06
              : -parallaxTarget.y * 0.65;
          charHeadGroup.rotation.z = THREE.MathUtils.damp(charHeadGroup.rotation.z, headTiltZ, 6, delta);
          charHeadGroup.rotation.x = THREE.MathUtils.damp(charHeadGroup.rotation.x, headPitchX, 7, delta);
          charHeadGroup.rotation.y = THREE.MathUtils.damp(
            charHeadGroup.rotation.y,
            parallaxTarget.x * 1.15 + Math.sin(elapsed * 0.6) * 0.06,
            6,
            delta
          );
          charHaloMesh.rotation.z = -Math.PI * 0.18 + Math.sin(elapsed * 1.1) * 0.08;
          charChestCore.rotation.y += delta * (0.9 + smoothEnergy * 2.5);

          // Vocal equalizer mouth plates & jaw drop
          const talkWeight = phase === 'speaking' ? Math.max(0.18, smoothEnergy * 1.65) : smoothEnergy * 0.5;
          charJawGroup.position.y = THREE.MathUtils.damp(
            charJawGroup.position.y,
            -0.26 - talkWeight * 0.09,
            16,
            delta
          );
          for (let v = 0; v < vocalBars.length; v += 1) {
            const centerBias = 1 - Math.abs(v - 2) * 0.22;
            const wave =
              phase === 'speaking'
                ? 0.45 + Math.abs(Math.sin(elapsed * 14 + v * 1.1)) * (0.7 + smoothEnergy * 1.8)
                : 0.25 + smoothEnergy * 0.8;
            vocalBars[v].scale.y = THREE.MathUtils.damp(vocalBars[v].scale.y, wave * centerBias, 18, delta);
          }
        }

        // Vertical breath float for sleep / care / idle
        const floatAmp = phase === 'sleep' ? 0.07 : 0.035;
        rootGroup.position.y = Math.sin(elapsed * (phase === 'sleep' ? 0.9 : 1.5)) * floatAmp;

        rootGroup.rotation.y = THREE.MathUtils.damp(
          rootGroup.rotation.y,
          parallaxTarget.x,
          4.5,
          delta
        );
        rootGroup.rotation.x = THREE.MathUtils.damp(
          rootGroup.rotation.x,
          -parallaxTarget.y,
          4.5,
          delta
        );

        const targetScale =
          1 +
          (phase === 'waking' || phase === 'completed' ? 0.08 : 0) +
          (phase === 'alarm' ? Math.abs(Math.sin(elapsed * 8)) * 0.07 : 0) +
          smoothEnergy * 0.12 +
          hoverWeight * 0.04;
        smoothScale = THREE.MathUtils.damp(smoothScale, targetScale, 8, delta);
        coreMesh.scale.setScalar(smoothScale);
        glassMesh.scale.setScalar(1 + smoothEnergy * 0.05 + hoverWeight * 0.02);
        innerWireMesh.scale.setScalar(1 + smoothEnergy * 0.07 + hoverWeight * 0.025);
        outerWireMesh.scale.setScalar(1 + smoothEnergy * 0.04);
      }

      const ringRadius = 2.06;
      for (let i = 0; i < BAR_COUNT; i += 1) {
        const angle = (i / BAR_COUNT) * Math.PI * 2;
        const binIndex = Math.min(
          freqData.length - 1,
          Math.floor((i / BAR_COUNT) * 38)
        );
        let binNorm = activeAnalyser ? freqData[binIndex] / 255 : 0;

        if (!activeAnalyser && !prefersReducedMotion) {
          if (phase === 'speaking' || phase === 'alarm') {
            binNorm =
              0.25 +
              0.55 *
                Math.abs(
                  Math.sin(elapsed * 8.5 + i * 0.45) *
                    Math.cos(elapsed * 3.1 - i * 0.2)
                );
          } else if (phase === 'thinking' || phase === 'executing' || phase === 'searching' || phase === 'browser') {
            binNorm = 0.18 + 0.34 * Math.max(0, Math.sin(elapsed * 5.2 + i * 0.35));
          } else if (phase === 'gaming' || phase === 'timer') {
            binNorm = 0.14 + 0.18 * Math.max(0, Math.sin(elapsed * 3.2 + i * 0.25));
          } else if (phase === 'standby') {
            binNorm = 0.06 + 0.08 * Math.max(0, Math.sin(elapsed * 2.5 + i * 0.2));
          } else if (phase === 'sleep' || phase === 'disconnected') {
            binNorm = 0.02;
          }
        }

        const heightScale = 0.42 + binNorm * 2.55;
        dummyObj.position.set(
          Math.cos(angle) * ringRadius,
          0,
          Math.sin(angle) * ringRadius
        );
        dummyObj.rotation.set(0, -angle, 0);
        dummyObj.scale.set(1, heightScale, 1);
        dummyObj.updateMatrix();
        spectrumBars.setMatrixAt(i, dummyObj.matrix);
      }
      spectrumBars.instanceMatrix.needsUpdate = true;

      controls.update();

      if (composer && !isSoftwareGl && qualityRef.current !== 'low') {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

      afterDraw(tick);
    };

    tick();

    return () => {
      disposed = true;
      if (animFrameId !== null) window.cancelAnimationFrame(animFrameId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      resizeObserver.disconnect();

      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      controls.dispose();
      composer?.dispose();

      coreGeo.dispose();
      coreMat.dispose();
      nucleusGeo.dispose();
      nucleusMat.dispose();
      glassGeo.dispose();
      glassMat.dispose();
      innerWireGeo.dispose();
      innerWireMat.dispose();
      outerWireGeo.dispose();
      outerWireMat.dispose();
      ringGeometries.forEach((g) => g.dispose());
      ringMatPrimary.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      timerArcGeo.dispose();
      timerArcMat.dispose();
      barGeo.dispose();
      barMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      hitGeo.dispose();
      hitMat.dispose();
      charShoulderGeo.dispose();
      charChestCoreGeo.dispose();
      charNeckGeo.dispose();
      charCraniumGeo.dispose();
      charFaceplateGeo.dispose();
      charBrowGeo.dispose();
      charFinGeo.dispose();
      charHaloGeo.dispose();
      charEyeGeo.dispose();
      charJawGeo.dispose();
      vocalBarGeo.dispose();
      charArmorMat.dispose();
      charAccentMat.dispose();
      charDarkGlassMat.dispose();
      envTarget.dispose();

      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [visualQuality]);

  return (
    <div className="relative w-80 h-80 sm:w-[400px] sm:h-[400px] lg:w-[420px] lg:h-[420px] flex items-center justify-center select-none">
      {webglUnsupported ? (
        <button
          type="button"
          onClick={onCoreClick}
          className="w-60 h-60 rounded-full border border-cyan-400/50 bg-radial from-cyan-500/30 via-blue-900/20 to-slate-950 flex flex-col items-center justify-center text-center p-4 shadow-[0_0_40px_rgba(34,211,238,0.28)]"
        >
          <span className="text-xs font-mono text-cyan-300 uppercase tracking-widest">
            J.A.R.V.I.S. Core
          </span>
          <span className="mt-1 text-[11px] text-slate-400">
            WebGL unavailable — click to interact
          </span>
        </button>
      ) : (
        <div
          ref={mountRef}
          role="button"
          tabIndex={0}
          aria-label="Interactive 3D J.A.R.V.I.S. Holographic AI Core — drag to orbit or click to talk"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onCoreClick?.();
            }
          }}
          className={`w-full h-full rounded-full transition-opacity duration-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400 ${
            isHovered ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
          }`}
        />
      )}
    </div>
  );
};

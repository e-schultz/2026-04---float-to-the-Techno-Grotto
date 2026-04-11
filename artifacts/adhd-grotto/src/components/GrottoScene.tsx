import { useRef, useMemo, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { AudioState } from "../engine/AudioEngine";

export interface RippleEvent {
  x: number;
  y: number;
  time: number;
}

interface GrottoSceneProps {
  audioState: AudioState;
  mousePos: { x: number; y: number };
  ripples: RippleEvent[];
  idleFactor: number;
}

const floorVertexShader = `
uniform float uTime;
uniform float uBass;
uniform float uKick;
uniform float uMouseX;
uniform float uMouseY;
uniform float uRipple0;
uniform float uRipple0X;
uniform float uRipple0Y;
varying vec2 vUv;
varying float vElevation;

void main() {
  vUv = uv;
  vec3 pos = position;
  
  float wave1 = sin(pos.x * 3.0 + uTime * 0.8) * 0.06 * (uBass + 0.1);
  float wave2 = sin(pos.z * 2.0 - uTime * 0.6) * 0.04 * (uBass + 0.1);
  float ripple = sin(length(pos.xz) * 4.0 - uTime * 2.0) * 0.05 * uKick;
  
  // Mouse influence — gentle warping toward cursor
  float mouseDist = length(pos.xz - vec2(uMouseX, uMouseY) * 8.0);
  float mouseWave = sin(mouseDist * 2.0 - uTime * 3.0) * 0.03 / (1.0 + mouseDist * 0.3);
  
  // Click ripple
  float rDist = length(pos.xz - vec2(uRipple0X, uRipple0Y) * 8.0);
  float rWave = sin(rDist * 5.0 - uTime * 8.0) * 0.08 * uRipple0 / (1.0 + rDist * 0.2);
  
  pos.y += wave1 + wave2 + ripple + mouseWave + rWave;
  vElevation = wave1 + wave2 + ripple + mouseWave + rWave;
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const floorFragmentShader = `
uniform float uTime;
uniform float uBass;
uniform float uKick;
uniform float uMid;
uniform float uHueShift;
uniform float uRipple0;
uniform float uRipple0X;
uniform float uRipple0Y;
varying vec2 vUv;
varying float vElevation;

vec3 hueShift(vec3 color, float shift) {
  float angle = shift * 6.28318;
  float s = sin(angle);
  float c = cos(angle);
  vec3 weights = vec3(0.2126, 0.7152, 0.0722);
  float p = dot(color, weights);
  vec3 a = vec3(p) + vec3(1.0-c, -s*0.57735, s*0.57735) * (color - vec3(p));
  return clamp(a + vec3(-s*0.57735, s*0.57735, 1.0-c) * cross(vec3(p), color - vec3(p)), 0.0, 1.0);
}

float grid(vec2 uv, float size) {
  vec2 g = abs(fract(uv * size) - 0.5);
  return max(g.x, g.y);
}

void main() {
  vec2 uv = vUv;
  
  float g1 = 1.0 - smoothstep(0.48, 0.5, grid(uv, 20.0));
  float g2 = 1.0 - smoothstep(0.46, 0.5, grid(uv, 4.0));
  
  vec3 gridColor1 = vec3(0.0, 0.55 + uBass * 0.35, 0.52 + uBass * 0.3);
  vec3 gridColor2 = vec3(0.0, 0.3, 0.3);
  vec3 baseColor = vec3(0.02, 0.02, 0.025);
  
  vec3 col = mix(baseColor, gridColor2 * 0.4, g1);
  col = mix(col, gridColor1 * 0.8, g2 * 0.7);
  
  float elevGlow = max(0.0, vElevation * 6.0);
  col += vec3(0.0, elevGlow * 0.3, elevGlow * 0.25) * uBass;
  col += vec3(0.05, 0.15, 0.15) * uKick * 0.5;
  
  // Click ripple glow
  float rDist = length(uv - vec2(0.5 + uRipple0X * 0.5, 0.5 + uRipple0Y * 0.5));
  float rGlow = uRipple0 * 0.3 * max(0.0, 1.0 - rDist * 4.0);
  col += vec3(0.1, 0.4, 0.4) * rGlow;
  
  col = hueShift(col, uHueShift);
  
  float dist = length(uv - 0.5) * 2.0;
  float fade = 1.0 - smoothstep(0.7, 1.2, dist);
  
  gl_FragColor = vec4(col * fade, fade * 0.85);
}
`;

const wubVertexShader = `
uniform float uTime;
uniform float uBass;
uniform float uKick;
uniform float uMid;
uniform float uBreath;
uniform float uMouseX;
uniform float uMouseY;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplace;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  vec3 pos = position;
  
  float n = snoise(pos * 1.2 + vec3(uTime * 0.3, uTime * 0.2, uTime * 0.15));
  float n2 = snoise(pos * 2.5 - vec3(uTime * 0.5, 0.0, uTime * 0.4));
  
  float disp = n * 0.12 * (1.0 + uBass * 1.5) + n2 * 0.06 * uMid;
  disp += uKick * 0.18 * (1.0 - length(pos) * 0.2);
  
  // Breathing pulse
  disp += uBreath * 0.04;
  
  // Mouse warp — cursor gently pulls the shape
  vec2 mouseDir = vec2(uMouseX, uMouseY) * 0.15;
  pos.x += mouseDir.x * (1.0 - abs(normal.x)) * 0.3;
  pos.y += mouseDir.y * (1.0 - abs(normal.y)) * 0.3;
  
  pos += normal * disp;
  vDisplace = disp;
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const wubFragmentShader = `
uniform float uTime;
uniform float uBass;
uniform float uKick;
uniform float uMid;
uniform float uHueShift;
uniform float uBreath;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplace;

vec3 hueShift(vec3 color, float shift) {
  float angle = shift * 6.28318;
  float s = sin(angle);
  float c = cos(angle);
  vec3 weights = vec3(0.2126, 0.7152, 0.0722);
  float p = dot(color, weights);
  vec3 a = vec3(p) + vec3(1.0-c, -s*0.57735, s*0.57735) * (color - vec3(p));
  return clamp(a + vec3(-s*0.57735, s*0.57735, 1.0-c) * cross(vec3(p), color - vec3(p)), 0.0, 1.0);
}

void main() {
  vec3 teal = vec3(0.0, 0.85, 0.82);
  vec3 purple = vec3(0.55, 0.2, 0.9);
  vec3 dark = vec3(0.02, 0.02, 0.04);
  
  float facing = dot(vNormal, vec3(0.0, 0.0, 1.0));
  facing = abs(facing);
  
  vec3 col = mix(dark, teal, facing * (0.4 + uBass * 0.5));
  col = mix(col, purple, (1.0 - facing) * uMid * 0.6);
  
  // Displacement glow — bloom-like effect on bright edges
  float dispGlow = max(0.0, vDisplace * 4.0);
  col += teal * dispGlow * 0.5;
  
  // Bloom emulation — bright edges get brighter
  float edgeGlow = pow(1.0 - facing, 3.0);
  col += teal * edgeGlow * (0.2 + uBass * 0.5 + uBreath * 0.15);
  
  col += vec3(0.1, 0.3, 0.3) * uKick;
  
  // Rim light with breathing
  float rim = 1.0 - facing;
  col += teal * rim * rim * (0.3 + uBreath * 0.1);
  
  col = hueShift(col, uHueShift);
  
  gl_FragColor = vec4(col, 0.92);
}
`;

function ParticleField({ audioState, hueTime }: { audioState: AudioState; hueTime: number }) {
  const pointsRef = useRef<THREE.Points>(null!);
  const count = 1500;

  const [positions, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 2 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;
      pos[i * 3] = r * Math.cos(theta) * Math.cos(phi);
      pos[i * 3 + 1] = r * Math.sin(phi) + (Math.random() - 0.5) * 4;
      pos[i * 3 + 2] = r * Math.sin(theta) * Math.cos(phi);
      spd[i] = 0.2 + Math.random() * 0.8;
    }
    return [pos, spd];
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const t = clock.getElapsedTime();
    const pos = pointsRef.current.geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      const s = speeds[i];
      const x0 = positions[i * 3];
      const z0 = positions[i * 3 + 2];
      const angle = Math.atan2(z0, x0) + t * s * 0.04 * (1 + audioState.bassLevel);
      const r = Math.sqrt(x0 * x0 + z0 * z0);
      pos.setX(i, r * Math.cos(angle));
      pos.setZ(i, r * Math.sin(angle));
      const y0 = positions[i * 3 + 1];
      pos.setY(i, y0 + Math.sin(t * s * 0.3 + i) * 0.003 * (1 + audioState.bassLevel * 2));
    }
    pos.needsUpdate = true;
    const mat = pointsRef.current.material as THREE.PointsMaterial;
    mat.opacity = 0.25 + audioState.bassLevel * 0.4;
    mat.size = 0.015 + audioState.kick * 0.04;
    const hue = (hueTime * 0.01) % 1;
    mat.color.setHSL(0.48 + hue * 0.08, 0.8, 0.5);
  });

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
    return geo;
  }, [positions]);

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color={new THREE.Color(0.0, 0.8, 0.75)}
        size={0.015}
        sizeAttenuation
        transparent
        opacity={0.3}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function WubOrb({ audioState, mousePos, hueTime }: { audioState: AudioState; mousePos: { x: number; y: number }; hueTime: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uKick: { value: 0 },
      uMid: { value: 0 },
      uBreath: { value: 0 },
      uMouseX: { value: 0 },
      uMouseY: { value: 0 },
      uHueShift: { value: 0 },
    }),
    []
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    uniforms.uBass.value += (audioState.bassLevel - uniforms.uBass.value) * 0.12;
    uniforms.uKick.value += (audioState.kick - uniforms.uKick.value) * 0.25;
    uniforms.uMid.value += (audioState.midLevel - uniforms.uMid.value) * 0.08;
    uniforms.uBreath.value = Math.sin(t * 0.3) * 0.5 + 0.5;
    uniforms.uMouseX.value += (mousePos.x - uniforms.uMouseX.value) * 0.04;
    uniforms.uMouseY.value += (mousePos.y - uniforms.uMouseY.value) * 0.04;
    uniforms.uHueShift.value = (hueTime * 0.01) % 1 * 0.08;

    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.08;
      meshRef.current.rotation.x = Math.sin(t * 0.07) * 0.15;
      const breath = Math.sin(t * 0.3) * 0.03;
      const scale = 1 + audioState.bassLevel * 0.12 + audioState.kick * 0.08 + breath;
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <mesh ref={meshRef}>
      <torusKnotGeometry args={[0.9, 0.35, 200, 32, 2, 3]} />
      <shaderMaterial
        vertexShader={wubVertexShader}
        fragmentShader={wubFragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function IndustrialRings({ audioState, hueTime }: { audioState: AudioState; hueTime: number }) {
  const groupRef = useRef<THREE.Group>(null!);
  const rings = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        radius: 1.8 + i * 0.55,
        tube: 0.008 + i * 0.003,
        tiltX: (i * Math.PI) / 7,
        tiltZ: (i * Math.PI) / 9,
        speed: 0.04 + i * 0.015,
      })),
    []
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const hue = (hueTime * 0.01) % 1;
    groupRef.current.children.forEach((child, i) => {
      const r = rings[i];
      child.rotation.y = t * r.speed * (1 + audioState.bassLevel * 0.5);
      child.rotation.x = r.tiltX + Math.sin(t * 0.12 + i) * 0.04;
      child.rotation.z = r.tiltZ + Math.cos(t * 0.1 + i) * 0.04;
      const scale = 1 + audioState.kick * 0.06 * (i + 1) * 0.2;
      child.scale.setScalar(scale);
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (i % 2 === 0) {
        mat.color.setHSL(0.48 + hue * 0.08, 0.8, 0.45);
      } else {
        mat.color.setHSL(0.75 + hue * 0.05, 0.7, 0.4);
      }
      mat.opacity = 0.35 + i * 0.06 + audioState.bassLevel * 0.15;
    });
  });

  return (
    <group ref={groupRef}>
      {rings.map((r, i) => (
        <mesh key={i}>
          <torusGeometry args={[r.radius, r.tube, 8, 128]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? 0x00b0b0 : 0x6020cc}
            transparent
            opacity={0.4 + i * 0.06}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function ReactiveFloor({ audioState, mousePos, ripples, hueTime }: { audioState: AudioState; mousePos: { x: number; y: number }; ripples: RippleEvent[]; hueTime: number }) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uKick: { value: 0 },
      uMid: { value: 0 },
      uMouseX: { value: 0 },
      uMouseY: { value: 0 },
      uHueShift: { value: 0 },
      uRipple0: { value: 0 },
      uRipple0X: { value: 0 },
      uRipple0Y: { value: 0 },
    }),
    []
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    uniforms.uBass.value += (audioState.bassLevel - uniforms.uBass.value) * 0.1;
    uniforms.uKick.value += (audioState.kick - uniforms.uKick.value) * 0.3;
    uniforms.uMid.value += (audioState.midLevel - uniforms.uMid.value) * 0.07;
    uniforms.uMouseX.value += (mousePos.x - uniforms.uMouseX.value) * 0.05;
    uniforms.uMouseY.value += (mousePos.y - uniforms.uMouseY.value) * 0.05;
    uniforms.uHueShift.value = (hueTime * 0.01) % 1 * 0.08;

    if (ripples.length > 0) {
      const latest = ripples[ripples.length - 1];
      const age = (Date.now() - latest.time) / 1000;
      const strength = Math.max(0, 1 - age / 2.5);
      uniforms.uRipple0.value += (strength - uniforms.uRipple0.value) * 0.15;
      uniforms.uRipple0X.value = latest.x;
      uniforms.uRipple0Y.value = latest.y;
    } else {
      uniforms.uRipple0.value *= 0.95;
    }
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, 0]}>
      <planeGeometry args={[24, 24, 80, 80]} />
      <shaderMaterial
        vertexShader={floorVertexShader}
        fragmentShader={floorFragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </mesh>
  );
}

function FloatingCubes({ audioState, hueTime }: { audioState: AudioState; hueTime: number }) {
  const groupRef = useRef<THREE.Group>(null!);
  const cubeData = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        x: (Math.random() - 0.5) * 10,
        y: (Math.random() - 0.5) * 6,
        z: (Math.random() - 0.5) * 10 - 2,
        size: 0.04 + Math.random() * 0.15,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.6,
        rotSpeed: (Math.random() - 0.5) * 0.8,
      })),
    []
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const hue = (hueTime * 0.01) % 1;
    groupRef.current.children.forEach((child, i) => {
      const d = cubeData[i];
      child.position.y = d.y + Math.sin(t * d.speed + d.phase) * 0.3;
      child.rotation.x = t * d.rotSpeed * 0.5;
      child.rotation.z = t * d.rotSpeed;
      const scale = 1 + audioState.bassLevel * 0.5 + audioState.kick * 0.3;
      child.scale.setScalar(scale);
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.3 + audioState.midLevel * 0.4;
      if (i % 3 === 0) mat.color.setHSL(0.48 + hue * 0.08, 0.8, 0.5);
    });
  });

  return (
    <group ref={groupRef}>
      {cubeData.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, d.z]}>
          <boxGeometry args={[d.size, d.size, d.size]} />
          <meshBasicMaterial
            color={i % 3 === 0 ? 0x00ddcc : i % 3 === 1 ? 0x7730dd : 0x004444}
            transparent
            opacity={0.3}
            wireframe={i % 2 === 0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function AtmosphereSphere({ audioState, idleFactor }: { audioState: AudioState; idleFactor: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.06 + audioState.bassLevel * 0.04 + idleFactor * 0.02;
    const t = clock.getElapsedTime();
    const hue = (t * 0.005) % 1;
    mat.color.setHSL(0.48 + hue * 0.1, 0.3, 0.06);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[12, 16, 16]} />
      <meshBasicMaterial
        color={0x001a1a}
        side={THREE.BackSide}
        transparent
        opacity={0.07}
        depthWrite={false}
      />
    </mesh>
  );
}

function GlowOrbs({ audioState }: { audioState: AudioState }) {
  const groupRef = useRef<THREE.Group>(null!);
  const orbData = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        angle: (i / 6) * Math.PI * 2,
        radius: 2.2 + Math.random() * 0.5,
        speed: 0.1 + Math.random() * 0.15,
        yOff: (Math.random() - 0.5) * 2,
        size: 0.12 + Math.random() * 0.08,
      })),
    []
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((child, i) => {
      const d = orbData[i];
      const a = d.angle + t * d.speed;
      child.position.x = Math.cos(a) * d.radius;
      child.position.z = Math.sin(a) * d.radius;
      child.position.y = d.yOff + Math.sin(t * 0.4 + i) * 0.3;
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.15 + audioState.bassLevel * 0.3 + audioState.kick * 0.2;
      const scale = d.size * (1 + audioState.kick * 0.8);
      child.scale.setScalar(scale);
    });
  });

  return (
    <group ref={groupRef}>
      {orbData.map((d, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? 0x00eedd : 0x8844ff}
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function GrottoScene({ audioState, mousePos, ripples, idleFactor }: GrottoSceneProps) {
  const { gl, scene } = useThree();
  const hueTimeRef = useRef(0);

  useEffect(() => {
    scene.fog = new THREE.FogExp2(0x040808, 0.055);
    gl.setClearColor(0x050808, 1);
  }, [gl, scene]);

  useFrame(({ camera: cam, clock }) => {
    const t = clock.getElapsedTime();
    hueTimeRef.current = t;

    const idleIntensity = idleFactor * 0.4;

    (cam as THREE.PerspectiveCamera).position.x =
      Math.sin(t * 0.07) * (0.6 + idleIntensity * 0.5) +
      Math.sin(t * 0.13) * 0.3 * audioState.bassLevel +
      mousePos.x * 0.3;
    (cam as THREE.PerspectiveCamera).position.y =
      Math.sin(t * 0.05) * (0.35 + idleIntensity * 0.3) +
      audioState.kick * 0.12 +
      mousePos.y * 0.15;
    (cam as THREE.PerspectiveCamera).position.z =
      5 - idleIntensity * 0.8;
    cam.lookAt(0, 0, 0);
  });

  const mainLightIntensity = 0.5 + audioState.bassLevel * 1.5 + idleFactor * 0.3;
  const accentIntensity = 0.3 + audioState.midLevel + idleFactor * 0.2;

  return (
    <>
      <ambientLight intensity={0.03 + idleFactor * 0.01} />
      <pointLight position={[0, 3, 0]} intensity={mainLightIntensity} color={0x00ffee} distance={8} />
      <pointLight position={[-4, -1, -2]} intensity={accentIntensity} color={0x8830ff} distance={12} />
      <pointLight position={[4, 1, -3]} intensity={0.2 + idleFactor * 0.15} color={0x003333} distance={10} />

      <AtmosphereSphere audioState={audioState} idleFactor={idleFactor} />
      <ReactiveFloor audioState={audioState} mousePos={mousePos} ripples={ripples} hueTime={hueTimeRef.current} />
      <WubOrb audioState={audioState} mousePos={mousePos} hueTime={hueTimeRef.current} />
      <IndustrialRings audioState={audioState} hueTime={hueTimeRef.current} />
      <FloatingCubes audioState={audioState} hueTime={hueTimeRef.current} />
      <ParticleField audioState={audioState} hueTime={hueTimeRef.current} />
      <GlowOrbs audioState={audioState} />
    </>
  );
}

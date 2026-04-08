import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { AudioState } from "../engine/AudioEngine";

interface GrottoSceneProps {
  audioState: AudioState;
}

// GLSL shaders for the industrial wub-reactive floor
const floorVertexShader = `
uniform float uTime;
uniform float uBass;
uniform float uKick;
varying vec2 vUv;
varying float vElevation;

void main() {
  vUv = uv;
  vec3 pos = position;
  
  float wave1 = sin(pos.x * 3.0 + uTime * 0.8) * 0.06 * (uBass + 0.1);
  float wave2 = sin(pos.z * 2.0 - uTime * 0.6) * 0.04 * (uBass + 0.1);
  float ripple = sin(length(pos.xz) * 4.0 - uTime * 2.0) * 0.05 * uKick;
  pos.y += wave1 + wave2 + ripple;
  vElevation = wave1 + wave2 + ripple;
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const floorFragmentShader = `
uniform float uTime;
uniform float uBass;
uniform float uKick;
uniform float uMid;
varying vec2 vUv;
varying float vElevation;

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
  
  // Elevation glow
  float elevGlow = max(0.0, vElevation * 6.0);
  col += vec3(0.0, elevGlow * 0.3, elevGlow * 0.25) * uBass;
  
  // Kick pulse
  col += vec3(0.05, 0.15, 0.15) * uKick * 0.5;
  
  // Distance fade
  float dist = length(uv - 0.5) * 2.0;
  float fade = 1.0 - smoothstep(0.7, 1.2, dist);
  
  gl_FragColor = vec4(col * fade, fade * 0.85);
}
`;

// Pulsating toroidal wub shape
const wubVertexShader = `
uniform float uTime;
uniform float uBass;
uniform float uKick;
uniform float uMid;
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
varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplace;

void main() {
  vec3 teal = vec3(0.0, 0.85, 0.82);
  vec3 purple = vec3(0.55, 0.2, 0.9);
  vec3 dark = vec3(0.02, 0.02, 0.04);
  
  float facing = dot(vNormal, vec3(0.0, 0.0, 1.0));
  facing = abs(facing);
  
  vec3 col = mix(dark, teal, facing * (0.4 + uBass * 0.5));
  col = mix(col, purple, (1.0 - facing) * uMid * 0.6);
  
  // Displacement glow
  float dispGlow = max(0.0, vDisplace * 4.0);
  col += teal * dispGlow * 0.5;
  
  // Kick flash
  col += vec3(0.1, 0.3, 0.3) * uKick;
  
  // Rim light
  float rim = 1.0 - facing;
  col += teal * rim * rim * 0.3;
  
  gl_FragColor = vec4(col, 0.92);
}
`;

// Particle dust cloud
function ParticleField({ audioState }: { audioState: AudioState }) {
  const pointsRef = useRef<THREE.Points>(null!);
  const count = 1200;

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

// Main wub orb
function WubOrb({ audioState }: { audioState: AudioState }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uKick: { value: 0 },
      uMid: { value: 0 },
    }),
    []
  );

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime();
    uniforms.uBass.value += (audioState.bassLevel - uniforms.uBass.value) * 0.12;
    uniforms.uKick.value += (audioState.kick - uniforms.uKick.value) * 0.25;
    uniforms.uMid.value += (audioState.midLevel - uniforms.uMid.value) * 0.08;

    if (meshRef.current) {
      meshRef.current.rotation.y = clock.getElapsedTime() * 0.08;
      meshRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.07) * 0.15;
      const scale = 1 + audioState.bassLevel * 0.12 + audioState.kick * 0.08;
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

// Orbiting industrial rings
function IndustrialRings({ audioState }: { audioState: AudioState }) {
  const groupRef = useRef<THREE.Group>(null!);
  const rings = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        radius: 1.8 + i * 0.55,
        tube: 0.008 + i * 0.003,
        tiltX: (i * Math.PI) / 7,
        tiltZ: (i * Math.PI) / 9,
        speed: 0.04 + i * 0.015,
        color: i % 2 === 0 ? new THREE.Color(0, 0.7, 0.7) : new THREE.Color(0.4, 0.1, 0.8),
      })),
    []
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((child, i) => {
      const r = rings[i];
      child.rotation.y = t * r.speed * (1 + audioState.bassLevel * 0.5);
      child.rotation.x = r.tiltX + Math.sin(t * 0.12 + i) * 0.04;
      child.rotation.z = r.tiltZ + Math.cos(t * 0.1 + i) * 0.04;
      const scale = 1 + audioState.kick * 0.06 * (i + 1) * 0.2;
      child.scale.setScalar(scale);
    });
  });

  return (
    <group ref={groupRef}>
      {rings.map((r, i) => (
        <mesh key={i}>
          <torusGeometry args={[r.radius, r.tube, 8, 128]} />
          <meshBasicMaterial
            color={r.color}
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

// Reactive floor grid
function ReactiveFloor({ audioState }: { audioState: AudioState }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uKick: { value: 0 },
      uMid: { value: 0 },
    }),
    []
  );

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime();
    uniforms.uBass.value += (audioState.bassLevel - uniforms.uBass.value) * 0.1;
    uniforms.uKick.value += (audioState.kick - uniforms.uKick.value) * 0.3;
    uniforms.uMid.value += (audioState.midLevel - uniforms.uMid.value) * 0.07;
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, 0]}>
      <planeGeometry args={[24, 24, 60, 60]} />
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

// Floating abstract cubes
function FloatingCubes({ audioState }: { audioState: AudioState }) {
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
    groupRef.current.children.forEach((child, i) => {
      const d = cubeData[i];
      child.position.y = d.y + Math.sin(t * d.speed + d.phase) * 0.3;
      child.rotation.x = t * d.rotSpeed * 0.5;
      child.rotation.z = t * d.rotSpeed;
      const scale = 1 + audioState.bassLevel * 0.5 + audioState.kick * 0.3;
      child.scale.setScalar(scale);
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.3 + audioState.midLevel * 0.4;
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

// Fog / atmosphere sphere
function AtmosphereSphere({ audioState }: { audioState: AudioState }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.06 + audioState.bassLevel * 0.04;
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

export function GrottoScene({ audioState }: GrottoSceneProps) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    scene.fog = new THREE.FogExp2(0x040808, 0.055);
    gl.setClearColor(0x050808, 1);
  }, [gl, scene]);

  useFrame(({ camera: cam }) => {
    const t = performance.now() * 0.001;
    (cam as THREE.PerspectiveCamera).position.x =
      Math.sin(t * 0.07) * 0.6 + Math.sin(t * 0.13) * 0.3 * audioState.bassLevel;
    (cam as THREE.PerspectiveCamera).position.y =
      Math.sin(t * 0.05) * 0.35 + audioState.kick * 0.12;
    cam.lookAt(0, 0, 0);
  });

  return (
    <>
      <ambientLight intensity={0.03} />
      <pointLight position={[0, 3, 0]} intensity={0.5 + audioState.bassLevel * 1.5} color={0x00ffee} distance={8} />
      <pointLight position={[-4, -1, -2]} intensity={0.3 + audioState.midLevel} color={0x8830ff} distance={12} />
      <pointLight position={[4, 1, -3]} intensity={0.2} color={0x003333} distance={10} />

      <AtmosphereSphere audioState={audioState} />
      <ReactiveFloor audioState={audioState} />
      <WubOrb audioState={audioState} />
      <IndustrialRings audioState={audioState} />
      <FloatingCubes audioState={audioState} />
      <ParticleField audioState={audioState} />
    </>
  );
}

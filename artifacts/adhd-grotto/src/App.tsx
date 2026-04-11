import { Suspense, useState, useCallback, useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { GrottoScene, RippleEvent } from "./components/GrottoScene";
import { VuMeter } from "./components/VuMeter";
import { WebGLErrorBoundary } from "./components/WebGLFallback";
import { useAudioEngine } from "./engine/useAudioEngine";

function StartOverlay({ onStart }: { onStart: () => void }) {
  const [fading, setFading] = useState(false);

  const handleStart = () => {
    setFading(true);
    setTimeout(onStart, 800);
  };

  return (
    <div className={`start-overlay ${fading ? "fading" : ""}`}>
      <div className="start-glyph" onClick={handleStart}>
        <div className="play-icon" />
      </div>
      <div className="start-label">Enter the Grotto</div>
      <div className="start-sublabel">
        Deep techno grotto<br />
        bass wubs / hypnotic rhythms<br />
        industrial textures
      </div>
    </div>
  );
}

function GrottoUI({
  bpm,
  onBPMChange,
  onStop,
  onIntensityChange,
  intensity,
  isPlaying,
}: {
  bpm: number;
  onBPMChange: (bpm: number) => void;
  onStop: () => void;
  onIntensityChange: (v: number) => void;
  intensity: number;
  isPlaying: boolean;
}) {
  return (
    <div className="grotto-ui">
      <div className="grotto-title">Grotto</div>

      <div className="grotto-bpm">
        <span>{bpm}</span>BPM
      </div>

      <div className="controls-bar">
        <div className="intensity-bar">
          <span className="intensity-label">Depth</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={intensity}
            onChange={(e) => onIntensityChange(parseFloat(e.target.value))}
            className="intensity-slider"
          />
        </div>

        <button
          className="ctrl-btn"
          onClick={() => onBPMChange(Math.max(110, bpm - 4))}
        >
          -
        </button>
        <button
          className="ctrl-btn"
          onClick={() => onBPMChange(Math.min(160, bpm + 4))}
        >
          +
        </button>

        <button
          className={`ctrl-btn ${isPlaying ? "active" : ""}`}
          onClick={onStop}
        >
          {isPlaying ? "||" : ">"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [intensity, setIntensity] = useState(0.5);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [ripples, setRipples] = useState<RippleEvent[]>([]);
  const idleFactorRef = useRef(0);
  const [idleFactor, setIdleFactor] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const idleTimerRef = useRef<number | null>(null);
  const { audioState, start, stop, setBPM, setIntensity: setEngineIntensity, triggerTap } = useAudioEngine();

  const resetIdle = useCallback(() => {
    lastActivityRef.current = Date.now();
    idleFactorRef.current = 0;
    setIdleFactor(0);
  }, []);

  useEffect(() => {
    if (!started) return;
    let lastUpdate = 0;
    const tick = () => {
      const elapsed = (Date.now() - lastActivityRef.current) / 1000;
      const newIdle = Math.min(1, Math.max(0, (elapsed - 15) / 60));
      idleFactorRef.current = newIdle;
      const now = Date.now();
      if (now - lastUpdate > 500) {
        setIdleFactor(newIdle);
        lastUpdate = now;
      }
      idleTimerRef.current = requestAnimationFrame(tick);
    };
    idleTimerRef.current = requestAnimationFrame(tick);
    return () => {
      if (idleTimerRef.current) cancelAnimationFrame(idleTimerRef.current);
    };
  }, [started]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -((e.clientY / window.innerHeight) * 2 - 1);
    mousePosRef.current = { x, y };
    setMousePos({ x, y });
    resetIdle();
  }, [resetIdle]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!started || !audioState.isPlaying) return;
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -((e.clientY / window.innerHeight) * 2 - 1);
    const newRipple: RippleEvent = { x, y, time: Date.now() };
    setRipples((prev) => [...prev.slice(-4), newRipple]);
    triggerTap();
    resetIdle();
  }, [started, audioState.isPlaying, triggerTap, resetIdle]);

  useEffect(() => {
    if (ripples.length === 0) return;
    const timer = setTimeout(() => {
      setRipples((prev) => prev.filter((r) => Date.now() - r.time < 3000));
    }, 3000);
    return () => clearTimeout(timer);
  }, [ripples]);

  const handleStart = useCallback(async () => {
    setStarted(true);
    resetIdle();
    await start();
    setEngineIntensity(intensity);
  }, [start, setEngineIntensity, intensity, resetIdle]);

  const handleStop = useCallback(() => {
    if (audioState.isPlaying) {
      stop();
    } else {
      start();
    }
    resetIdle();
  }, [audioState.isPlaying, start, stop, resetIdle]);

  const handleIntensity = useCallback(
    (v: number) => {
      setIntensity(v);
      setEngineIntensity(v);
      resetIdle();
    },
    [setEngineIntensity, resetIdle]
  );

  const handleBPM = useCallback(
    (bpm: number) => {
      setBPM(bpm);
      resetIdle();
    },
    [setBPM, resetIdle]
  );

  return (
    <div onMouseMove={handleMouseMove} onClick={handleClick} style={{ width: "100%", height: "100%" }}>
      {!started && <StartOverlay onStart={handleStart} />}

      <div className="grotto-canvas">
        <WebGLErrorBoundary>
          <Canvas
            camera={{ position: [0, 0.5, 5], fov: 60 }}
            dpr={[1, 1.5]}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: "high-performance",
            }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x050808, 1);
            }}
          >
            <Suspense fallback={null}>
              <GrottoScene
                audioState={audioState}
                mousePos={mousePos}
                ripples={ripples}
                idleFactor={idleFactor}
              />
            </Suspense>
          </Canvas>
        </WebGLErrorBoundary>
      </div>

      <div className="scanlines" />
      <div className="vignette" />
      <div className="grain-overlay" />

      {started && (
        <>
          <VuMeter audioState={audioState} />
          <GrottoUI
            bpm={audioState.bpm}
            isPlaying={audioState.isPlaying}
            intensity={intensity}
            onBPMChange={handleBPM}
            onStop={handleStop}
            onIntensityChange={handleIntensity}
          />
        </>
      )}
    </div>
  );
}

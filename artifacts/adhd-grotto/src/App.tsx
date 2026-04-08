import { Suspense, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { GrottoScene } from "./components/GrottoScene";
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
      <div className="grotto-title">Grotto — Deep Techno Immersion</div>

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
          − BPM
        </button>
        <button
          className="ctrl-btn"
          onClick={() => onBPMChange(Math.min(160, bpm + 4))}
        >
          + BPM
        </button>

        <button
          className={`ctrl-btn ${isPlaying ? "active" : ""}`}
          onClick={onStop}
        >
          {isPlaying ? "■ Stop" : "▶ Play"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [intensity, setIntensity] = useState(0.5);
  const { audioState, start, stop, setBPM, setIntensity: setEngineIntensity } = useAudioEngine();

  const handleStart = useCallback(async () => {
    setStarted(true);
    await start();
    setEngineIntensity(intensity);
  }, [start, setEngineIntensity, intensity]);

  const handleStop = useCallback(() => {
    if (audioState.isPlaying) {
      stop();
    } else {
      start();
    }
  }, [audioState.isPlaying, start, stop]);

  const handleIntensity = useCallback(
    (v: number) => {
      setIntensity(v);
      setEngineIntensity(v);
    },
    [setEngineIntensity]
  );

  const handleBPM = useCallback(
    (bpm: number) => {
      setBPM(bpm);
    },
    [setBPM]
  );

  return (
    <>
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
              <GrottoScene audioState={audioState} />
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
    </>
  );
}

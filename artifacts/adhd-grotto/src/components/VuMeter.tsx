import { AudioState } from "../engine/AudioEngine";

interface VuMeterProps {
  audioState: AudioState;
}

export function VuMeter({ audioState }: VuMeterProps) {
  const totalBars = 20;
  const activeCount = Math.round(audioState.bassLevel * totalBars * 0.6 + audioState.midLevel * totalBars * 0.4);

  return (
    <div className="vu-meter">
      {Array.from({ length: totalBars }, (_, i) => {
        const idx = totalBars - 1 - i;
        const isActive = idx < activeCount;
        const isMid = idx >= Math.round(totalBars * 0.6) && idx < Math.round(totalBars * 0.85);
        const isPeak = idx >= Math.round(totalBars * 0.85);
        return (
          <div
            key={i}
            className={`vu-bar ${isActive ? (isPeak ? "peak" : isMid ? "mid" : "active") : ""}`}
          />
        );
      })}
    </div>
  );
}

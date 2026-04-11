import { useEffect, useState, useCallback } from "react";
import { AudioEngine, AudioState } from "./AudioEngine";

const defaultState: AudioState = {
  isPlaying: false,
  bpm: 138,
  bassLevel: 0,
  midLevel: 0,
  highLevel: 0,
  kick: 0,
  beatPhase: 0,
};

let sharedEngine: AudioEngine | null = null;

function getEngine(): AudioEngine {
  if (!sharedEngine) {
    sharedEngine = new AudioEngine();
  }
  return sharedEngine;
}

export function useAudioEngine() {
  const [audioState, setAudioState] = useState<AudioState>(defaultState);

  useEffect(() => {
    const engine = getEngine();
    const unsub = engine.subscribe((state) => {
      setAudioState({ ...state });
    });
    return () => {
      unsub();
    };
  }, []);

  const start = useCallback(async () => {
    await getEngine().start();
  }, []);

  const stop = useCallback(() => {
    getEngine().stop();
  }, []);

  const setBPM = useCallback((bpm: number) => {
    getEngine().setBPM(bpm);
  }, []);

  const setIntensity = useCallback((i: number) => {
    getEngine().setIntensity(i);
  }, []);

  const triggerTap = useCallback(() => {
    getEngine().triggerTap();
  }, []);

  return { audioState, start, stop, setBPM, setIntensity, triggerTap };
}

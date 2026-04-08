import { useEffect, useRef, useState, useCallback } from "react";
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
let initialized = false;

export function useAudioEngine() {
  const [audioState, setAudioState] = useState<AudioState>(defaultState);

  useEffect(() => {
    if (!sharedEngine) {
      sharedEngine = new AudioEngine();
    }

    const unsub = sharedEngine.subscribe((state) => {
      setAudioState({ ...state });
    });

    return () => {
      unsub();
    };
  }, []);

  const start = useCallback(async () => {
    if (!sharedEngine) {
      sharedEngine = new AudioEngine();
    }
    if (!initialized) {
      await sharedEngine.init();
      initialized = true;
    }
    await sharedEngine.start();
  }, []);

  const stop = useCallback(() => {
    sharedEngine?.stop();
  }, []);

  const setBPM = useCallback((bpm: number) => {
    sharedEngine?.setBPM(bpm);
  }, []);

  const setIntensity = useCallback((i: number) => {
    sharedEngine?.setIntensity(i);
  }, []);

  return { audioState, start, stop, setBPM, setIntensity };
}

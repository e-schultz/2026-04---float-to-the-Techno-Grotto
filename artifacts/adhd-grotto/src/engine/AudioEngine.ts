import * as Tone from "tone";

export interface AudioState {
  isPlaying: boolean;
  bpm: number;
  bassLevel: number;
  midLevel: number;
  highLevel: number;
  kick: number;
  beatPhase: number;
}

type AudioStateListener = (state: AudioState) => void;

export class AudioEngine {
  private listeners: AudioStateListener[] = [];
  private state: AudioState = {
    isPlaying: false,
    bpm: 138,
    bassLevel: 0,
    midLevel: 0,
    highLevel: 0,
    kick: 0,
    beatPhase: 0,
  };

  // Synths and effects
  private kickSynth: Tone.MembraneSynth | null = null;
  private subBass: Tone.Synth | null = null;
  private wubLfo: Tone.LFO | null = null;
  private hatSynth: Tone.MetalSynth | null = null;
  private padSynth: Tone.PolySynth | null = null;
  private clapSynth: Tone.NoiseSynth | null = null;

  // Analysis
  private bassAnalyzer: Tone.Analyser | null = null;
  private midAnalyzer: Tone.Analyser | null = null;
  private masterAnalyzer: Tone.Analyser | null = null;

  // Sequences
  private kickSeq: Tone.Sequence | null = null;
  private bassSeq: Tone.Sequence | null = null;
  private hatSeq: Tone.Sequence | null = null;
  private padSeq: Tone.Sequence | null = null;
  private clapSeq: Tone.Sequence | null = null;

  // Meters
  private kickMeter: Tone.Meter | null = null;
  private bassMeter: Tone.Meter | null = null;
  private masterMeter: Tone.Meter | null = null;

  private animFrame: number | null = null;
  private beatPhase = 0;
  private lastBeatTime = 0;

  async init() {
    await Tone.start();
    Tone.getTransport().bpm.value = this.state.bpm;

    const masterLimiter = new Tone.Limiter(-3).toDestination();
    const masterReverb = new Tone.Reverb({ decay: 4, wet: 0.15 });
    await masterReverb.generate();
    const masterEQ = new Tone.EQ3({ low: 2, mid: -1, high: -2 });
    masterReverb.connect(masterLimiter);
    masterEQ.connect(masterReverb);

    // Analyzers
    this.bassAnalyzer = new Tone.Analyser("fft", 32);
    this.midAnalyzer = new Tone.Analyser("fft", 32);
    this.masterAnalyzer = new Tone.Analyser("waveform", 64);

    // Kick
    this.kickMeter = new Tone.Meter();
    this.kickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 8,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
      volume: -2,
    });
    const kickDist = new Tone.Distortion(0.15);
    const kickFilter = new Tone.Filter(80, "highpass");
    this.kickSynth.chain(kickDist, kickFilter, this.kickMeter, masterEQ);

    // Sub bass with wub filter
    this.bassMeter = new Tone.Meter();
    this.subBass = new Tone.Synth({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.4 },
      volume: -12,
    });
    const bassFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 200,
      Q: 8,
    });
    const bassDistortion = new Tone.Distortion(0.2);
    const bassChorus = new Tone.Chorus({ frequency: 0.5, depth: 0.3, wet: 0.2 });
    await bassChorus.start();

    // Wub LFO controlling bass filter cutoff
    this.wubLfo = new Tone.LFO({
      frequency: "4n",
      min: 60,
      max: 600,
      type: "sine",
    }).start();
    this.wubLfo.connect(bassFilter.frequency);

    this.subBass.chain(bassFilter, bassDistortion, bassChorus, this.bassMeter, masterEQ);
    this.bassMeter.connect(this.bassAnalyzer);

    // Hi-hats
    this.hatSynth = new Tone.MetalSynth({
      frequency: 800,
      envelope: { attack: 0.001, decay: 0.04, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
      volume: -24,
    });
    const hatFilter = new Tone.Filter(5000, "highpass");
    const hatVerb = new Tone.Reverb({ decay: 0.8, wet: 0.2 });
    await hatVerb.generate();
    this.hatSynth.chain(hatFilter, hatVerb, masterEQ);

    // Clap / snare
    this.clapSynth = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
      volume: -18,
    });
    const clapFilter = new Tone.Filter({ type: "bandpass", frequency: 1800, Q: 2 });
    const clapDist = new Tone.Distortion(0.4);
    this.clapSynth.chain(clapFilter, clapDist, masterEQ);

    // Atmospheric pad
    this.padSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.8, decay: 1.2, sustain: 0.6, release: 2.0 },
      volume: -22,
    });
    const padChorus = new Tone.Chorus({ frequency: 0.3, depth: 0.6, wet: 0.5 });
    await padChorus.start();
    const padVerb = new Tone.Reverb({ decay: 8, wet: 0.6 });
    await padVerb.generate();
    const padFilter = new Tone.Filter({ type: "lowpass", frequency: 800, Q: 0.5 });
    this.padSynth.chain(padFilter, padChorus, padVerb, masterEQ);

    this.masterMeter = new Tone.Meter();
    masterEQ.connect(this.masterMeter);

    this._buildSequences();
    this._startAnalysisLoop();
  }

  private _buildSequences() {
    // Deep techno kick pattern: 4-on-the-floor with variations
    const kickPattern = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    let kickStep = 0;
    this.kickSeq = new Tone.Sequence(
      (time) => {
        if (kickPattern[kickStep % kickPattern.length]) {
          this.kickSynth?.triggerAttackRelease("C1", "8n", time);
        }
        kickStep++;
      },
      kickPattern.map((_, i) => i),
      "16n"
    );

    // Sub bass wub sequence — hypnotic minimal
    const bassNotes = ["C1", "C1", "G1", "C1", "C1", "Bb0", "C1", "D#1"];
    const bassGate =  [1,    0,    0,    1,    0,    1,    0,     0   ];
    let bassStep = 0;
    this.bassSeq = new Tone.Sequence(
      (time) => {
        if (bassGate[bassStep % bassGate.length]) {
          this.subBass?.triggerAttackRelease(
            bassNotes[bassStep % bassNotes.length],
            "8n",
            time
          );
        }
        bassStep++;
      },
      bassNotes.map((_, i) => i),
      "8n"
    );

    // Hi-hat pattern: offbeat industrial
    const hatPattern = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0];
    let hatStep = 0;
    this.hatSeq = new Tone.Sequence(
      (time) => {
        if (hatPattern[hatStep % hatPattern.length]) {
          const vel = hatStep % 4 === 1 ? 0.9 : 0.4;
          this.hatSynth?.triggerAttackRelease(
            hatStep % 8 === 7 ? "64n" : "32n",
            time,
            vel
          );
        }
        hatStep++;
      },
      hatPattern.map((_, i) => i),
      "16n"
    );

    // Clap on 2 and 4
    const clapPattern = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    let clapStep = 0;
    this.clapSeq = new Tone.Sequence(
      (time) => {
        if (clapPattern[clapStep % clapPattern.length]) {
          this.clapSynth?.triggerAttackRelease("16n", time);
        }
        clapStep++;
      },
      clapPattern.map((_, i) => i),
      "16n"
    );

    // Sparse pad chords — eerie and industrial
    const padChords: string[][] = [
      ["C2", "G2", "A#2"],
      [],
      [],
      [],
      ["C2", "F2", "G#2"],
      [],
      [],
      [],
    ];
    let padStep = 0;
    this.padSeq = new Tone.Sequence(
      (time) => {
        const chord = padChords[padStep % padChords.length];
        if (chord.length > 0) {
          this.padSynth?.triggerAttackRelease(chord, "2n", time);
        }
        padStep++;
      },
      padChords.map((_, i) => i),
      "1n"
    );
  }

  private _startAnalysisLoop() {
    const update = () => {
      if (!this.state.isPlaying) {
        this.animFrame = requestAnimationFrame(update);
        return;
      }

      // Bass level
      const bassDb = this.bassMeter?.getValue() ?? -Infinity;
      const bassDbn = typeof bassDb === "number" ? bassDb : (bassDb as Float32Array)[0];
      this.state.bassLevel = Math.min(1, Math.max(0, (bassDbn + 60) / 60));

      // Master level
      const masterDb = this.masterMeter?.getValue() ?? -Infinity;
      const masterDbn = typeof masterDb === "number" ? masterDb : (masterDb as Float32Array)[0];
      this.state.midLevel = Math.min(1, Math.max(0, (masterDbn + 50) / 50));

      // Kick detection
      const kickDb = this.kickMeter?.getValue() ?? -Infinity;
      const kickDbn = typeof kickDb === "number" ? kickDb : (kickDb as Float32Array)[0];
      this.state.kick = Math.min(1, Math.max(0, (kickDbn + 40) / 40));

      // Beat phase from transport
      const now = Tone.now();
      const bps = this.state.bpm / 60;
      const beatPeriod = 1 / bps;
      this.state.beatPhase = (now % beatPeriod) / beatPeriod;

      this.state.highLevel = this.state.midLevel * 0.3;

      this._notify();
      this.animFrame = requestAnimationFrame(update);
    };
    this.animFrame = requestAnimationFrame(update);
  }

  private _notify() {
    for (const listener of this.listeners) {
      listener({ ...this.state });
    }
  }

  subscribe(listener: AudioStateListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async start() {
    if (this.state.isPlaying) return;
    this.state.isPlaying = true;
    this.kickSeq?.start(0);
    this.bassSeq?.start(0);
    this.hatSeq?.start(0);
    this.clapSeq?.start(0);
    this.padSeq?.start(0);
    Tone.getTransport().start();
    this._notify();
  }

  stop() {
    if (!this.state.isPlaying) return;
    this.state.isPlaying = false;
    Tone.getTransport().stop();
    this.kickSeq?.stop();
    this.bassSeq?.stop();
    this.hatSeq?.stop();
    this.clapSeq?.stop();
    this.padSeq?.stop();
    this._notify();
  }

  setBPM(bpm: number) {
    this.state.bpm = bpm;
    Tone.getTransport().bpm.value = bpm;
    this._notify();
  }

  setIntensity(intensity: number) {
    // 0..1 — scale volumes
    if (this.kickSynth) this.kickSynth.volume.value = -2 + intensity * 4;
    if (this.subBass) this.subBass.volume.value = -12 + intensity * 6;
    if (this.hatSynth) this.hatSynth.volume.value = -24 + intensity * 6;
    if (this.padSynth) this.padSynth.set({ volume: -22 + intensity * 8 });
    if (this.wubLfo) {
      this.wubLfo.min = 60 + intensity * 120;
      this.wubLfo.max = 400 + intensity * 600;
    }
  }

  getState() {
    return { ...this.state };
  }

  dispose() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    Tone.getTransport().stop();
    this.kickSeq?.dispose();
    this.bassSeq?.dispose();
    this.hatSeq?.dispose();
    this.clapSeq?.dispose();
    this.padSeq?.dispose();
    this.kickSynth?.dispose();
    this.subBass?.dispose();
    this.hatSynth?.dispose();
    this.clapSynth?.dispose();
    this.padSynth?.dispose();
    this.wubLfo?.dispose();
    this.bassAnalyzer?.dispose();
    this.midAnalyzer?.dispose();
    this.masterAnalyzer?.dispose();
    this.kickMeter?.dispose();
    this.bassMeter?.dispose();
    this.masterMeter?.dispose();
  }
}

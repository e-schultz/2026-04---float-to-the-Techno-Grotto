# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains the ADHD Grotto — a WebGL + Tone.js immersive audiovisual experience.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### adhd-grotto (react-vite, previewPath: /)
Immersive audiovisual web experience — a deep techno grotto for focus and subtle fidgeting.
- **WebGL**: React Three Fiber + Three.js for 3D visuals
  - Custom GLSL shaders: pulsating torus-knot orb, reactive floor grid with click ripples
  - Particle field, industrial rings, floating cubes, fog atmosphere, glow orbs
  - All visuals react to audio analysis in real-time
  - **Mouse reactivity**: cursor position warps the orb shape and floor grid
  - **Slow color drift**: hue shifts subtly over time (lava lamp effect) via GLSL `hueShift()`
  - **Breathing pulse**: independent slow scale oscillation on main orb
  - **Bloom emulation**: edge glow on bright surfaces intensifies with bass
  - **Click ripples**: tapping sends visual waves through the floor grid
  - **Idle evolution**: after 15s of inactivity, camera orbit widens, lights intensify, camera zooms in
- **Audio**: Tone.js synthesizer engine (AudioEngine singleton)
  - Kick drum (MembraneSynth), sub-bass with wub LFO filter sweep
  - Hi-hats (MetalSynth) with ghost hits, clap (NoiseSynth), atmospheric pad (PolySynth)
  - **Sub-harmonic drone layer**: two sine synths (C0 + G0) held with triggerAttack
  - **Rare texture drops**: metallic one-shot pings via MetalSynth + delay/reverb every ~30-60s
  - **Tap synth**: click interaction triggers percussive MembraneSynth note
  - **Humanized timing**: `_humanize()` adds micro-randomness to all note triggers
  - **Generative variation**: random note substitution in bass + chord voicing shifts in pad
  - All instruments sequenced with Tone.Sequence
  - BPM: 138 (adjustable 110-160), intensity/depth slider
  - Bass/kick/mid analysis via Tone.Meter
  - Key fix: always reset transport position to 0 and rebuild sequences on start/stop
- **UI**: Minimal industrial HUD — VU meter, BPM display, depth slider, controls
- **Visual style**: Dark industrial, teal/cyan + deep purple accent, scanlines + vignette + film grain
- **Interaction model**: fidget-relax toy — no menus, everything responds to cursor movement and clicks

### Key Architecture Notes
- `AudioEngine` is a singleton accessed via `getEngine()` in `useAudioEngine.ts`
- Drone synths use `triggerAttack` (held note) on start, `triggerRelease` on stop
- GrottoScene accepts `mousePos`, `ripples[]`, and `idleFactor` props from App
- WebGL context errors in headless environments are expected and caught by `WebGLErrorBoundary`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

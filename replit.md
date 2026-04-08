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
Immersive audiovisual web experience — a deep techno grotto.
- **WebGL**: React Three Fiber + Three.js for 3D visuals
  - Custom GLSL shaders: pulsating torus-knot, reactive floor grid
  - Particle field, industrial rings, floating cubes, fog atmosphere
  - All visuals react to audio analysis in real-time
- **Audio**: Tone.js synthesizer engine
  - Kick drum (MembraneSynth), sub-bass with wub LFO filter sweep
  - Hi-hats (MetalSynth), clap (NoiseSynth), atmospheric pad (PolySynth)
  - All instruments sequenced with Tone.Sequence
  - BPM: 138 (adjustable 110-160)
  - Bass/kick/mid analysis via Tone.Meter
- **UI**: Minimal industrial HUD — VU meter, BPM display, depth slider, controls
- **Visual style**: Dark industrial, teal/cyan + deep purple accent, scanlines + vignette

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

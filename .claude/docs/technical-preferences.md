# Technical Preferences

<!-- Populated by /setup-engine. Updated as the user makes decisions throughout development. -->
<!-- All agents reference this file for project-specific standards and conventions. -->

## Engine & Language

- **Engine**: PixiJS v8.17.1 (Web)
- **Language**: TypeScript 5.7+ (strict, ESM — `moduleResolution: bundler`, `noEmit: true`)
- **Rendering**: PixiJS WebGL renderer (WebGL 1 context, GLSL ES 1.00 shaders)
- **Physics**: None (custom collision/timing logic only)

## Naming Conventions

- **Classes**: PascalCase (e.g., `GameState`, `RingSpawner`)
- **Variables / Functions**: camelCase (e.g., `ringSpeed`, `spawnRound()`)
- **Events / Callbacks**: camelCase, verb-prefixed (e.g., `onRingHit`, `onRoundEnd`)
- **Files**: kebab-case matching primary export (e.g., `ring-spawner.ts`, `game-state.ts`)
- **Scenes / Containers**: PascalCase matching class (e.g., `GameScene`, `HudLayer`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `RING_SPEED`, `PERFECT_WINDOW`)

## Performance Budgets

- **Target Framerate**: 60 fps
- **Frame Budget**: 16.6 ms
- **Draw Calls**: TBD (PixiJS batches automatically; monitor via PixiJS DevTools)
- **Memory Ceiling**: TBD

## Testing

- **Framework**: Vitest (unit tests for game logic); browser smoke tests for rendering
- **Minimum Coverage**: TBD
- **Required Tests**: Timing window formulas, ring spawner logic, difficulty progression, score calculations

## Forbidden Patterns

- `as any` or unsafe type casts — fix type errors with discriminated unions, type guards, or narrowing
- Hardcoded gameplay values outside config/constants files
- Direct DOM manipulation inside game loop (use PixiJS overlay containers or HTML UI layer)
- Synchronous blocking operations in the ticker callback

## Allowed Libraries / Addons

- **PixiJS v8.17.1** — core renderer (approved)
- **Vite** — build tooling (approved for production bundling)

## Architecture Decisions Log

<!-- Quick reference linking to full ADRs in docs/architecture/ -->
- [No ADRs yet — use /architecture-decision to create one]

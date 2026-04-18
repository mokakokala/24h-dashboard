# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (root + server + client)
npm run install:all

# Development (server on :3001 + client on :5173, hot reload)
npm run dev

# Production build (compiles server TS → dist/, client → server/public/)
npm run build

# Start production server (serves API + static client on :3001)
npm start
```

No test suite is configured. No linter scripts are defined.

## Architecture

This is a real-time dashboard for managing a 24-hour relay cycling race across 3 bikes (V1 Performance, V2 Participation, V3 Folklo). It's a monorepo with two packages: `server/` (Express + TypeScript) and `client/` (React + Vite).

**Dev:** Vite proxies `/api/*` → `localhost:3001`. **Prod:** Client is built into `server/public/`, Express serves everything from one port.

### State Model

The entire race state lives in a single in-memory object (`raceState`) persisted to `server/data/race_state.json` via atomic writes (`.tmp` → `.json`). There is no database. Every mutation goes through `setRace()` in `server/src/persistence.ts`, which pushes to a 30-item undo stack before writing.

Key top-level fields: `status` (PENDING → RUNNING → FINISHED), `bikes` (V1/V2/V3 as `BikeState`), `riders[]`, `folkloEntries[]`, `settings`.

### Bike State Machine

Each bike transitions: `IDLE → RUNNING → TRANSITION → RUNNING → …`

Triggered via three POST endpoints:
- `POST /api/pit/tour` — lap completed, same rider continues (RUNNING → RUNNING)
- `POST /api/pit/stop` — lap done, transition begins (RUNNING → TRANSITION)
- `POST /api/pit/start` — new rider starts, closes transition (TRANSITION → RUNNING)

All race logic is in `server/src/raceLogic.ts` (`handleTour`, `handleStop`, `handleStart`).

### API

REST/JSON only (no WebSocket). All responses follow:
```typescript
{ success: boolean, data?: T, error?: string, timestamp: string }
```

Routes are split by domain in `server/src/routes/`: `race.ts`, `bikes.ts`, `laps.ts`, `riders.ts`, `folklo.ts`, `queue.ts`, `backup.ts`, `exports.ts`, `undo.ts`.

### Client Data Flow

`useRaceState` hook polls `GET /api/race` every 1 second. All API calls are wrapped in `client/src/api.ts`. The main UI is `LogistiqueView.tsx` — a tab-based interface (Course, Historique, Riders, Analytics, Settings, Backup).

### Types

`server/src/types.ts` and `client/src/types.ts` are kept in sync manually — they define the shared domain model (`Race`, `BikeState`, `Lap`, `Transition`, `QueueEntry`, `RaceSettings`, etc.).

### Special Cases

- **V3 (Folklo):** Supports dual riders (`isDualRider: true`), maintenance mode toggle, and costume/folklo entries (`FolkloEntry`).
- **Animé Schedule:** Time-windowed restriction on which bikes can run, configurable in settings.
- **Lap Alerts:** Per-bike configurable thresholds (default ~4.5 min) to surface slow/missing riders.
- **Queue:** Pre-register next riders per bike to speed up transitions.
- **Export:** Excel (full data), CSV (simple), JSON backup (full restore), PDF via jsPDF.

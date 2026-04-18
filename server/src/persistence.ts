import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { Race, BikeState, RaceSettings } from './types.js'

const DATA_DIR = path.join(process.cwd(), 'data')
const BACKUPS_DIR = path.join(DATA_DIR, 'backups')
const STATE_FILE = path.join(DATA_DIR, 'race_state.json')
const TEMP_FILE = path.join(DATA_DIR, 'race_state.tmp')
const CSV_FILE = path.join(DATA_DIR, 'race_data.csv')

// ─── Default State Factory ────────────────────────────────────────────────────

const defaultSettings: RaceSettings = {
  relayAlertThresholdMs: 45 * 60 * 1000,
  lapAlertMs: { V1: 4.5 * 60 * 1000, V2: 4.5 * 60 * 1000, V3: 4.5 * 60 * 1000 },
  lapAlertEnabled: { V1: true, V2: true, V3: true },
  circuitDistanceKm: 2.6,
  raceDurationMs: 24 * 60 * 60 * 1000,
}

const defaultBike = (id: 'V1' | 'V2' | 'V3', label: string, isDualRider = false): BikeState => ({
  id,
  label,
  status: 'IDLE',
  isDualRider,
  maintenanceMode: false,
  totalLaps: 0,
  totalDistanceKm: 0,
  laps: [],
  transitions: [],
  queue: [],
})

export const createDefaultRace = (): Race => ({
  id: uuidv4(),
  name: '24h Vélo',
  status: 'PENDING',
  bikes: {
    V1: defaultBike('V1', 'V1 Performance'),
    V2: defaultBike('V2', 'V2 Participation'),
    V3: defaultBike('V3', 'Vélo Folklo', true),
  },
  riders: [],
  folkloEntries: [],
  settings: defaultSettings,
  lastSavedAt: new Date().toISOString(),
  schemaVersion: 1,
})

// ─── Directory Setup ──────────────────────────────────────────────────────────

export const ensureDataDir = (): void => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true })
}

// ─── In-Memory Singleton + Undo Stack ────────────────────────────────────────

let raceState: Race | null = null
const undoStack: Race[] = []
const MAX_UNDO = 30

export const getRace = (): Race => {
  if (!raceState) throw new Error('Race state not initialized')
  return raceState
}

export const setRace = (newState: Race): void => {
  // Push current state to undo stack before overwriting
  if (raceState) {
    undoStack.push(JSON.parse(JSON.stringify(raceState)))
    if (undoStack.length > MAX_UNDO) undoStack.shift()
  }
  newState.lastSavedAt = new Date().toISOString()
  raceState = newState
  saveRaceState(newState)
}

export const undoLast = (): Race | null => {
  if (undoStack.length === 0) return null
  const prev = undoStack.pop()!
  prev.lastSavedAt = new Date().toISOString()
  raceState = prev
  saveRaceState(prev)
  return prev
}

export const canUndo = (): boolean => undoStack.length > 0

// ─── Load / Save ─────────────────────────────────────────────────────────────

export const loadRaceState = (): Race => {
  ensureDataDir()

  if (!fs.existsSync(STATE_FILE)) {
    console.log('📁 No existing state found. Starting fresh.')
    const fresh = createDefaultRace()
    raceState = fresh
    return fresh
  }

  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as Race

    if (parsed.schemaVersion !== 1 || !parsed.bikes || !parsed.bikes.V1 || !parsed.bikes.V2) {
      throw new Error('Invalid schema')
    }

    // Migrations
    for (const bikeId of ['V1', 'V2', 'V3'] as const) {
      if (bikeId === 'V3' && !parsed.bikes.V3) {
        parsed.bikes.V3 = defaultBike('V3', 'Vélo Folklo', true)
      }
      if (parsed.bikes[bikeId] && !parsed.bikes[bikeId].queue) {
        parsed.bikes[bikeId].queue = []
      }
      if (parsed.bikes[bikeId] && parsed.bikes[bikeId].maintenanceMode === undefined) {
        parsed.bikes[bikeId].maintenanceMode = false
      }
      // If bike is in maintenance but has no start timestamp (old state), backfill with now
      if (parsed.bikes[bikeId]?.maintenanceMode && !parsed.bikes[bikeId].maintenanceStartTimestamp) {
        parsed.bikes[bikeId].maintenanceStartTimestamp = new Date().toISOString()
      }
    }
    // Set isDualRider on V3
    if (parsed.bikes.V3) parsed.bikes.V3.isDualRider = true

    // Migrate settings
    if (!parsed.settings.lapAlertMs) {
      const legacy = parsed.settings.relayAlertThresholdMs ?? 45 * 60 * 1000
      parsed.settings.lapAlertMs = { V1: legacy, V2: legacy, V3: 4.5 * 60 * 1000 }
    }
    if (!parsed.settings.lapAlertEnabled) {
      parsed.settings.lapAlertEnabled = { V1: true, V2: true, V3: true }
    }
    if (!parsed.settings.circuitDistanceKm) parsed.settings.circuitDistanceKm = 2.6
    if (!parsed.settings.raceDurationMs) parsed.settings.raceDurationMs = 24 * 60 * 60 * 1000
    if (!parsed.settings.enabledBikes) parsed.settings.enabledBikes = { V1: true, V2: true, V3: true }
    if (!parsed.settings.bikeLabels) {
      parsed.settings.bikeLabels = {
        V1: parsed.bikes.V1?.label ?? 'V1 Performance',
        V2: parsed.bikes.V2?.label ?? 'V2 Participation',
        V3: parsed.bikes.V3?.label ?? 'Vélo Folklo',
      }
    }
    // Always sync bikeLabels → bike.label (source of truth is settings.bikeLabels)
    for (const id of ['V1', 'V2', 'V3'] as const) {
      if (parsed.bikes[id] && parsed.settings.bikeLabels[id]) {
        parsed.bikes[id].label = parsed.settings.bikeLabels[id]
      }
    }

    // Strip unknown fields from riders, preserve type
    parsed.riders = parsed.riders.map(r => ({ id: r.id, name: r.name, ...(r.type ? { type: r.type } : {}) }))

    console.log(`✅ Restored race state: "${parsed.name}" (${parsed.status}) — ${new Date(parsed.lastSavedAt).toLocaleString('fr-BE')}`)
    raceState = parsed
    return parsed
  } catch (err) {
    console.error('⚠️  Failed to parse state file, starting fresh:', err)
    const fresh = createDefaultRace()
    raceState = fresh
    return fresh
  }
}

const saveRaceState = (race: Race): void => {
  const json = JSON.stringify(race, null, 2)

  // Atomic JSON write
  fs.writeFileSync(TEMP_FILE, json, 'utf-8')
  fs.renameSync(TEMP_FILE, STATE_FILE)

  // Async timestamped backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupFile = path.join(BACKUPS_DIR, `race_state_${timestamp}.json`)
  fs.writeFile(backupFile, json, 'utf-8', (err) => {
    if (err) console.error('⚠️  Backup write failed:', err)
  })

  // Real-time CSV backup (fire and forget)
  writeCsvBackup(race)
}

const writeCsvBackup = (race: Race): void => {
  try {
    const lines: string[] = [
      'Vélo,Tour#,Coureur,Coureur2,Type,Départ,Arrivée,Durée(ms),Vitesse(km/h),Notes'
    ]
    for (const bikeId of ['V1', 'V2', 'V3'] as const) {
      const bike = race.bikes[bikeId]
      const sorted = [...bike.laps].sort((a, b) => a.lapNumber - b.lapNumber)
      for (const lap of sorted) {
        const row = [
          bikeId,
          lap.lapNumber,
          `"${lap.riderName}"`,
          `"${lap.riderName2 ?? ''}"`,
          lap.type,
          lap.startTimestamp,
          lap.endTimestamp,
          lap.durationMs,
          lap.speedKmh,
          `"${lap.notes ?? ''}"`,
        ]
        lines.push(row.join(','))
      }
    }
    fs.writeFile(CSV_FILE, lines.join('\n'), 'utf-8', () => {})
  } catch {
    // Ignore CSV write errors
  }
}

// ─── Backup Management ────────────────────────────────────────────────────────

export const listBackups = (): string[] => {
  if (!fs.existsSync(BACKUPS_DIR)) return []
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
}

export const restoreFromBackup = (filename: string): Race => {
  const filepath = path.join(BACKUPS_DIR, filename)
  if (!fs.existsSync(filepath)) throw new Error(`Backup not found: ${filename}`)
  const raw = fs.readFileSync(filepath, 'utf-8')
  const parsed = JSON.parse(raw) as Race
  if (parsed.schemaVersion !== 1 || !parsed.bikes?.V1 || !parsed.bikes?.V2) {
    throw new Error('Invalid backup schema')
  }

  // Apply same migrations as loadRaceState to handle old backups
  if (!parsed.bikes.V3) parsed.bikes.V3 = defaultBike('V3', 'Vélo Folklo', true)
  for (const bikeId of ['V1', 'V2', 'V3'] as const) {
    if (!parsed.bikes[bikeId].queue) parsed.bikes[bikeId].queue = []
    if (parsed.bikes[bikeId].maintenanceMode === undefined) parsed.bikes[bikeId].maintenanceMode = false
  }
  parsed.bikes.V3.isDualRider = true
  if (!parsed.folkloEntries) parsed.folkloEntries = []
  if (!parsed.settings) parsed.settings = defaultSettings
  if (!parsed.settings.lapAlertMs) {
    const legacy = parsed.settings.relayAlertThresholdMs ?? 45 * 60 * 1000
    parsed.settings.lapAlertMs = { V1: legacy, V2: legacy, V3: 4.5 * 60 * 1000 }
  }
  if (!parsed.settings.lapAlertEnabled) parsed.settings.lapAlertEnabled = { V1: true, V2: true, V3: true }
  if (!parsed.settings.circuitDistanceKm) parsed.settings.circuitDistanceKm = 2.6
  if (!parsed.settings.raceDurationMs) parsed.settings.raceDurationMs = 24 * 60 * 60 * 1000
  if (!parsed.settings.enabledBikes) parsed.settings.enabledBikes = { V1: true, V2: true, V3: true }
  if (!parsed.settings.bikeLabels) {
    parsed.settings.bikeLabels = {
      V1: parsed.bikes.V1?.label ?? 'V1 Performance',
      V2: parsed.bikes.V2?.label ?? 'V2 Participation',
      V3: parsed.bikes.V3?.label ?? 'Vélo Folklo',
    }
  }
  // Always sync bikeLabels → bike.label (source of truth is settings.bikeLabels)
  for (const id of ['V1', 'V2', 'V3'] as const) {
    if (parsed.bikes[id] && parsed.settings.bikeLabels[id]) {
      parsed.bikes[id].label = parsed.settings.bikeLabels[id]
    }
  }
  parsed.riders = parsed.riders?.map(r => ({ id: r.id, name: r.name, ...(r.type ? { type: r.type } : {}) })) ?? []

  // Don't push to undo when restoring backup
  parsed.lastSavedAt = new Date().toISOString()
  raceState = parsed
  saveRaceState(parsed)
  return parsed
}

export const importFromJson = (jsonString: string): Race => {
  const parsed = JSON.parse(jsonString) as Race
  if (parsed.schemaVersion !== 1) throw new Error('schemaVersion must be 1')
  if (!parsed.id || !parsed.bikes || !parsed.bikes.V1 || !parsed.bikes.V2) {
    throw new Error('Missing required fields: id, bikes.V1, bikes.V2')
  }
  if (!parsed.riders) parsed.riders = []
  if (!parsed.folkloEntries) parsed.folkloEntries = []
  if (!parsed.settings) parsed.settings = defaultSettings
  if (!parsed.bikes.V3) parsed.bikes.V3 = defaultBike('V3', 'Vélo Folklo', true)
  setRace(parsed)
  return parsed
}

export const getStateFilePath = (): string => STATE_FILE
export const getBackupsDirPath = (): string => BACKUPS_DIR
export const getCsvFilePath = (): string => CSV_FILE

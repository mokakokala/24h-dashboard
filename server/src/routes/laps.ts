import { Router, type Request, type Response } from 'express'
import { getRace, setRace } from '../persistence.js'
import { recomputeBikeTotals } from '../raceLogic.js'
import type { ApiResponse, Lap, BikeId } from '../types.js'

const router = Router()

const ALL_BIKES: BikeId[] = ['V1', 'V2', 'V3']

// GET /api/laps?bikeId=V1
router.get('/', (req: Request, res: Response) => {
  const race = getRace()
  const bikeId = req.query.bikeId as BikeId | undefined

  let laps: Lap[]
  if (bikeId && ALL_BIKES.includes(bikeId)) {
    laps = race.bikes[bikeId].laps
  } else {
    laps = ALL_BIKES.flatMap(id => race.bikes[id].laps)
      .sort((a, b) => Date.parse(a.endTimestamp) - Date.parse(b.endTimestamp))
  }

  const response: ApiResponse<Lap[]> = { success: true, data: laps, timestamp: new Date().toISOString() }
  res.json(response)
})

// C8: Only these fields may be edited on a lap
const ALLOWED_LAP_UPDATES = new Set<keyof Lap>(['riderName', 'riderName2', 'durationMs', 'startTimestamp', 'endTimestamp', 'notes'])

// PUT /api/laps/:lapId — edit a lap
router.put('/:lapId', (req: Request, res: Response) => {
  const { lapId } = req.params
  const race = getRace()
  const raw = req.body as Record<string, unknown>
  const updates: Partial<Lap> = {}
  for (const key of ALLOWED_LAP_UPDATES) {
    if (raw[key] !== undefined) (updates as Record<string, unknown>)[key] = raw[key]
  }
  if ('durationMs' in updates && (typeof updates.durationMs !== 'number' || updates.durationMs <= 0)) {
    res.status(400).json({ success: false, error: 'durationMs must be a positive number', timestamp: new Date().toISOString() })
    return
  }

  for (const bikeId of ALL_BIKES) {
    const idx = race.bikes[bikeId].laps.findIndex((l) => l.id === lapId)
    if (idx === -1) continue

    const original = race.bikes[bikeId].laps[idx]
    const updated: Lap = { ...original, ...updates, id: lapId, bikeId }

    // Recompute duration and speed if timestamps or durationMs changed
    if (updates.startTimestamp || updates.endTimestamp) {
      const start = Date.parse(updated.startTimestamp)
      const end = Date.parse(updated.endTimestamp)
      updated.durationMs = end - start
      updated.speedKmh = updated.durationMs > 0
        ? parseFloat((updated.distanceKm / (updated.durationMs / 3_600_000)).toFixed(2))
        : 0
    } else if (updates.durationMs !== undefined) {
      // durationMs is the corrected analytical truth — timestamps stay as the honest wall-clock record
      updated.durationMs = updates.durationMs
      updated.speedKmh = updates.durationMs > 0
        ? parseFloat((updated.distanceKm / (updates.durationMs / 3_600_000)).toFixed(2))
        : 0
    }

    const newLaps = [...race.bikes[bikeId].laps]
    newLaps[idx] = updated
    const newRace = { ...race, bikes: { ...race.bikes, [bikeId]: { ...race.bikes[bikeId], laps: newLaps } } }
    setRace(newRace)

    const response: ApiResponse<Lap> = { success: true, data: updated, timestamp: new Date().toISOString() }
    res.json(response)
    return
  }

  res.status(404).json({ success: false, error: `Lap ${lapId} not found`, timestamp: new Date().toISOString() })
})

// DELETE /api/laps/:lapId
router.delete('/:lapId', (req: Request, res: Response) => {
  const { lapId } = req.params
  const race = getRace()

  for (const bikeId of ALL_BIKES) {
    const idx = race.bikes[bikeId].laps.findIndex((l) => l.id === lapId)
    if (idx === -1) continue

    const newLaps = race.bikes[bikeId].laps.filter((l) => l.id !== lapId)
    let newRace = { ...race, bikes: { ...race.bikes, [bikeId]: { ...race.bikes[bikeId], laps: newLaps } } }
    newRace = recomputeBikeTotals(newRace, bikeId)
    setRace(newRace)

    const response: ApiResponse = { success: true, timestamp: new Date().toISOString() }
    res.json(response)
    return
  }

  res.status(404).json({ success: false, error: `Lap ${lapId} not found`, timestamp: new Date().toISOString() })
})

export default router

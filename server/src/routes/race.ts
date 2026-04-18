import { Router, type Request, type Response } from 'express'
import { getRace, setRace, createDefaultRace } from '../persistence.js'
import type { ApiResponse, Race } from '../types.js'

const router = Router()

// GET /api/race
router.get('/', (_req: Request, res: Response) => {
  const response: ApiResponse<Race> = {
    success: true,
    data: getRace(),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
})

// POST /api/race/start
router.post('/start', (_req: Request, res: Response) => {
  const race = getRace()
  if (race.status === 'RUNNING') {
    res.status(409).json({ success: false, error: 'Race already running', timestamp: new Date().toISOString() })
    return
  }
  const now = new Date().toISOString()
  const updated: Race = {
    ...race,
    status: 'RUNNING',
    startTimestamp: race.startTimestamp ?? now,
    bikes: {
      V1: { ...race.bikes.V1, status: 'RUNNING', currentLapStartTimestamp: race.bikes.V1.currentLapStartTimestamp ?? now },
      V2: { ...race.bikes.V2, status: 'RUNNING', currentLapStartTimestamp: race.bikes.V2.currentLapStartTimestamp ?? now },
      V3: { ...race.bikes.V3, status: 'RUNNING', currentLapStartTimestamp: race.bikes.V3.currentLapStartTimestamp ?? now },
    },
  }
  setRace(updated)
  const response: ApiResponse<Race> = { success: true, data: updated, timestamp: now }
  res.json(response)
})

// POST /api/race/finish
router.post('/finish', (_req: Request, res: Response) => {
  const race = getRace()
  if (race.status !== 'RUNNING' && race.status !== 'PAUSED') {
    res.status(409).json({ success: false, error: 'Race is not running or paused', timestamp: new Date().toISOString() })
    return
  }
  const now = new Date().toISOString()
  const updated: Race = { ...race, status: 'FINISHED', endTimestamp: now }
  setRace(updated)
  res.json({ success: true, data: updated, timestamp: now })
})

// POST /api/race/reopen
router.post('/reopen', (_req: Request, res: Response) => {
  const race = getRace()
  if (race.status !== 'FINISHED') {
    res.status(409).json({ success: false, error: 'Race is not finished', timestamp: new Date().toISOString() })
    return
  }
  const updated: Race = { ...race, status: 'RUNNING', endTimestamp: undefined }
  setRace(updated)
  res.json({ success: true, data: updated, timestamp: new Date().toISOString() })
})

// POST /api/race/reset
router.post('/reset', (req: Request, res: Response) => {
  if (req.body?.confirm !== true) {
    res.status(400).json({ success: false, error: 'Send { confirm: true } to reset', timestamp: new Date().toISOString() })
    return
  }
  const fresh = createDefaultRace()
  setRace(fresh)
  const response: ApiResponse<Race> = { success: true, data: fresh, timestamp: new Date().toISOString() }
  res.json(response)
})

// PUT /api/race/settings
router.put('/settings', (req: Request, res: Response) => {
  const race = getRace()
  const newSettings = { ...race.settings, ...req.body }

  // Sync bike labels into bike.label when bikeLabels is updated
  let bikes = race.bikes
  if (req.body.bikeLabels) {
    bikes = { ...bikes }
    for (const id of ['V1', 'V2', 'V3'] as const) {
      if (req.body.bikeLabels[id] !== undefined) {
        bikes[id] = { ...bikes[id], label: req.body.bikeLabels[id] }
      }
    }
  }

  const updated: Race = { ...race, settings: newSettings, bikes }
  setRace(updated)
  const response: ApiResponse<Race> = { success: true, data: updated, timestamp: new Date().toISOString() }
  res.json(response)
})

// POST /api/race/pause
router.post('/pause', (_req: Request, res: Response) => {
  const race = getRace()
  if (race.status !== 'RUNNING') {
    res.status(409).json({ success: false, error: 'Race is not running', timestamp: new Date().toISOString() })
    return
  }
  const now = new Date().toISOString()
  const nowMs = Date.now()

  // Freeze lap timers on all RUNNING bikes
  const bikes = { ...race.bikes }
  for (const id of ['V1', 'V2', 'V3'] as const) {
    const bike = bikes[id]
    if (bike.status === 'RUNNING' && bike.currentLapStartTimestamp && !bike.maintenanceMode) {
      bikes[id] = {
        ...bike,
        pausedLapElapsedMs: nowMs - Date.parse(bike.currentLapStartTimestamp),
      }
    }
  }

  const updated: Race = { ...race, status: 'PAUSED', pausedAt: now, bikes }
  setRace(updated)
  res.json({ success: true, data: updated, timestamp: now })
})

// POST /api/race/resume
router.post('/resume', (_req: Request, res: Response) => {
  const race = getRace()
  if (race.status !== 'PAUSED') {
    res.status(409).json({ success: false, error: 'Race is not paused', timestamp: new Date().toISOString() })
    return
  }
  const now = new Date().toISOString()
  const nowMs = Date.now()
  const pauseDurationMs = race.pausedAt ? nowMs - Date.parse(race.pausedAt) : 0

  // Unfreeze lap timers: shift currentLapStartTimestamp forward by pause duration
  const bikes = { ...race.bikes }
  for (const id of ['V1', 'V2', 'V3'] as const) {
    const bike = bikes[id]
    if (bike.status === 'RUNNING' && bike.pausedLapElapsedMs !== undefined && !bike.maintenanceMode) {
      bikes[id] = {
        ...bike,
        currentLapStartTimestamp: new Date(nowMs - bike.pausedLapElapsedMs).toISOString(),
        pausedLapElapsedMs: undefined,
      }
    }
  }

  const updated: Race = {
    ...race,
    status: 'RUNNING',
    pausedAt: undefined,
    totalPausedMs: (race.totalPausedMs ?? 0) + pauseDurationMs,
    bikes,
  }
  setRace(updated)
  res.json({ success: true, data: updated, timestamp: now })
})

// PATCH /api/race/bikes/:bikeId/current-rider — update name of currently running rider
router.patch('/bikes/:bikeId/current-rider', (req: Request, res: Response) => {
  const { bikeId } = req.params
  if (!['V1', 'V2', 'V3'].includes(bikeId)) {
    res.status(400).json({ success: false, error: 'Invalid bikeId', timestamp: new Date().toISOString() })
    return
  }
  const race = getRace()
  const bike = race.bikes[bikeId as 'V1' | 'V2' | 'V3']
  if (bike.status !== 'RUNNING') {
    res.status(409).json({ success: false, error: 'Bike is not RUNNING', timestamp: new Date().toISOString() })
    return
  }
  const { riderId, riderName, riderId2, riderName2 } = req.body as {
    riderId?: string; riderName?: string; riderId2?: string; riderName2?: string
  }
  const updatedBike = {
    ...bike,
    currentRiderId: riderId ?? bike.currentRiderId,
    currentRiderName: riderName !== undefined ? riderName : bike.currentRiderName,
    currentRiderId2: riderId2 !== undefined ? riderId2 : bike.currentRiderId2,
    currentRiderName2: riderName2 !== undefined ? riderName2 : bike.currentRiderName2,
  }
  const updated: Race = { ...race, bikes: { ...race.bikes, [bikeId]: updatedBike } }
  setRace(updated)
  res.json({ success: true, data: updated, timestamp: new Date().toISOString() })
})

// PATCH /api/race/bikes/:bikeId/maintenance — toggle maintenance mode
router.patch('/bikes/:bikeId/maintenance', (req: Request, res: Response) => {
  const { bikeId } = req.params
  if (!['V1', 'V2', 'V3'].includes(bikeId)) {
    res.status(400).json({ success: false, error: 'Invalid bikeId', timestamp: new Date().toISOString() })
    return
  }
  const race = getRace()
  const bike = race.bikes[bikeId as 'V1' | 'V2' | 'V3']
  const now = Date.now()
  const turningOn = !bike.maintenanceMode
  const updatedBike = {
    ...bike,
    maintenanceMode: turningOn,
    maintenanceStartTimestamp: turningOn ? new Date(now).toISOString() : undefined,
    pausedLapElapsedMs: turningOn && bike.currentLapStartTimestamp
      ? now - Date.parse(bike.currentLapStartTimestamp)
      : undefined,
    currentLapStartTimestamp: !turningOn && bike.maintenanceStartTimestamp && bike.currentLapStartTimestamp
      ? new Date(Date.parse(bike.currentLapStartTimestamp) + (now - Date.parse(bike.maintenanceStartTimestamp))).toISOString()
      : bike.currentLapStartTimestamp,
  }
  const updated: Race = { ...race, bikes: { ...race.bikes, [bikeId]: updatedBike } }
  setRace(updated)
  const response: ApiResponse<Race> = { success: true, data: updated, timestamp: new Date().toISOString() }
  res.json(response)
})

export default router

import { Router, type Request, type Response, type NextFunction } from 'express'
import { getRace, setRace } from '../persistence.js'
import { handleTour, handleStop, handleStart } from '../raceLogic.js'
import type { ApiResponse, BikeState, TourPayload, StopPayload, StartPayload } from '../types.js'

const router = Router()

// POST /api/pit/tour
router.post('/tour', (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body as TourPayload
    if (!payload.bikeId) {
      res.status(400).json({ success: false, error: 'Missing bikeId', timestamp: new Date().toISOString() })
      return
    }
    const race = getRace()
    if (race.status === 'PAUSED') {
      res.status(409).json({ success: false, error: 'Race is paused', timestamp: new Date().toISOString() })
      return
    }
    const updated = handleTour(race, payload)
    setRace(updated)
    const response: ApiResponse<BikeState> = {
      success: true,
      data: updated.bikes[payload.bikeId],
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

// POST /api/pit/stop
router.post('/stop', (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body as StopPayload
    if (!payload.bikeId) {
      res.status(400).json({ success: false, error: 'Missing bikeId', timestamp: new Date().toISOString() })
      return
    }
    const race = getRace()
    if (race.status === 'PAUSED') {
      res.status(409).json({ success: false, error: 'Race is paused', timestamp: new Date().toISOString() })
      return
    }
    const updated = handleStop(race, payload)
    setRace(updated)
    const response: ApiResponse<BikeState> = {
      success: true,
      data: updated.bikes[payload.bikeId],
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

// POST /api/pit/start
router.post('/start', (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body as StartPayload
    if (!payload.bikeId) {
      res.status(400).json({ success: false, error: 'Missing bikeId', timestamp: new Date().toISOString() })
      return
    }
    const race = getRace()
    if (race.status === 'PAUSED') {
      res.status(409).json({ success: false, error: 'Race is paused', timestamp: new Date().toISOString() })
      return
    }
    const updated = handleStart(race, payload)
    setRace(updated)
    const response: ApiResponse<BikeState> = {
      success: true,
      data: updated.bikes[payload.bikeId],
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

// POST /api/pit/start-from-queue
// M8: Atomically dequeues the first entry and starts the bike in one operation.
// Prevents the two-call race condition where the rider disappears from the queue
// but the bike never starts if the second request fails.
router.post('/start-from-queue', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bikeId, dequeueEntryId } = req.body as { bikeId?: string; dequeueEntryId?: string }
    if (!bikeId) {
      res.status(400).json({ success: false, error: 'Missing bikeId', timestamp: new Date().toISOString() })
      return
    }
    let race = getRace()
    if (race.status === 'PAUSED') {
      res.status(409).json({ success: false, error: 'Race is paused', timestamp: new Date().toISOString() })
      return
    }
    const id = bikeId as 'V1' | 'V2' | 'V3'

    // Dequeue atomically before starting
    if (dequeueEntryId) {
      const queue = race.bikes[id].queue.filter(e => e.id !== dequeueEntryId)
      race = { ...race, bikes: { ...race.bikes, [id]: { ...race.bikes[id], queue } } }
    }

    const payload: StartPayload = {
      bikeId: id,
      riderId: req.body.riderId ?? 'unknown',
      riderName: req.body.riderName ?? '',
      riderId2: req.body.riderId2,
      riderName2: req.body.riderName2,
    }
    const updated = handleStart(race, payload)
    setRace(updated)
    const response: ApiResponse<BikeState> = {
      success: true,
      data: updated.bikes[id],
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

export default router

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

export default router

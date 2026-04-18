import { Router, type Request, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getRace, setRace } from '../persistence.js'
import type { ApiResponse, Rider } from '../types.js'

const router = Router()

router.get('/', (_req: Request, res: Response) => {
  const response: ApiResponse<Rider[]> = { success: true, data: getRace().riders, timestamp: new Date().toISOString() }
  res.json(response)
})

router.post('/', (req: Request, res: Response) => {
  const { name, type } = req.body as { name?: string; type?: string }
  if (!name?.trim()) {
    res.status(400).json({ success: false, error: 'name is required', timestamp: new Date().toISOString() })
    return
  }
  const race = getRace()
  const rider: Rider = {
    id: uuidv4(),
    name: name.trim(),
    ...(type === 'animé' || type === 'autre' ? { type } : {}),
  }
  setRace({ ...race, riders: [...race.riders, rider] })
  const response: ApiResponse<Rider> = { success: true, data: rider, timestamp: new Date().toISOString() }
  res.status(201).json(response)
})

router.put('/:riderId', (req: Request, res: Response) => {
  const { riderId } = req.params
  const race = getRace()
  const idx = race.riders.findIndex((r) => r.id === riderId)
  if (idx === -1) { res.status(404).json({ success: false, error: 'Rider not found', timestamp: new Date().toISOString() }); return }
  const { name, type } = req.body as { name?: string; type?: string }
  const prev = race.riders[idx]
  const updated: Rider = {
    id: riderId,
    name: name?.trim() ?? prev.name,
    ...(type === 'animé' || type === 'autre' ? { type } : type === '' ? {} : prev.type ? { type: prev.type } : {}),
  }
  const newRiders = [...race.riders]
  newRiders[idx] = updated
  setRace({ ...race, riders: newRiders })
  const response: ApiResponse<Rider> = { success: true, data: updated, timestamp: new Date().toISOString() }
  res.json(response)
})

router.delete('/:riderId', (req: Request, res: Response) => {
  const { riderId } = req.params
  const race = getRace()
  if (!race.riders.some((r) => r.id === riderId)) {
    res.status(404).json({ success: false, error: 'Rider not found', timestamp: new Date().toISOString() })
    return
  }
  setRace({ ...race, riders: race.riders.filter((r) => r.id !== riderId) })
  res.json({ success: true, timestamp: new Date().toISOString() })
})

export default router

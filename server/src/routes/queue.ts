import { Router, type Request, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getRace, setRace } from '../persistence.js'
import type { ApiResponse, BikeId, QueueEntry } from '../types.js'

const router = Router()

const validBike = (id: string): id is BikeId => id === 'V1' || id === 'V2' || id === 'V3'

// POST /api/queue/:bikeId — add rider to queue
router.post('/:bikeId', (req: Request, res: Response) => {
  const { bikeId } = req.params
  if (!validBike(bikeId)) { res.status(400).json({ success: false, error: 'Invalid bikeId', timestamp: new Date().toISOString() }); return }

  const { riderName, riderName2 } = req.body as { riderName?: string; riderName2?: string }
  if (!riderName?.trim()) { res.status(400).json({ success: false, error: 'riderName required', timestamp: new Date().toISOString() }); return }

  const race = getRace()
  const entry: QueueEntry = { id: uuidv4(), riderName: riderName.trim(), riderName2: riderName2?.trim() || undefined }
  const updatedBike = { ...race.bikes[bikeId], queue: [...race.bikes[bikeId].queue, entry] }
  setRace({ ...race, bikes: { ...race.bikes, [bikeId]: updatedBike } })

  const response: ApiResponse<QueueEntry> = { success: true, data: entry, timestamp: new Date().toISOString() }
  res.status(201).json(response)
})

// DELETE /api/queue/:bikeId/:entryId — remove from queue
router.delete('/:bikeId/:entryId', (req: Request, res: Response) => {
  const { bikeId, entryId } = req.params
  if (!validBike(bikeId)) { res.status(400).json({ success: false, error: 'Invalid bikeId', timestamp: new Date().toISOString() }); return }

  const race = getRace()
  const exists = race.bikes[bikeId].queue.some((e) => e.id === entryId)
  if (!exists) { res.status(404).json({ success: false, error: 'Queue entry not found', timestamp: new Date().toISOString() }); return }

  const updatedBike = { ...race.bikes[bikeId], queue: race.bikes[bikeId].queue.filter((e) => e.id !== entryId) }
  setRace({ ...race, bikes: { ...race.bikes, [bikeId]: updatedBike } })
  res.json({ success: true, timestamp: new Date().toISOString() })
})

// PUT /api/queue/:bikeId — replace entire queue
router.put('/:bikeId', (req: Request, res: Response) => {
  const { bikeId } = req.params
  if (!validBike(bikeId)) { res.status(400).json({ success: false, error: 'Invalid bikeId', timestamp: new Date().toISOString() }); return }

  const raw = req.body
  if (!Array.isArray(raw)) { res.status(400).json({ success: false, error: 'Body must be an array', timestamp: new Date().toISOString() }); return }
  // C8: Validate and sanitise each entry — only keep known safe fields
  const queue: QueueEntry[] = raw
    .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
    .filter(e => typeof e.id === 'string' && typeof e.riderName === 'string')
    .map(e => ({
      id: String(e.id),
      riderName: String(e.riderName).trim(),
      ...(e.riderName2 && typeof e.riderName2 === 'string' ? { riderName2: e.riderName2.trim() } : {}),
    }))

  const race = getRace()
  const updatedBike = { ...race.bikes[bikeId], queue }
  setRace({ ...race, bikes: { ...race.bikes, [bikeId]: updatedBike } })

  const response: ApiResponse<QueueEntry[]> = { success: true, data: queue, timestamp: new Date().toISOString() }
  res.json(response)
})

export default router

import { Router, type Request, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getRace, setRace } from '../persistence.js'
import type { ApiResponse, FolkloEntry } from '../types.js'

const router = Router()

// GET /api/folklo
router.get('/', (_req: Request, res: Response) => {
  const response: ApiResponse<FolkloEntry[]> = {
    success: true,
    data: getRace().folkloEntries,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
})

// POST /api/folklo
router.post('/', (req: Request, res: Response) => {
  const { teamName, costumeDescription, notes } = req.body as Partial<FolkloEntry>
  if (!teamName?.trim()) {
    res.status(400).json({ success: false, error: 'teamName is required', timestamp: new Date().toISOString() })
    return
  }
  const race = getRace()
  const entry: FolkloEntry = {
    id: uuidv4(),
    teamName: teamName.trim(),
    costumeDescription: costumeDescription?.trim() ?? '',
    notes: notes?.trim(),
    timestamp: new Date().toISOString(),
  }
  setRace({ ...race, folkloEntries: [...race.folkloEntries, entry] })
  const response: ApiResponse<FolkloEntry> = { success: true, data: entry, timestamp: new Date().toISOString() }
  res.status(201).json(response)
})

// PUT /api/folklo/:entryId
router.put('/:entryId', (req: Request, res: Response) => {
  const { entryId } = req.params
  const race = getRace()
  const idx = race.folkloEntries.findIndex((e) => e.id === entryId)
  if (idx === -1) {
    res.status(404).json({ success: false, error: 'Entry not found', timestamp: new Date().toISOString() })
    return
  }
  const updated: FolkloEntry = { ...race.folkloEntries[idx], ...req.body, id: entryId }
  const newEntries = [...race.folkloEntries]
  newEntries[idx] = updated
  setRace({ ...race, folkloEntries: newEntries })
  const response: ApiResponse<FolkloEntry> = { success: true, data: updated, timestamp: new Date().toISOString() }
  res.json(response)
})

// DELETE /api/folklo/:entryId
router.delete('/:entryId', (req: Request, res: Response) => {
  const { entryId } = req.params
  const race = getRace()
  const exists = race.folkloEntries.some((e) => e.id === entryId)
  if (!exists) {
    res.status(404).json({ success: false, error: 'Entry not found', timestamp: new Date().toISOString() })
    return
  }
  setRace({ ...race, folkloEntries: race.folkloEntries.filter((e) => e.id !== entryId) })
  res.json({ success: true, timestamp: new Date().toISOString() })
})

export default router

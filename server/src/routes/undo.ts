import { Router, type Request, type Response } from 'express'
import { undoLast, canUndo } from '../persistence.js'
import type { ApiResponse, Race } from '../types.js'

const router = Router()

// POST /api/undo
router.post('/', (_req: Request, res: Response) => {
  if (!canUndo()) {
    res.status(400).json({ success: false, error: 'Rien à annuler', timestamp: new Date().toISOString() })
    return
  }
  const restored = undoLast()
  const response: ApiResponse<Race> = {
    success: true,
    data: restored ?? undefined,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
})

// GET /api/undo/can — check if undo is available
router.get('/can', (_req: Request, res: Response) => {
  res.json({ success: true, canUndo: canUndo(), timestamp: new Date().toISOString() })
})

export default router

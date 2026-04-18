import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import fs from 'fs'
import { getRace, listBackups, restoreFromBackup, importFromJson, getStateFilePath } from '../persistence.js'
import type { ApiResponse, Race } from '../types.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

// GET /api/backup/export — download current state as JSON
router.get('/export', (_req: Request, res: Response) => {
  const race = getRace()
  const filename = `race_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify(race, null, 2))
})

// GET /api/backup/list — list available backup files
router.get('/list', (_req: Request, res: Response) => {
  const backups = listBackups()
  const response: ApiResponse<string[]> = { success: true, data: backups, timestamp: new Date().toISOString() }
  res.json(response)
})

// C1: Only accept filenames that look exactly like our generated backup names
const BACKUP_FILENAME_RE = /^race_state_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/

// POST /api/backup/restore/:filename — restore from a specific backup
router.post('/restore/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params
    if (!BACKUP_FILENAME_RE.test(filename)) {
      res.status(400).json({ success: false, error: 'Invalid backup filename', timestamp: new Date().toISOString() })
      return
    }
    const race = restoreFromBackup(filename)
    const response: ApiResponse<Race> = { success: true, data: race, timestamp: new Date().toISOString() }
    res.json(response)
  } catch (err) {
    res.status(400).json({
      success: false,
      error: (err as Error).message,
      timestamp: new Date().toISOString(),
    })
  }
})

// POST /api/backup/import — upload and import a JSON backup file
router.post('/import', upload.single('backup'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded', timestamp: new Date().toISOString() })
    return
  }
  try {
    const jsonString = req.file.buffer.toString('utf-8')
    const race = importFromJson(jsonString)
    const response: ApiResponse<Race> = { success: true, data: race, timestamp: new Date().toISOString() }
    res.json(response)
  } catch (err) {
    res.status(400).json({
      success: false,
      error: `Import failed: ${(err as Error).message}`,
      timestamp: new Date().toISOString(),
    })
  }
})

// GET /api/backup/raw — get path to current state file (for debugging)
router.get('/raw', (_req: Request, res: Response) => {
  const filepath = getStateFilePath()
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ success: false, error: 'No state file found', timestamp: new Date().toISOString() })
    return
  }
  res.sendFile(filepath)
})

export default router

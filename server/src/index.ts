import express from 'express'
import cors from 'cors'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadRaceState } from './persistence.js'
import { errorHandler } from './middleware/errorHandler.js'
import raceRouter from './routes/race.js'
import bikesRouter from './routes/bikes.js'
import lapsRouter from './routes/laps.js'
import ridersRouter from './routes/riders.js'
import folkloRouter from './routes/folklo.js'
import backupRouter from './routes/backup.js'
import queueRouter from './routes/queue.js'
import undoRouter from './routes/undo.js'
import exportsRouter from './routes/exports.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT ?? 3001

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/race', raceRouter)
app.use('/api/pit', bikesRouter)
app.use('/api/laps', lapsRouter)
app.use('/api/riders', ridersRouter)
app.use('/api/folklo', folkloRouter)
app.use('/api/backup', backupRouter)
app.use('/api/queue', queueRouter)
app.use('/api/undo', undoRouter)
app.use('/api/exports', exportsRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Server running', timestamp: new Date().toISOString() })
})

// ─── Static Client (Production) ───────────────────────────────────────────────

const publicDir = path.join(__dirname, '..', 'public')
app.use(express.static(publicDir))

app.get('*', (_req, res) => {
  const indexPath = path.join(publicDir, 'index.html')
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).send('Client not built. Run: npm run build --prefix client')
  })
})

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use(errorHandler)

// ─── LAN IP Detection ────────────────────────────────────────────────────────

const getLanIp = (): string => {
  const interfaces = os.networkInterfaces()
  for (const iface of Object.values(interfaces)) {
    for (const alias of iface ?? []) {
      if (alias.family === 'IPv4' && !alias.internal) return alias.address
    }
  }
  return 'localhost'
}

// ─── Startup ─────────────────────────────────────────────────────────────────

const startServer = () => {
  loadRaceState()

  app.listen(Number(PORT), '0.0.0.0', () => {
    const lan = getLanIp()
    console.log('')
    console.log('╔══════════════════════════════════════════════════╗')
    console.log('║        🚴 24H VÉLO — RACE DASHBOARD              ║')
    console.log('╠══════════════════════════════════════════════════╣')
    console.log(`║  Local  :  http://localhost:${PORT}                  ║`)
    console.log(`║  Réseau :  http://${lan}:${PORT}               ║`)
    console.log('╠══════════════════════════════════════════════════╣')
    console.log('║  Partage WiFi : accès via l\'IP réseau ci-dessus  ║')
    console.log('╚══════════════════════════════════════════════════╝')
    console.log('')
  })
}

startServer()

'use strict'

const { app, BrowserWindow, dialog, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const http = require('http')

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVER_PORT    = 3001
const SERVER_URL     = `http://127.0.0.1:${SERVER_PORT}`
const HEALTH_URL     = `${SERVER_URL}/api/health`
const POLL_INTERVAL  = 300
const POLL_TIMEOUT   = 15_000

// ─── State ────────────────────────────────────────────────────────────────────

let mainWindow    = null
let serverProcess = null
let serverReady   = false

// ─── Paths ────────────────────────────────────────────────────────────────────

function getServerEntryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server', 'dist', 'index.js')
  }
  return path.join(__dirname, '..', 'server', 'dist', 'index.js')
}

function getUserDataDir() {
  return path.join(app.getPath('userData'), 'data')
}

// ─── Loading Screen ───────────────────────────────────────────────────────────

const LOADING_HTML = `data:text/html;charset=utf-8,<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: %230f172a;
    color: %23e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    user-select: none;
    -webkit-user-select: none;
  }
  h1 { font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -0.5px; }
  p  { font-size: 0.9rem; color: %2394a3b8; margin-bottom: 2.5rem; }
  .spinner {
    width: 36px; height: 36px;
    border: 3px solid %23334155;
    border-top-color: %2360a5fa;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .status { margin-top: 1.5rem; font-size: 0.78rem; color: %23475569; }
</style>
</head>
<body>
  <h1>24h Velo</h1>
  <p>Dashboard de course</p>
  <div class="spinner"></div>
  <div class="status" id="s">Demarrage du serveur...</div>
  <script>
    let d = 0
    setInterval(() => {
      d = (d + 1) % 4
      document.getElementById('s').textContent = 'En attente' + '.'.repeat(d + 1)
    }, 350)
  </script>
</body>
</html>`

// ─── Health Poll ──────────────────────────────────────────────────────────────

function pollHealth() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + POLL_TIMEOUT
    const attempt = () => {
      if (Date.now() > deadline) {
        return reject(new Error(`Le serveur n'a pas repondu en ${POLL_TIMEOUT / 1000}s`))
      }
      const req = http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) {
          res.resume()
          resolve(true)
        } else {
          setTimeout(attempt, POLL_INTERVAL)
        }
      })
      req.on('error', () => setTimeout(attempt, POLL_INTERVAL))
      req.setTimeout(1000, () => { req.destroy(); setTimeout(attempt, POLL_INTERVAL) })
    }
    attempt()
  })
}

// ─── Server Lifecycle ─────────────────────────────────────────────────────────

function startServer() {
  const entryPath = getServerEntryPath()
  const dataDir   = getUserDataDir()

  console.log(`[electron] Starting server: ${entryPath}`)
  console.log(`[electron] DATA_DIR: ${dataDir}`)

  // utilityProcess runs inside Electron's built-in Node — supports ES modules,
  // no need to bundle a separate node binary.
  const { utilityProcess } = require('electron')
  serverProcess = utilityProcess.fork(entryPath, [], {
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT:     String(SERVER_PORT),
      NODE_ENV: 'production',
    },
    stdio: 'pipe',
  })

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`))
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))

  serverProcess.on('exit', (code) => {
    console.log(`[electron] Server exited with code ${code}`)
    if (mainWindow && !app.isQuitting) {
      dialog.showErrorBox(
        '24h Vélo — Erreur serveur',
        `Le serveur s'est arrêté de façon inattendue (code: ${code}).\nRelancez l'application.`
      )
    }
  })
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
}

// ─── Window Management ────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1400,
    height:          900,
    minWidth:        1024,
    minHeight:       700,
    title:           '24h Vélo — Dashboard',
    backgroundColor: '#0f172a',
    show:            false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          true,
    },
  })

  mainWindow.loadURL(LOADING_HTML)
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  createWindow()
  startServer()

  try {
    await pollHealth()
    serverReady = true
    console.log('[electron] Server ready — loading app')
    if (mainWindow) mainWindow.loadURL(SERVER_URL)
  } catch (err) {
    console.error('[electron] Server startup failed:', err.message)
    dialog.showErrorBox(
      '24h Vélo — Échec du démarrage',
      `Le serveur n'a pas démarré dans les temps (15 secondes).\n\nDétail: ${err.message}`
    )
    app.quit()
    return
  }

  setupAutoUpdater()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
    if (serverReady) mainWindow.loadURL(SERVER_URL)
    else mainWindow.loadURL(LOADING_HTML)
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
  stopServer()
})

// Block navigation outside localhost (security)
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(SERVER_URL)) event.preventDefault()
  })
})

// ─── Auto-Updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type:    'info',
      title:   'Mise à jour disponible',
      message: `Une nouvelle version (${info.version}) est disponible.\nVoulez-vous la télécharger ?`,
      buttons: ['Télécharger', 'Plus tard'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate()
    })
  })

  autoUpdater.on('download-progress', (p) => {
    if (mainWindow) {
      mainWindow.setProgressBar(p.percent / 100)
      mainWindow.setTitle(`Téléchargement… ${Math.round(p.percent)}%`)
    }
  })

  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) {
      mainWindow.setProgressBar(-1)
      mainWindow.setTitle('24h Vélo — Dashboard')
    }
    dialog.showMessageBox(mainWindow, {
      type:    'info',
      title:   'Mise à jour prête',
      message: "La mise à jour a été téléchargée.\nElle sera installée à la prochaine fermeture.",
      buttons: ['Redémarrer maintenant', 'Plus tard'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err.message)
  })

  // Check 5s after startup to not block initial load
  setTimeout(() => autoUpdater.checkForUpdates(), 5_000)
}

'use strict'

const { app, BrowserWindow, dialog, shell } = require('electron')
const path = require('path')
const http = require('http')
const fs   = require('fs')
const { pathToFileURL } = require('url')

// ─── File Logger ──────────────────────────────────────────────────────────────

let _logPath = null
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`
  try { process.stdout.write(line) } catch (_) {}
  try {
    if (!_logPath) {
      _logPath = path.join(app.getPath('logs'), '24h-velo-main.log')
      fs.mkdirSync(path.dirname(_logPath), { recursive: true })
    }
    fs.appendFileSync(_logPath, line)
  } catch (_) {}
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVER_PORT   = 3001
const SERVER_URL    = `http://127.0.0.1:${SERVER_PORT}`
const HEALTH_URL    = `${SERVER_URL}/api/health`
const POLL_INTERVAL = 300
const POLL_TIMEOUT  = 15_000

// ─── State ────────────────────────────────────────────────────────────────────

let mainWindow  = null
let serverReady = false

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

function getLoadingHtmlPath() {
  return path.join(app.getAppPath(), 'electron', 'loading.html')
}

// ─── Health Poll ──────────────────────────────────────────────────────────────

function pollHealth() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + POLL_TIMEOUT
    const attempt = () => {
      if (Date.now() > deadline) {
        return reject(new Error(`Le serveur n'a pas répondu en ${POLL_TIMEOUT / 1000}s`))
      }
      const req = http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) { res.resume(); resolve(true) }
        else setTimeout(attempt, POLL_INTERVAL)
      })
      req.on('error', () => setTimeout(attempt, POLL_INTERVAL))
      req.setTimeout(1000, () => { req.destroy(); setTimeout(attempt, POLL_INTERVAL) })
    }
    attempt()
  })
}

// ─── Server Startup ───────────────────────────────────────────────────────────

async function startServer() {
  const entryPath = getServerEntryPath()
  const dataDir   = getUserDataDir()

  log(`[electron] Server entry: ${entryPath}`)
  log(`[electron] DATA_DIR: ${dataDir}`)

  if (!fs.existsSync(entryPath)) {
    throw new Error(`Fichier serveur introuvable: ${entryPath}`)
  }

  // Set env vars before importing — persistence.ts reads DATA_DIR at module load
  process.env.DATA_DIR = dataDir
  process.env.PORT     = String(SERVER_PORT)
  process.env.NODE_ENV = 'production'

  // Dynamic import runs the server in the same process as Electron.
  // No separate Node binary needed — works reliably in packaged apps.
  log('[electron] Importing server module...')
  try {
    await import(pathToFileURL(entryPath).href)
    log('[electron] Server module imported')
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      log('[electron] Port already in use — assuming server is running')
    } else {
      throw err
    }
  }
}

// ─── Window Management ────────────────────────────────────────────────────────

function createWindow() {
  log('[electron] Creating BrowserWindow')
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

  const loadingPath = getLoadingHtmlPath()
  if (fs.existsSync(loadingPath)) {
    mainWindow.loadFile(loadingPath)
  } else {
    mainWindow.loadURL('about:blank')
  }

  mainWindow.once('ready-to-show', () => {
    log('[electron] Window ready — showing')
    mainWindow.show()
  })
  mainWindow.on('closed', () => { mainWindow = null })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(SERVER_URL)) {
      // Internal app URL — open in a new Electron window
      const popup = new BrowserWindow({
        width: 1280, height: 800,
        title: '24h Vélo — Vue publique',
        backgroundColor: '#0f172a',
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      })
      popup.loadURL(url)
      return { action: 'deny' }
    }
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

// Single instance lock — focus existing window instead of launching duplicate
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() }
})

// Disable hardware acceleration — required for unsigned apps on macOS 14 Sonoma
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('no-sandbox')

app.whenReady().then(async () => {
  log('[electron] app ready')

  createWindow()

  try {
    await startServer()
  } catch (err) {
    log(`[electron] FATAL: ${err.message}`)
    dialog.showErrorBox('24h Vélo — Erreur', `Impossible de démarrer le serveur:\n${err.message}`)
    app.quit()
    return
  }

  try {
    log('[electron] Polling /api/health...')
    await pollHealth()
    serverReady = true
    log('[electron] Server ready — loading app')
    if (mainWindow) mainWindow.loadURL(SERVER_URL)
  } catch (err) {
    log(`[electron] Health poll failed: ${err.message}`)
    dialog.showErrorBox(
      '24h Vélo — Démarrage échoué',
      `Le serveur n'a pas répondu dans les temps.\n\nDétail: ${err.message}`
    )
    app.quit()
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
  }
})

app.on('before-quit', () => {
  log('[electron] Quitting')
})

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(SERVER_URL) && !url.startsWith('file://') && url !== 'about:blank') {
      event.preventDefault()
    }
  })
})

// ─── Auto-Updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  if (!app.isPackaged) return

  let autoUpdater
  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch (e) {
    log(`[updater] not available: ${e.message}`)
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info', title: 'Mise à jour disponible',
      message: `Version ${info.version} disponible. Télécharger ?`,
      buttons: ['Télécharger', 'Plus tard'],
    }).then(({ response }) => { if (response === 0) autoUpdater.downloadUpdate() })
  })

  autoUpdater.on('download-progress', (p) => {
    if (mainWindow) {
      mainWindow.setProgressBar(p.percent / 100)
      mainWindow.setTitle(`Téléchargement… ${Math.round(p.percent)}%`)
    }
  })

  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) { mainWindow.setProgressBar(-1); mainWindow.setTitle('24h Vélo — Dashboard') }
    dialog.showMessageBox(mainWindow, {
      type: 'info', title: 'Mise à jour prête',
      message: "Mise à jour téléchargée. Redémarrer pour installer ?",
      buttons: ['Redémarrer maintenant', 'Plus tard'],
    }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall() })
  })

  autoUpdater.on('error', (err) => log(`[updater] ${err.message}`))
  setTimeout(() => autoUpdater.checkForUpdates(), 5_000)
}

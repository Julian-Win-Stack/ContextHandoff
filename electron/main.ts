import { app, BrowserWindow, Tray, nativeImage, ipcMain } from 'electron'
import activeWindow from 'active-win'
import { initDb, upsertNoteForTomorrow, upsertNoteForToday, getNoteForDate, getTomorrowDateStr, getTodayDateStr, getUndeliveredNoteForDate, markNoteAsDelivered } from './db'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
;(globalThis as any).__filename = fileURLToPath(import.meta.url)

process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null = null
let tray: Tray | null = null
let pendingOverlayNote: { id: number; note_text: string } | null = null

function createTray() {
  const iconPath = getIconPath()
  const icon = nativeImage.createFromPath(iconPath)
  if (process.platform === 'darwin') icon.setTemplateImage(true)

  tray = new Tray(icon.isEmpty() ? iconPath : icon)
  tray.setToolTip('Context HandOff')

  tray.on('click', () => {
    if (win && !win.isDestroyed()) {
      win.show()
      win.focus()
    } else {
      createWindow();
    }
  })

}

function getIconPath() {
  const appRoot = process.env.APP_ROOT!
  const iconName = 'tray-iconTemplate.png'

  const publicPath = path.join(appRoot, 'public', iconName)
  const distPath = path.join(appRoot, 'dist', iconName)

  if (fs.existsSync(publicPath)) return publicPath
  if (fs.existsSync(distPath)) return distPath

  throw new Error(`Tray icon not found. Tried:\n${publicPath}\n${distPath}`)
}

const MORNING_START_HOUR = 5

function getEligibleNoteForToday(): {
  id: number
  note_text: string
} | null {
  const now = new Date()
  if (now.getHours() < MORNING_START_HOUR) return null

  const today = getTodayDateStr()
  const note = getUndeliveredNoteForDate('cursor', today)
  return note ? { id: note.id, note_text: note.note_text } : null
}

function createOverlayWindow(note: { id: number; note_text: string }) {
  pendingOverlayNote = note
  const overlay = new BrowserWindow({
    width: 420,
    height: 220,
    alwaysOnTop: true,
    title: 'Context Handoff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })
  if (VITE_DEV_SERVER_URL) {
    const url = VITE_DEV_SERVER_URL + (VITE_DEV_SERVER_URL.includes('?') ? '&' : '?') + 'overlay=1'
    overlay.loadURL(url)
  } else {
    overlay.loadFile(path.join(RENDERER_DIST, 'index.html'), { query: { overlay: '1' } })
  }
  overlay.on('closed', () => {
    pendingOverlayNote = null
  })
}

function createWindow() {
  win = new BrowserWindow({
    title: 'Context Handoff',
    width: 400,
    height: 300,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
  win.on('closed', () => {
    win = null
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide()
  initDb()
  createTray()

  let previousApp = ''
  const CURSOR_APP_NAME = 'Cursor'
  setInterval(async () => {
    try {
      const active = await activeWindow()
      const currentApp = active?.owner?.name ?? ''
      if (currentApp !== previousApp) {
        if (currentApp === CURSOR_APP_NAME) {
          const note = getEligibleNoteForToday()
          if (note) {
            createOverlayWindow(note)
            markNoteAsDelivered(note.id)
          }
        }
        previousApp = currentApp
      }
    } catch (err) {
      console.error('[frontmost poll]', err)
    }
  }, 500)

  ipcMain.handle('db:upsertForTomorrow', (_, { targetApp, noteText }: { targetApp: string; noteText: string }) => {
    upsertNoteForTomorrow(targetApp, noteText)
    return { ok: true }
  })

  ipcMain.handle('db:upsertForToday', (_, { targetApp, noteText }: { targetApp: string; noteText: string }) => {
    upsertNoteForToday(targetApp, noteText)
    return { ok: true }
  })

  ipcMain.handle('db:getNoteForTomorrow', () => {
    const tomorrow = getTomorrowDateStr()
    return getNoteForDate('cursor', tomorrow)
  })

  ipcMain.handle('db:getNoteForToday', () => {
    const today = getTodayDateStr()
    return getNoteForDate('cursor', today)
  })

  ipcMain.handle('overlay:getNote', () => {
    return pendingOverlayNote
  })
})

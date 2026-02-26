import { app, BrowserWindow, Tray, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null = null
let tray: Tray | null = null

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

function createWindow() {
  win = new BrowserWindow({
    title: 'Context HandOff - Editor',
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

app.whenReady().then(createTray)

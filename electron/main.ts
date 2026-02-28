import {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  ipcMain,
  dialog,
} from 'electron';
import activeWindow from 'active-win';
import {
  initDb,
  upsertNoteForTomorrow,
  upsertNoteForToday,
  getNoteForDate,
  getTomorrowDateStr,
  getTodayDateStr,
  getUndeliveredNoteForDate,
  markNoteAsDelivered,
  getTargetApp,
  getTargetAppDisplayName,
  setTargetApp,
  getDeliverAfterMinutes,
  setDeliverAfterMinutes,
} from './db';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
(globalThis as any).__filename = fileURLToPath(import.meta.url);

process.env.APP_ROOT = path.join(__dirname, '..');
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let pendingOverlayNote: { id: number; note_text: string } | null = null;
let lastActiveAppBeforeEditorOpen: {
  bundleId: string;
  displayName: string;
} = { bundleId: '', displayName: '' };

function readPlistString(plistPath: string, key: string): string | null {
  try {
    return execSync(
      `/usr/libexec/PlistBuddy -c "Print :${key}" "${plistPath}"`,
      { encoding: 'utf8' }
    ).trim();
  } catch {
    return null;
  }
}

function createTray() {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') icon.setTemplateImage(true);

  tray = new Tray(icon.isEmpty() ? iconPath : icon);
  tray.setToolTip('Context HandOff');

  tray.on('click', async () => {
    const active = await activeWindow({
      screenRecordingPermission: false,
      accessibilityPermission: false,
    });
    const bundleId =
      active?.platform === 'macos' ? active.owner.bundleId ?? '' : '';
    lastActiveAppBeforeEditorOpen = {
      bundleId,
      displayName: active?.owner?.name ?? '',
    };
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    } else {
      createWindow();
    }
  });
}

function getIconPath() {
  const appRoot = process.env.APP_ROOT!;
  const iconName = 'tray-iconTemplate.png';

  const publicPath = path.join(appRoot, 'public', iconName);
  const distPath = path.join(appRoot, 'dist', iconName);

  if (fs.existsSync(publicPath)) return publicPath;
  if (fs.existsSync(distPath)) return distPath;

  throw new Error(`Tray icon not found. Tried:\n${publicPath}\n${distPath}`);
}

function getEligibleNoteForToday(): {
  id: number;
  note_text: string;
} | null {
  const deliverAfter = getDeliverAfterMinutes();
  if (deliverAfter === null) return null;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes < deliverAfter) return null;

  const targetApp = getTargetApp(); 
  if (!targetApp) return null;

  const today = getTodayDateStr();
  const note = getUndeliveredNoteForDate(targetApp, today);
  return note ? { id: note.id, note_text: note.note_text } : null;
}

function createOverlayWindow(note: { id: number; note_text: string }) {
  pendingOverlayNote = note;
  const overlay = new BrowserWindow({
    width: 420,
    height: 220,
    alwaysOnTop: true,
    title: 'Context Handoff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  });
  if (VITE_DEV_SERVER_URL) {
    const url =
      VITE_DEV_SERVER_URL +
      (VITE_DEV_SERVER_URL.includes('?') ? '&' : '?') +
      'overlay=1';
    overlay.loadURL(url);
  } else {
    overlay.loadFile(path.join(RENDERER_DIST, 'index.html'), {
      query: { overlay: '1' },
    });
  }
  overlay.on('closed', () => {
    pendingOverlayNote = null;
  });
}

function createWindow() {
  win = new BrowserWindow({
    title: 'Context Handoff',
    width: 550,
    height: 450,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
  win.on('closed', () => {
    win = null;
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  initDb();
  createTray();

  let previousApp = '';
  setInterval(async () => {
    try {
      const targetApp = getTargetApp();
      if (!targetApp) return;

      const active = await activeWindow({
        screenRecordingPermission: false,
        accessibilityPermission: false,
      });
      const currentApp =
        active?.platform === 'macos' ? active.owner.bundleId ?? '' : '';
      if (currentApp !== previousApp) {
        if (currentApp === targetApp) {
          const note = getEligibleNoteForToday();
          if (note) {
            createOverlayWindow(note);
            markNoteAsDelivered(note.id);
          }
        }
        previousApp = currentApp;
      }
    } catch (err) {
      console.error('[frontmost poll]', err);
    }
  }, 500);

  ipcMain.handle(
    'db:upsertForTomorrow',
    (_, { targetApp, noteText }: { targetApp: string; noteText: string }) => {
      upsertNoteForTomorrow(targetApp, noteText);
      return { ok: true };
    }
  );

  ipcMain.handle(
    'db:upsertForToday',
    (_, { targetApp, noteText }: { targetApp: string; noteText: string }) => {
      upsertNoteForToday(targetApp, noteText);
      return { ok: true };
    }
  );

  ipcMain.handle('db:getNoteForTomorrow', () => {
    const targetApp = getTargetApp();
    if (!targetApp) return null;
    const tomorrow = getTomorrowDateStr();
    return getNoteForDate(targetApp, tomorrow);
  });

  ipcMain.handle('db:getNoteForToday', () => {
    const targetApp = getTargetApp();
    if (!targetApp) return null;
    const today = getTodayDateStr();
    return getNoteForDate(targetApp, today);
  });

  ipcMain.handle('overlay:getNote', () => {
    return pendingOverlayNote;
  });

  ipcMain.handle('settings:getDeliverAfterMinutes', () => {
    return getDeliverAfterMinutes();
  });

  ipcMain.handle(
    'settings:setDeliverAfterMinutes',
    (_, minutes: number) => {
      setDeliverAfterMinutes(minutes);
      return { ok: true };
    }
  );

  ipcMain.handle('app:getLastActiveApp', () => {
    return lastActiveAppBeforeEditorOpen;
  });

  ipcMain.handle('app:getTargetApp', () => {
    return {
      bundleId: getTargetApp(),
      displayName: getTargetAppDisplayName(),
    };
  });

  ipcMain.handle(
    'app:setTargetApp',
    (
      _,
      { bundleId, displayName }: { bundleId: string; displayName: string }
    ) => {
      setTargetApp(bundleId, displayName);
      return { ok: true };
    }
  );

  ipcMain.handle('app:pickAppFromFinder', async () => {
    const result = win
      ? await dialog.showOpenDialog(win, {
          defaultPath: '/Applications',
          properties: ['openFile', 'openDirectory'],
          title: 'Select an app',
        })
      : await dialog.showOpenDialog({
          defaultPath: '/Applications',
          properties: ['openFile', 'openDirectory'],
          title: 'Select an app',
        });
    if (result.canceled || result.filePaths.length === 0) return null;
    const appPath = result.filePaths[0];
    if (!appPath.toLowerCase().endsWith('.app')) return null;
    const plistPath = path.join(appPath, 'Contents', 'Info.plist');
    if (!fs.existsSync(plistPath)) return null;
    const bundleId = readPlistString(plistPath, 'CFBundleIdentifier');
    if (!bundleId) return null;
    const displayName =
      readPlistString(plistPath, 'CFBundleDisplayName') ??
      readPlistString(plistPath, 'CFBundleName') ??
      path.basename(appPath, '.app');
    return { bundleId, displayName };
  });
});

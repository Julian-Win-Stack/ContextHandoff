import { app, BrowserWindow, ipcMain, nativeImage, Tray } from "electron";
import activeWindow from "active-win";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
let db = null;
function getTomorrowDateStr() {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getTodayDateStr() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function initDb() {
  const userData = app.getPath("userData");
  const dbPath = path.join(userData, "handoff.db");
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS handoff_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_app TEXT NOT NULL DEFAULT 'cursor',
      deliver_on_date TEXT NOT NULL,
      note_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  return db;
}
function getSetting(key) {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  const stmt = db.prepare(`SELECT value FROM app_settings WHERE key = ?`);
  const row = stmt.get(key);
  return (row == null ? void 0 : row.value) ?? null;
}
function setSetting(key, value) {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
  `);
  stmt.run(key, value);
}
function getTargetApp() {
  return getSetting("target_app");
}
function setTargetApp(appName) {
  setSetting("target_app", appName);
}
function getNoteForDate(targetApp, deliverOnDate) {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  const stmt = db.prepare(`
    SELECT * FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `);
  const row = stmt.get(targetApp, deliverOnDate);
  return row ?? null;
}
function getUndeliveredNoteForDate(targetApp, deliverOnDate) {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  const stmt = db.prepare(`
    SELECT * FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ? AND delivered_at IS NULL
  `);
  const row = stmt.get(targetApp, deliverOnDate);
  return row ?? null;
}
function markNoteAsDelivered(noteId) {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  const stmt = db.prepare(`
    UPDATE handoff_notes SET delivered_at = datetime('now') WHERE id = ?
  `);
  stmt.run(noteId);
}
function upsertNoteForTomorrow(targetApp, noteText) {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  const tomorrow = getTomorrowDateStr();
  const deleteStmt = db.prepare(`
    DELETE FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `);
  deleteStmt.run(targetApp, tomorrow);
  const insertStmt = db.prepare(`
    INSERT INTO handoff_notes (target_app, deliver_on_date, note_text)
    VALUES (?, ?, ?)
  `);
  const result = insertStmt.run(targetApp, tomorrow, noteText);
  return result.lastInsertRowid;
}
function upsertNoteForToday(targetApp, noteText) {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  const today = getTodayDateStr();
  const deleteStmt = db.prepare(`
    DELETE FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `);
  deleteStmt.run(targetApp, today);
  const insertStmt = db.prepare(`
    INSERT INTO handoff_notes (target_app, deliver_on_date, note_text)
    VALUES (?, ?, ?)
  `);
  const result = insertStmt.run(targetApp, today, noteText);
  return result.lastInsertRowid;
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
globalThis.__filename = fileURLToPath(import.meta.url);
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win = null;
let tray = null;
let pendingOverlayNote = null;
let lastActiveAppBeforeEditorOpen = "";
function createTray() {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon.isEmpty() ? iconPath : icon);
  tray.setToolTip("Context HandOff");
  tray.on("click", async () => {
    var _a;
    const active = await activeWindow();
    lastActiveAppBeforeEditorOpen = ((_a = active == null ? void 0 : active.owner) == null ? void 0 : _a.name) ?? "";
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    } else {
      createWindow();
    }
  });
}
function getIconPath() {
  const appRoot = process.env.APP_ROOT;
  const iconName = "tray-iconTemplate.png";
  const publicPath = path.join(appRoot, "public", iconName);
  const distPath = path.join(appRoot, "dist", iconName);
  if (fs.existsSync(publicPath)) return publicPath;
  if (fs.existsSync(distPath)) return distPath;
  throw new Error(`Tray icon not found. Tried:
${publicPath}
${distPath}`);
}
const MORNING_START_HOUR = 5;
function getEligibleNoteForToday() {
  const now = /* @__PURE__ */ new Date();
  if (now.getHours() < MORNING_START_HOUR) return null;
  const targetApp = getTargetApp();
  if (!targetApp) return null;
  const today = getTodayDateStr();
  const note = getUndeliveredNoteForDate(targetApp, today);
  return note ? { id: note.id, note_text: note.note_text } : null;
}
function createOverlayWindow(note) {
  pendingOverlayNote = note;
  const overlay = new BrowserWindow({
    width: 420,
    height: 220,
    alwaysOnTop: true,
    title: "Context Handoff",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  if (VITE_DEV_SERVER_URL) {
    const url = VITE_DEV_SERVER_URL + (VITE_DEV_SERVER_URL.includes("?") ? "&" : "?") + "overlay=1";
    overlay.loadURL(url);
  } else {
    overlay.loadFile(path.join(RENDERER_DIST, "index.html"), {
      query: { overlay: "1" }
    });
  }
  overlay.on("closed", () => {
    pendingOverlayNote = null;
  });
}
function createWindow() {
  win = new BrowserWindow({
    title: "Context Handoff",
    width: 550,
    height: 450,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
  win.on("closed", () => {
    win = null;
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock.hide();
  initDb();
  createTray();
  let previousApp = "";
  setInterval(async () => {
    var _a;
    try {
      const targetApp = getTargetApp();
      if (!targetApp) return;
      const active = await activeWindow();
      const currentApp = ((_a = active == null ? void 0 : active.owner) == null ? void 0 : _a.name) ?? "";
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
      console.error("[frontmost poll]", err);
    }
  }, 500);
  ipcMain.handle(
    "db:upsertForTomorrow",
    (_, { targetApp, noteText }) => {
      upsertNoteForTomorrow(targetApp, noteText);
      return { ok: true };
    }
  );
  ipcMain.handle(
    "db:upsertForToday",
    (_, { targetApp, noteText }) => {
      upsertNoteForToday(targetApp, noteText);
      return { ok: true };
    }
  );
  ipcMain.handle("db:getNoteForTomorrow", () => {
    const targetApp = getTargetApp();
    if (!targetApp) return null;
    const tomorrow = getTomorrowDateStr();
    return getNoteForDate(targetApp, tomorrow);
  });
  ipcMain.handle("db:getNoteForToday", () => {
    const targetApp = getTargetApp();
    if (!targetApp) return null;
    const today = getTodayDateStr();
    return getNoteForDate(targetApp, today);
  });
  ipcMain.handle("overlay:getNote", () => {
    return pendingOverlayNote;
  });
  ipcMain.handle("app:getLastActiveApp", () => {
    return lastActiveAppBeforeEditorOpen;
  });
  ipcMain.handle("app:getTargetApp", () => {
    return getTargetApp();
  });
  ipcMain.handle(
    "app:setTargetApp",
    (_, appName) => {
      setTargetApp(appName);
      return { ok: true };
    }
  );
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};

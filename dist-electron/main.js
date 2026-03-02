import { app, BrowserWindow, powerMonitor, ipcMain, dialog, nativeImage, Tray } from "electron";
import activeWindow from "active-win";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { execSync } from "node:child_process";
let db = null;
const DAY_START_TARGET_APP = "day_start";
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
function getTargetAppDisplayName() {
  return getSetting("target_app_display_name");
}
function setTargetApp(bundleId, displayName) {
  setSetting("target_app", bundleId);
  setSetting("target_app_display_name", displayName);
}
const DELIVER_AFTER_MINUTES_KEY = "deliver_after_minutes";
function getDeliverAfterMinutes() {
  const val = getSetting(DELIVER_AFTER_MINUTES_KEY);
  if (val === null) return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}
function setDeliverAfterMinutes(minutes) {
  setSetting(DELIVER_AFTER_MINUTES_KEY, String(minutes));
}
const LAUNCH_AT_LOGIN_KEY = "launch_at_login";
function getLaunchAtLogin() {
  const val = getSetting(LAUNCH_AT_LOGIN_KEY);
  return val === "true";
}
function setLaunchAtLogin(enabled) {
  setSetting(LAUNCH_AT_LOGIN_KEY, enabled ? "true" : "false");
}
function getDeliveryMode() {
  const val = getSetting("delivery_mode");
  return val === "on_day_start" ? "on_day_start" : "on_app";
}
function setDeliveryMode(mode) {
  setSetting("delivery_mode", mode);
}
function getLastDayStartDeliverDate() {
  return getSetting("last_day_start_deliver_date");
}
function setLastDayStartDeliverDate(dateStr) {
  setSetting("last_day_start_deliver_date", dateStr);
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
const EDITOR_HEIGHT = 450;
const EDITOR_WIDTH_EXPANDED = 650;
const EDITOR_WIDTH_COLLAPSED = 367;
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win = null;
let tray = null;
let pendingOverlayNote = null;
let lastActiveAppBeforeEditorOpen = { bundleId: "", displayName: "" };
const POLL_INTERVAL_MS = 500;
const WATCHDOG_INTERVAL_MS = 5e3;
const WATCHDOG_STALE_THRESHOLD_MS = 5e3;
let lastPollTickAt = 0;
let pollerIntervalId = null;
function readPlistString(plistPath, key) {
  try {
    return execSync(
      `/usr/libexec/PlistBuddy -c "Print :${key}" "${plistPath}"`,
      { encoding: "utf8" }
    ).trim();
  } catch {
    return null;
  }
}
function createTray() {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon.isEmpty() ? iconPath : icon);
  tray.setToolTip("Context HandOff");
  tray.on("click", async () => {
    var _a;
    const active = await activeWindow({
      screenRecordingPermission: false,
      accessibilityPermission: false
    });
    const bundleId = (active == null ? void 0 : active.platform) === "macos" ? active.owner.bundleId ?? "" : "";
    lastActiveAppBeforeEditorOpen = {
      bundleId,
      displayName: ((_a = active == null ? void 0 : active.owner) == null ? void 0 : _a.name) ?? ""
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
  const appRoot = process.env.APP_ROOT;
  const iconName = "tray-iconTemplate.png";
  const publicPath = path.join(appRoot, "public", iconName);
  const distPath = path.join(appRoot, "dist", iconName);
  const resourcesPath = path.join(process.resourcesPath, iconName);
  if (fs.existsSync(publicPath)) return publicPath;
  if (fs.existsSync(distPath)) return distPath;
  if (fs.existsSync(resourcesPath)) return resourcesPath;
  throw new Error(
    `Tray icon not found. Tried:
${publicPath}
${distPath}
${resourcesPath}`
  );
}
function maybeDeliverNote(targetApp) {
  const deliverAfter = getDeliverAfterMinutes();
  if (deliverAfter === null) return false;
  const now = /* @__PURE__ */ new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes < deliverAfter) return false;
  const today = getTodayDateStr();
  const note = getUndeliveredNoteForDate(targetApp, today);
  if (!note) return false;
  createOverlayWindow(note);
  markNoteAsDelivered(note.id);
  return true;
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
    width: EDITOR_WIDTH_COLLAPSED,
    height: EDITOR_HEIGHT,
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
function startAppActivePoller() {
  let previousApp = "";
  return setInterval(async () => {
    lastPollTickAt = Date.now();
    try {
      if (getDeliveryMode() !== "on_app") return;
      const targetApp = getTargetApp();
      if (!targetApp) return;
      const active = await activeWindow({
        screenRecordingPermission: false,
        accessibilityPermission: false
      });
      const currentApp = (active == null ? void 0 : active.platform) === "macos" ? active.owner.bundleId ?? "" : "";
      if (currentApp !== previousApp) {
        if (currentApp === targetApp) {
          maybeDeliverNote(targetApp);
        }
        previousApp = currentApp;
      }
    } catch (err) {
      console.error("[frontmost poll]", err);
    }
  }, POLL_INTERVAL_MS);
}
function startWatchdog() {
  setInterval(() => {
    if (Date.now() - lastPollTickAt > WATCHDOG_STALE_THRESHOLD_MS) {
      console.warn("[watchdog] poller stalled, restarting");
      if (pollerIntervalId !== null) {
        clearInterval(pollerIntervalId);
      }
      pollerIntervalId = startAppActivePoller();
    }
  }, WATCHDOG_INTERVAL_MS);
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
  if (process.platform === "darwin") {
    app.setLoginItemSettings({ openAtLogin: getLaunchAtLogin() });
  }
  lastPollTickAt = Date.now();
  pollerIntervalId = startAppActivePoller();
  startWatchdog();
  powerMonitor.on("unlock-screen", () => {
    try {
      if (getDeliveryMode() !== "on_day_start") return;
      const today = getTodayDateStr();
      if (getLastDayStartDeliverDate() === today) return;
      if (maybeDeliverNote(DAY_START_TARGET_APP)) {
        setLastDayStartDeliverDate(today);
      }
    } catch (err) {
      console.error("[unlock-screen]", err);
    }
  });
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
    const targetApp = getDeliveryMode() === "on_day_start" ? DAY_START_TARGET_APP : getTargetApp();
    if (!targetApp) return null;
    const tomorrow = getTomorrowDateStr();
    return getNoteForDate(targetApp, tomorrow);
  });
  ipcMain.handle("db:getNoteForToday", () => {
    const targetApp = getDeliveryMode() === "on_day_start" ? DAY_START_TARGET_APP : getTargetApp();
    if (!targetApp) return null;
    const today = getTodayDateStr();
    return getNoteForDate(targetApp, today);
  });
  ipcMain.handle("overlay:getNote", () => {
    return pendingOverlayNote;
  });
  ipcMain.handle("settings:getDeliverAfterMinutes", () => {
    return getDeliverAfterMinutes();
  });
  ipcMain.handle(
    "settings:setDeliverAfterMinutes",
    (_, minutes) => {
      setDeliverAfterMinutes(minutes);
      return { ok: true };
    }
  );
  ipcMain.handle("settings:getLaunchAtLogin", () => {
    return getLaunchAtLogin();
  });
  ipcMain.handle(
    "settings:setLaunchAtLogin",
    (_, enabled) => {
      setLaunchAtLogin(enabled);
      if (process.platform === "darwin") {
        app.setLoginItemSettings({ openAtLogin: enabled });
      }
      return { ok: true };
    }
  );
  ipcMain.handle("settings:getDeliveryMode", () => {
    return getDeliveryMode();
  });
  ipcMain.handle(
    "settings:setDeliveryMode",
    (_, mode) => {
      setDeliveryMode(mode);
      return { ok: true };
    }
  );
  ipcMain.handle("app:getLastActiveApp", () => {
    return lastActiveAppBeforeEditorOpen;
  });
  ipcMain.handle("app:getTargetApp", () => {
    return {
      bundleId: getTargetApp(),
      displayName: getTargetAppDisplayName()
    };
  });
  ipcMain.handle(
    "app:setTargetApp",
    (_, { bundleId, displayName }) => {
      setTargetApp(bundleId, displayName);
      return { ok: true };
    }
  );
  ipcMain.handle("app:resizeEditor", (_, showAdvanced) => {
    if (win && !win.isDestroyed()) {
      const width = showAdvanced ? EDITOR_WIDTH_EXPANDED : EDITOR_WIDTH_COLLAPSED;
      win.setSize(width, EDITOR_HEIGHT);
    }
    return { ok: true };
  });
  ipcMain.handle("app:pickAppFromFinder", async () => {
    const result = win ? await dialog.showOpenDialog(win, {
      defaultPath: "/Applications",
      properties: ["openFile", "openDirectory"],
      title: "Select an app"
    }) : await dialog.showOpenDialog({
      defaultPath: "/Applications",
      properties: ["openFile", "openDirectory"],
      title: "Select an app"
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const appPath = result.filePaths[0];
    if (!appPath.toLowerCase().endsWith(".app")) return null;
    const plistPath = path.join(appPath, "Contents", "Info.plist");
    if (!fs.existsSync(plistPath)) return null;
    const bundleId = readPlistString(plistPath, "CFBundleIdentifier");
    if (!bundleId) return null;
    const displayName = readPlistString(plistPath, "CFBundleDisplayName") ?? readPlistString(plistPath, "CFBundleName") ?? path.basename(appPath, ".app");
    return { bundleId, displayName };
  });
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};

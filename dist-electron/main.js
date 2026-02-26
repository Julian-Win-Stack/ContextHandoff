import { app, BrowserWindow, ipcMain, nativeImage, Tray } from "electron";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
let db = null;
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
  return db;
}
function insertNote(targetApp, deliverOnDate, noteText) {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  const stmt = db.prepare(`
    INSERT INTO handoff_notes (target_app, deliver_on_date, note_text)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(targetApp, deliverOnDate, noteText);
  return result.lastInsertRowid;
}
function getNotes() {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  const stmt = db.prepare("SELECT * FROM handoff_notes");
  return stmt.all();
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
function createTray() {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon.isEmpty() ? iconPath : icon);
  tray.setToolTip("Context HandOff");
  tray.on("click", () => {
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
function createWindow() {
  win = new BrowserWindow({
    title: "Context HandOff - Editor",
    width: 400,
    height: 300,
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
  initDb();
  const deliverOnDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const id = insertNote("cursor", deliverOnDate, "Test note from Milestone 2");
  const notes = getNotes();
  console.log("[db] Insert test: id =", id);
  console.log("[db] Read test: notes =", notes);
  createTray();
  ipcMain.handle("db:insert", (_, { targetApp, deliverOnDate: deliverOnDate2, noteText }) => {
    return insertNote(targetApp, deliverOnDate2, noteText);
  });
  ipcMain.handle("db:getAll", () => {
    return getNotes();
  });
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};

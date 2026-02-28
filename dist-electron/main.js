import { app as d, BrowserWindow as y, powerMonitor as j, ipcMain as a, dialog as S, nativeImage as k, Tray as W } from "electron";
import I from "active-win";
import H from "better-sqlite3";
import i from "node:path";
import { fileURLToPath as b } from "node:url";
import w from "node:fs";
import { execSync as V } from "node:child_process";
let o = null;
const E = "day_start";
function P() {
  const e = /* @__PURE__ */ new Date();
  return e.setDate(e.getDate() + 1), `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
}
function m() {
  const e = /* @__PURE__ */ new Date();
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
}
function $() {
  const e = d.getPath("userData"), t = i.join(e, "handoff.db");
  return o = new H(t), o.exec(`
    CREATE TABLE IF NOT EXISTS handoff_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_app TEXT NOT NULL DEFAULT 'cursor',
      deliver_on_date TEXT NOT NULL,
      note_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at TEXT
    )
  `), o.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `), o;
}
function f(e) {
  if (!o) throw new Error("Database not initialized. Call initDb() first.");
  const n = o.prepare("SELECT value FROM app_settings WHERE key = ?").get(e);
  return (n == null ? void 0 : n.value) ?? null;
}
function c(e, t) {
  if (!o) throw new Error("Database not initialized. Call initDb() first.");
  o.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
  `).run(e, t);
}
function g() {
  return f("target_app");
}
function B() {
  return f("target_app_display_name");
}
function X(e, t) {
  c("target_app", e), c("target_app_display_name", t);
}
const O = "deliver_after_minutes";
function F() {
  const e = f(O);
  if (e === null) return null;
  const t = parseInt(e, 10);
  return isNaN(t) ? null : t;
}
function Y(e) {
  c(O, String(e));
}
const M = "launch_at_login";
function N() {
  return f(M) === "true";
}
function z(e) {
  c(M, e ? "true" : "false");
}
function _() {
  return f("delivery_mode") === "on_day_start" ? "on_day_start" : "on_app";
}
function K(e) {
  c("delivery_mode", e);
}
function G() {
  return f("last_day_start_deliver_date");
}
function q(e) {
  c("last_day_start_deliver_date", e);
}
function R(e, t) {
  if (!o) throw new Error("Database not initialized. Call initDb() first.");
  return o.prepare(`
    SELECT * FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `).get(e, t) ?? null;
}
function J(e, t) {
  if (!o) throw new Error("Database not initialized. Call initDb() first.");
  return o.prepare(`
    SELECT * FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ? AND delivered_at IS NULL
  `).get(e, t) ?? null;
}
function Q(e) {
  if (!o) throw new Error("Database not initialized. Call initDb() first.");
  o.prepare(`
    UPDATE handoff_notes SET delivered_at = datetime('now') WHERE id = ?
  `).run(e);
}
function Z(e, t) {
  if (!o) throw new Error("Database not initialized. Call initDb() first.");
  const n = P();
  return o.prepare(`
    DELETE FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `).run(e, n), o.prepare(`
    INSERT INTO handoff_notes (target_app, deliver_on_date, note_text)
    VALUES (?, ?, ?)
  `).run(e, n, t).lastInsertRowid;
}
function tt(e, t) {
  if (!o) throw new Error("Database not initialized. Call initDb() first.");
  const n = m();
  return o.prepare(`
    DELETE FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `).run(e, n), o.prepare(`
    INSERT INTO handoff_notes (target_app, deliver_on_date, note_text)
    VALUES (?, ?, ?)
  `).run(e, n, t).lastInsertRowid;
}
const A = i.dirname(b(import.meta.url));
globalThis.__filename = b(import.meta.url);
process.env.APP_ROOT = i.join(A, "..");
const u = process.env.VITE_DEV_SERVER_URL, pt = i.join(process.env.APP_ROOT, "dist-electron"), v = i.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = u ? i.join(process.env.APP_ROOT, "public") : v;
let s = null, T = null, D = null, C = { bundleId: "", displayName: "" };
function h(e, t) {
  try {
    return V(
      `/usr/libexec/PlistBuddy -c "Print :${t}" "${e}"`,
      { encoding: "utf8" }
    ).trim();
  } catch {
    return null;
  }
}
function et() {
  const e = U(), t = k.createFromPath(e);
  process.platform === "darwin" && t.setTemplateImage(!0), T = new W(t.isEmpty() ? e : t), T.setToolTip("Context HandOff"), T.on("click", async () => {
    var l;
    const n = await I({
      screenRecordingPermission: !1,
      accessibilityPermission: !1
    });
    C = {
      bundleId: (n == null ? void 0 : n.platform) === "macos" ? n.owner.bundleId ?? "" : "",
      displayName: ((l = n == null ? void 0 : n.owner) == null ? void 0 : l.name) ?? ""
    }, s && !s.isDestroyed() ? (s.show(), s.focus()) : x();
  });
}
function U() {
  const e = process.env.APP_ROOT, t = "tray-iconTemplate.png", n = i.join(e, "public", t), r = i.join(e, "dist", t);
  if (w.existsSync(n)) return n;
  if (w.existsSync(r)) return r;
  throw new Error(`Tray icon not found. Tried:
${n}
${r}`);
}
function L(e) {
  const t = F();
  if (t === null) return !1;
  const n = /* @__PURE__ */ new Date();
  if (n.getHours() * 60 + n.getMinutes() < t) return !1;
  const l = m(), p = J(e, l);
  return p ? (nt(p), Q(p.id), !0) : !1;
}
function nt(e) {
  D = e;
  const t = new y({
    width: 420,
    height: 220,
    alwaysOnTop: !0,
    title: "Context Handoff",
    webPreferences: {
      preload: i.join(A, "preload.mjs")
    }
  });
  if (u) {
    const n = u + (u.includes("?") ? "&" : "?") + "overlay=1";
    t.loadURL(n);
  } else
    t.loadFile(i.join(v, "index.html"), {
      query: { overlay: "1" }
    });
  t.on("closed", () => {
    D = null;
  });
}
function x() {
  s = new y({
    title: "Context Handoff",
    width: 550,
    height: 450,
    icon: U(),
    webPreferences: {
      preload: i.join(A, "preload.mjs")
    }
  }), u ? s.loadURL(u) : s.loadFile(i.join(v, "index.html")), s.on("closed", () => {
    s = null;
  });
}
d.on("window-all-closed", () => {
  process.platform !== "darwin" && (d.quit(), s = null);
});
d.on("activate", () => {
  y.getAllWindows().length === 0 && x();
});
d.whenReady().then(() => {
  process.platform === "darwin" && d.dock.hide(), $(), et(), process.platform === "darwin" && d.setLoginItemSettings({ openAtLogin: N() });
  let e = "";
  setInterval(async () => {
    try {
      if (_() !== "on_app") return;
      const t = g();
      if (!t) return;
      const n = await I({
        screenRecordingPermission: !1,
        accessibilityPermission: !1
      }), r = (n == null ? void 0 : n.platform) === "macos" ? n.owner.bundleId ?? "" : "";
      r !== e && (r === t && L(t), e = r);
    } catch (t) {
      console.error("[frontmost poll]", t);
    }
  }, 500), j.on("unlock-screen", () => {
    if (_() !== "on_day_start") return;
    const t = m();
    G() !== t && L(E) && q(t);
  }), a.handle(
    "db:upsertForTomorrow",
    (t, { targetApp: n, noteText: r }) => (Z(n, r), { ok: !0 })
  ), a.handle(
    "db:upsertForToday",
    (t, { targetApp: n, noteText: r }) => (tt(n, r), { ok: !0 })
  ), a.handle("db:getNoteForTomorrow", () => {
    const t = _() === "on_day_start" ? E : g();
    if (!t) return null;
    const n = P();
    return R(t, n);
  }), a.handle("db:getNoteForToday", () => {
    const t = _() === "on_day_start" ? E : g();
    if (!t) return null;
    const n = m();
    return R(t, n);
  }), a.handle("overlay:getNote", () => D), a.handle("settings:getDeliverAfterMinutes", () => F()), a.handle(
    "settings:setDeliverAfterMinutes",
    (t, n) => (Y(n), { ok: !0 })
  ), a.handle("settings:getLaunchAtLogin", () => N()), a.handle(
    "settings:setLaunchAtLogin",
    (t, n) => (z(n), process.platform === "darwin" && d.setLoginItemSettings({ openAtLogin: n }), { ok: !0 })
  ), a.handle("settings:getDeliveryMode", () => _()), a.handle(
    "settings:setDeliveryMode",
    (t, n) => (K(n), { ok: !0 })
  ), a.handle("app:getLastActiveApp", () => C), a.handle("app:getTargetApp", () => ({
    bundleId: g(),
    displayName: B()
  })), a.handle(
    "app:setTargetApp",
    (t, { bundleId: n, displayName: r }) => (X(n, r), { ok: !0 })
  ), a.handle("app:pickAppFromFinder", async () => {
    const t = s ? await S.showOpenDialog(s, {
      defaultPath: "/Applications",
      properties: ["openFile", "openDirectory"],
      title: "Select an app"
    }) : await S.showOpenDialog({
      defaultPath: "/Applications",
      properties: ["openFile", "openDirectory"],
      title: "Select an app"
    });
    if (t.canceled || t.filePaths.length === 0) return null;
    const n = t.filePaths[0];
    if (!n.toLowerCase().endsWith(".app")) return null;
    const r = i.join(n, "Contents", "Info.plist");
    if (!w.existsSync(r)) return null;
    const l = h(r, "CFBundleIdentifier");
    if (!l) return null;
    const p = h(r, "CFBundleDisplayName") ?? h(r, "CFBundleName") ?? i.basename(n, ".app");
    return { bundleId: l, displayName: p };
  });
});
export {
  pt as MAIN_DIST,
  v as RENDERER_DIST,
  u as VITE_DEV_SERVER_URL
};

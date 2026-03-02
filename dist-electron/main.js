import { app as c, BrowserWindow as y, powerMonitor as $, ipcMain as a, dialog as R, nativeImage as X, Tray as z } from "electron";
import P from "active-win";
import B from "better-sqlite3";
import s from "node:path";
import { fileURLToPath as O } from "node:url";
import T from "node:fs";
import { execSync as Y } from "node:child_process";
let r = null;
const D = "day_start";
function b() {
  const t = /* @__PURE__ */ new Date();
  return t.setDate(t.getDate() + 1), `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
function m() {
  const t = /* @__PURE__ */ new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
function G() {
  const t = c.getPath("userData"), e = s.join(t, "handoff.db");
  return r = new B(e), r.exec(`
    CREATE TABLE IF NOT EXISTS handoff_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_app TEXT NOT NULL DEFAULT 'cursor',
      deliver_on_date TEXT NOT NULL,
      note_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at TEXT
    )
  `), r.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `), r;
}
function u(t) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  const n = r.prepare("SELECT value FROM app_settings WHERE key = ?").get(t);
  return (n == null ? void 0 : n.value) ?? null;
}
function p(t, e) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  r.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
  `).run(t, e);
}
function E() {
  return u("target_app");
}
function K() {
  return u("target_app_display_name");
}
function q(t, e) {
  p("target_app", t), p("target_app_display_name", e);
}
const F = "deliver_after_minutes";
function M() {
  const t = u(F);
  if (t === null) return null;
  const e = parseInt(t, 10);
  return isNaN(e) ? null : e;
}
function J(t) {
  p(F, String(t));
}
const C = "launch_at_login";
function I() {
  return u(C) === "true";
}
function Q(t) {
  p(C, t ? "true" : "false");
}
function _() {
  return u("delivery_mode") === "on_day_start" ? "on_day_start" : "on_app";
}
function Z(t) {
  p("delivery_mode", t);
}
function tt() {
  return u("last_day_start_deliver_date");
}
function et(t) {
  p("last_day_start_deliver_date", t);
}
function N(t, e) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  return r.prepare(`
    SELECT * FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `).get(t, e) ?? null;
}
function nt(t, e) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  return r.prepare(`
    SELECT * FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ? AND delivered_at IS NULL
  `).get(t, e) ?? null;
}
function rt(t) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  r.prepare(`
    UPDATE handoff_notes SET delivered_at = datetime('now') WHERE id = ?
  `).run(t);
}
function ot(t, e) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  const n = b();
  return r.prepare(`
    DELETE FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `).run(t, n), r.prepare(`
    INSERT INTO handoff_notes (target_app, deliver_on_date, note_text)
    VALUES (?, ?, ?)
  `).run(t, n, e).lastInsertRowid;
}
function at(t, e) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  const n = m();
  return r.prepare(`
    DELETE FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `).run(t, n), r.prepare(`
    INSERT INTO handoff_notes (target_app, deliver_on_date, note_text)
    VALUES (?, ?, ?)
  `).run(t, n, e).lastInsertRowid;
}
const S = s.dirname(O(import.meta.url));
globalThis.__filename = O(import.meta.url);
const U = 450, it = 650, H = 367;
process.env.APP_ROOT = s.join(S, "..");
const d = process.env.VITE_DEV_SERVER_URL, ht = s.join(process.env.APP_ROOT, "dist-electron"), v = s.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = d ? s.join(process.env.APP_ROOT, "public") : v;
let i = null, h = null, A = null, k = { bundleId: "", displayName: "" };
const st = 500, lt = 5e3, ct = 5e3;
let L = 0, g = null;
function w(t, e) {
  try {
    return Y(
      `/usr/libexec/PlistBuddy -c "Print :${e}" "${t}"`,
      { encoding: "utf8" }
    ).trim();
  } catch {
    return null;
  }
}
function dt() {
  const t = x(), e = X.createFromPath(t);
  process.platform === "darwin" && e.setTemplateImage(!0), h = new z(e.isEmpty() ? t : e), h.setToolTip("Context HandOff"), h.on("click", async () => {
    var l;
    const n = await P({
      screenRecordingPermission: !1,
      accessibilityPermission: !1
    });
    k = {
      bundleId: (n == null ? void 0 : n.platform) === "macos" ? n.owner.bundleId ?? "" : "",
      displayName: ((l = n == null ? void 0 : n.owner) == null ? void 0 : l.name) ?? ""
    }, i && !i.isDestroyed() ? (i.show(), i.focus()) : j();
  });
}
function x() {
  const t = process.env.APP_ROOT, e = "tray-iconTemplate.png", n = s.join(t, "public", e), o = s.join(t, "dist", e), l = s.join(process.resourcesPath, e);
  if (T.existsSync(n)) return n;
  if (T.existsSync(o)) return o;
  if (T.existsSync(l)) return l;
  throw new Error(
    `Tray icon not found. Tried:
${n}
${o}
${l}`
  );
}
function W(t) {
  const e = M();
  if (e === null) return !1;
  const n = /* @__PURE__ */ new Date();
  if (n.getHours() * 60 + n.getMinutes() < e) return !1;
  const l = m(), f = nt(t, l);
  return f ? (pt(f), rt(f.id), !0) : !1;
}
function pt(t) {
  A = t;
  const e = new y({
    width: 420,
    height: 220,
    alwaysOnTop: !0,
    title: "Context Handoff",
    webPreferences: {
      preload: s.join(S, "preload.mjs")
    }
  });
  if (d) {
    const n = d + (d.includes("?") ? "&" : "?") + "overlay=1";
    e.loadURL(n);
  } else
    e.loadFile(s.join(v, "index.html"), {
      query: { overlay: "1" }
    });
  e.on("closed", () => {
    A = null;
  });
}
function j() {
  i = new y({
    title: "Context Handoff",
    width: H,
    height: U,
    icon: x(),
    webPreferences: {
      preload: s.join(S, "preload.mjs")
    }
  }), d ? i.loadURL(d) : i.loadFile(s.join(v, "index.html")), i.on("closed", () => {
    i = null;
  });
}
function V() {
  let t = "";
  return setInterval(async () => {
    L = Date.now();
    try {
      if (_() !== "on_app") return;
      const e = E();
      if (!e) return;
      const n = await P({
        screenRecordingPermission: !1,
        accessibilityPermission: !1
      }), o = (n == null ? void 0 : n.platform) === "macos" ? n.owner.bundleId ?? "" : "";
      o !== t && (o === e && W(e), t = o);
    } catch (e) {
      console.error("[frontmost poll]", e);
    }
  }, st);
}
function ut() {
  setInterval(() => {
    Date.now() - L > ct && (console.warn("[watchdog] poller stalled, restarting"), g !== null && clearInterval(g), g = V());
  }, lt);
}
c.on("window-all-closed", () => {
  process.platform !== "darwin" && (c.quit(), i = null);
});
c.on("activate", () => {
  y.getAllWindows().length === 0 && j();
});
c.whenReady().then(() => {
  process.platform === "darwin" && c.dock.hide(), G(), dt(), process.platform === "darwin" && c.setLoginItemSettings({ openAtLogin: I() }), L = Date.now(), g = V(), ut(), $.on("unlock-screen", () => {
    try {
      if (_() !== "on_day_start") return;
      const t = m();
      if (tt() === t) return;
      W(D) && et(t);
    } catch (t) {
      console.error("[unlock-screen]", t);
    }
  }), a.handle(
    "db:upsertForTomorrow",
    (t, { targetApp: e, noteText: n }) => (ot(e, n), { ok: !0 })
  ), a.handle(
    "db:upsertForToday",
    (t, { targetApp: e, noteText: n }) => (at(e, n), { ok: !0 })
  ), a.handle("db:getNoteForTomorrow", () => {
    const t = _() === "on_day_start" ? D : E();
    if (!t) return null;
    const e = b();
    return N(t, e);
  }), a.handle("db:getNoteForToday", () => {
    const t = _() === "on_day_start" ? D : E();
    if (!t) return null;
    const e = m();
    return N(t, e);
  }), a.handle("overlay:getNote", () => A), a.handle("settings:getDeliverAfterMinutes", () => M()), a.handle(
    "settings:setDeliverAfterMinutes",
    (t, e) => (J(e), { ok: !0 })
  ), a.handle("settings:getLaunchAtLogin", () => I()), a.handle(
    "settings:setLaunchAtLogin",
    (t, e) => (Q(e), process.platform === "darwin" && c.setLoginItemSettings({ openAtLogin: e }), { ok: !0 })
  ), a.handle("settings:getDeliveryMode", () => _()), a.handle(
    "settings:setDeliveryMode",
    (t, e) => (Z(e), { ok: !0 })
  ), a.handle("app:getLastActiveApp", () => k), a.handle("app:getTargetApp", () => ({
    bundleId: E(),
    displayName: K()
  })), a.handle(
    "app:setTargetApp",
    (t, { bundleId: e, displayName: n }) => (q(e, n), { ok: !0 })
  ), a.handle("app:resizeEditor", (t, e) => {
    if (i && !i.isDestroyed()) {
      const n = e ? it : H;
      i.setSize(n, U);
    }
    return { ok: !0 };
  }), a.handle("app:pickAppFromFinder", async () => {
    const t = i ? await R.showOpenDialog(i, {
      defaultPath: "/Applications",
      properties: ["openFile", "openDirectory"],
      title: "Select an app"
    }) : await R.showOpenDialog({
      defaultPath: "/Applications",
      properties: ["openFile", "openDirectory"],
      title: "Select an app"
    });
    if (t.canceled || t.filePaths.length === 0) return null;
    const e = t.filePaths[0];
    if (!e.toLowerCase().endsWith(".app")) return null;
    const n = s.join(e, "Contents", "Info.plist");
    if (!T.existsSync(n)) return null;
    const o = w(n, "CFBundleIdentifier");
    if (!o) return null;
    const l = w(n, "CFBundleDisplayName") ?? w(n, "CFBundleName") ?? s.basename(e, ".app");
    return { bundleId: o, displayName: l };
  });
});
export {
  ht as MAIN_DIST,
  v as RENDERER_DIST,
  d as VITE_DEV_SERVER_URL
};

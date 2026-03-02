import { app as d, BrowserWindow as I, powerMonitor as Y, ipcMain as i, dialog as O, nativeImage as G, Tray as K } from "electron";
import N from "active-win";
import q from "better-sqlite3";
import l from "node:path";
import { fileURLToPath as H } from "node:url";
import h from "node:fs";
import { execSync as J } from "node:child_process";
let r = null;
const A = "day_start";
function k() {
  const t = /* @__PURE__ */ new Date();
  return t.setDate(t.getDate() + 1), `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
function y() {
  const t = /* @__PURE__ */ new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
function Q() {
  const t = d.getPath("userData"), e = l.join(t, "handoff.db");
  return r = new q(e), r.exec(`
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
function m(t) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  const n = r.prepare("SELECT value FROM app_settings WHERE key = ?").get(t);
  return (n == null ? void 0 : n.value) ?? null;
}
function T(t, e) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  r.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
  `).run(t, e);
}
function D() {
  return m("target_app");
}
function Z() {
  return m("target_app_display_name");
}
function tt(t, e) {
  T("target_app", t), T("target_app_display_name", e);
}
const x = "deliver_after_minutes";
function W() {
  const t = m(x);
  if (t === null) return null;
  const e = parseInt(t, 10);
  return isNaN(e) ? null : e;
}
function et(t) {
  T(x, String(t));
}
const j = "launch_at_login";
function F() {
  return m(j) === "true";
}
function nt(t) {
  T(j, t ? "true" : "false");
}
function g() {
  return m("delivery_mode") === "on_day_start" ? "on_day_start" : "on_app";
}
function rt(t) {
  T("delivery_mode", t);
}
function ot() {
  return m("last_day_start_deliver_date");
}
function at(t) {
  T("last_day_start_deliver_date", t);
}
function C(t, e) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  return r.prepare(`
    SELECT * FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `).get(t, e) ?? null;
}
function it(t, e) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  return r.prepare(`
    SELECT * FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ? AND delivered_at IS NULL
  `).get(t, e) ?? null;
}
function st(t) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  r.prepare(`
    UPDATE handoff_notes SET delivered_at = datetime('now') WHERE id = ?
  `).run(t);
}
function lt(t, e) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  const n = k();
  return r.prepare(`
    DELETE FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `).run(t, n), r.prepare(`
    INSERT INTO handoff_notes (target_app, deliver_on_date, note_text)
    VALUES (?, ?, ?)
  `).run(t, n, e).lastInsertRowid;
}
function ct(t, e) {
  if (!r) throw new Error("Database not initialized. Call initDb() first.");
  const n = y();
  return r.prepare(`
    DELETE FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `).run(t, n), r.prepare(`
    INSERT INTO handoff_notes (target_app, deliver_on_date, note_text)
    VALUES (?, ?, ?)
  `).run(t, n, e).lastInsertRowid;
}
const P = l.dirname(H(import.meta.url));
globalThis.__filename = H(import.meta.url);
const V = 450, dt = 650, $ = 367;
process.env.APP_ROOT = l.join(P, "..");
const _ = process.env.VITE_DEV_SERVER_URL, At = l.join(process.env.APP_ROOT, "dist-electron"), b = l.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = _ ? l.join(process.env.APP_ROOT, "public") : b;
let o = null, f = null, L = null, R = { bundleId: "", displayName: "" };
const ut = 500, pt = 5e3, ft = 5e3;
let E = 0, u = null, c = null;
async function M() {
  try {
    return await N({
      screenRecordingPermission: !1,
      accessibilityPermission: !1
    }), !0;
  } catch {
    return !1;
  }
}
function U() {
  f && f.setToolTip(
    c === !1 && process.platform === "darwin" ? "Context HandOff — Accessibility permission required" : "Context HandOff"
  );
}
function S(t, e) {
  try {
    return J(
      `/usr/libexec/PlistBuddy -c "Print :${e}" "${t}"`,
      { encoding: "utf8" }
    ).trim();
  } catch {
    return null;
  }
}
function _t() {
  const t = X(), e = G.createFromPath(t);
  process.platform === "darwin" && e.setTemplateImage(!0), f = new K(e.isEmpty() ? t : e), f.setToolTip("Context HandOff"), process.platform === "darwin" && f.setIgnoreDoubleClickEvents(!0), f.on("click", async () => {
    var a;
    if (process.platform !== "darwin" || c !== !1)
      try {
        const s = await N({
          screenRecordingPermission: !1,
          accessibilityPermission: !1
        });
        R = {
          bundleId: (s == null ? void 0 : s.platform) === "macos" ? s.owner.bundleId ?? "" : "",
          displayName: ((a = s == null ? void 0 : s.owner) == null ? void 0 : a.name) ?? ""
        };
      } catch {
        R = { bundleId: "", displayName: "" };
      }
    o && !o.isDestroyed() ? (o.show(), o.focus()) : (B(), o && !o.isDestroyed() && (o.show(), o.focus()));
  });
}
function X() {
  const t = process.env.APP_ROOT, e = "tray-iconTemplate.png", n = l.join(t, "public", e), a = l.join(t, "dist", e), s = l.join(process.resourcesPath, e);
  if (h.existsSync(n)) return n;
  if (h.existsSync(a)) return a;
  if (h.existsSync(s)) return s;
  throw new Error(
    `Tray icon not found. Tried:
${n}
${a}
${s}`
  );
}
function z(t) {
  const e = W();
  if (e === null) return !1;
  const n = /* @__PURE__ */ new Date();
  if (n.getHours() * 60 + n.getMinutes() < e) return !1;
  const s = y(), p = it(t, s);
  return p ? (Tt(p), st(p.id), !0) : !1;
}
function Tt(t) {
  L = t;
  const e = new I({
    width: 420,
    height: 220,
    alwaysOnTop: !0,
    title: "Context Handoff",
    webPreferences: {
      preload: l.join(P, "preload.mjs")
    }
  });
  if (_) {
    const n = _ + (_.includes("?") ? "&" : "?") + "overlay=1";
    e.loadURL(n);
  } else
    e.loadFile(l.join(b, "index.html"), {
      query: { overlay: "1" }
    });
  e.on("closed", () => {
    L = null;
  });
}
function B() {
  o = new I({
    title: "Context Handoff",
    width: $,
    height: V,
    icon: X(),
    webPreferences: {
      preload: l.join(P, "preload.mjs")
    }
  }), _ ? o.loadURL(_) : o.loadFile(l.join(b, "index.html")), o.on("closed", () => {
    o = null;
  });
}
function w() {
  let t = "";
  return setInterval(async () => {
    E = Date.now();
    try {
      if (g() !== "on_app") return;
      const e = D();
      if (!e) return;
      const n = await N({
        screenRecordingPermission: !1,
        accessibilityPermission: !1
      }), a = (n == null ? void 0 : n.platform) === "macos" ? n.owner.bundleId ?? "" : "";
      a !== t && (a === e && z(e), t = a);
    } catch (e) {
      console.error("[frontmost poll]", e);
    }
  }, ut);
}
function v() {
  setInterval(() => {
    Date.now() - E > ft && (console.warn("[watchdog] poller stalled, restarting"), u !== null && clearInterval(u), u = w());
  }, pt);
}
d.on("window-all-closed", () => {
  process.platform !== "darwin" && (d.quit(), o = null);
});
d.on("activate", () => {
  I.getAllWindows().length === 0 && B();
});
d.whenReady().then(async () => {
  process.platform === "darwin" && d.dock.hide(), Q(), _t(), process.platform === "darwin" ? (d.setLoginItemSettings({ openAtLogin: F() }), c = await M(), U(), c && (E = Date.now(), u = w(), v())) : (E = Date.now(), u = w(), v()), Y.on("unlock-screen", () => {
    try {
      if (g() !== "on_day_start") return;
      const t = y();
      if (ot() === t) return;
      z(A) && at(t);
    } catch (t) {
      console.error("[unlock-screen]", t);
    }
  }), i.handle(
    "db:upsertForTomorrow",
    (t, { targetApp: e, noteText: n }) => (lt(e, n), { ok: !0 })
  ), i.handle(
    "db:upsertForToday",
    (t, { targetApp: e, noteText: n }) => (ct(e, n), { ok: !0 })
  ), i.handle("db:getNoteForTomorrow", () => {
    const t = g() === "on_day_start" ? A : D();
    if (!t) return null;
    const e = k();
    return C(t, e);
  }), i.handle("db:getNoteForToday", () => {
    const t = g() === "on_day_start" ? A : D();
    if (!t) return null;
    const e = y();
    return C(t, e);
  }), i.handle("overlay:getNote", () => L), i.handle("settings:getDeliverAfterMinutes", () => W()), i.handle(
    "settings:setDeliverAfterMinutes",
    (t, e) => (et(e), { ok: !0 })
  ), i.handle("settings:getLaunchAtLogin", () => F()), i.handle(
    "settings:setLaunchAtLogin",
    (t, e) => (nt(e), process.platform === "darwin" && d.setLoginItemSettings({ openAtLogin: e }), { ok: !0 })
  ), i.handle("settings:getDeliveryMode", () => g()), i.handle(
    "settings:setDeliveryMode",
    (t, e) => (rt(e), { ok: !0 })
  ), i.handle("app:getAccessibilityStatus", () => ({
    granted: c === !0
  })), i.handle("app:retryAccessibilityAndStartPoller", async () => process.platform !== "darwin" ? !0 : (c = await M(), U(), c && u === null && (E = Date.now(), u = w(), v()), c)), i.handle("app:getLastActiveApp", () => R), i.handle("app:getTargetApp", () => ({
    bundleId: D(),
    displayName: Z()
  })), i.handle(
    "app:setTargetApp",
    (t, { bundleId: e, displayName: n }) => (tt(e, n), { ok: !0 })
  ), i.handle("app:resizeEditor", (t, e) => {
    if (o && !o.isDestroyed()) {
      const n = e ? dt : $;
      o.setSize(n, V);
    }
    return { ok: !0 };
  }), i.handle("app:pickAppFromFinder", async () => {
    const t = o ? await O.showOpenDialog(o, {
      defaultPath: "/Applications",
      properties: ["openFile", "openDirectory"],
      title: "Select an app"
    }) : await O.showOpenDialog({
      defaultPath: "/Applications",
      properties: ["openFile", "openDirectory"],
      title: "Select an app"
    });
    if (t.canceled || t.filePaths.length === 0) return null;
    const e = t.filePaths[0];
    if (!e.toLowerCase().endsWith(".app")) return null;
    const n = l.join(e, "Contents", "Info.plist");
    if (!h.existsSync(n)) return null;
    const a = S(n, "CFBundleIdentifier");
    if (!a) return null;
    const s = S(n, "CFBundleDisplayName") ?? S(n, "CFBundleName") ?? l.basename(e, ".app");
    return { bundleId: a, displayName: s };
  });
});
export {
  At as MAIN_DIST,
  b as RENDERER_DIST,
  _ as VITE_DEV_SERVER_URL
};

import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';

let db: Database.Database | null = null;

export const DAY_START_TARGET_APP = 'day_start';

export function getTomorrowDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getTodayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function initDb(): Database.Database {
  const userData = app.getPath('userData');
  const dbPath = path.join(userData, 'handoff.db');
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

export function getSetting(key: string): string | null {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');

  const stmt = db.prepare(`SELECT value FROM app_settings WHERE key = ?`);
  const row = stmt.get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
  `);
  stmt.run(key, value);
}

export function getTargetApp(): string | null {
  return getSetting('target_app');
}

export function getTargetAppDisplayName(): string | null {
  return getSetting('target_app_display_name');
}

export function setTargetApp(bundleId: string, displayName: string): void {
  setSetting('target_app', bundleId);
  setSetting('target_app_display_name', displayName);
}

const DELIVER_AFTER_MINUTES_KEY = 'deliver_after_minutes';

export function getDeliverAfterMinutes(): number | null {
  const val = getSetting(DELIVER_AFTER_MINUTES_KEY);
  if (val === null) return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

export function setDeliverAfterMinutes(minutes: number): void {
  setSetting(DELIVER_AFTER_MINUTES_KEY, String(minutes));
}

const LAUNCH_AT_LOGIN_KEY = 'launch_at_login';

export function getLaunchAtLogin(): boolean {
  const val = getSetting(LAUNCH_AT_LOGIN_KEY);
  return val === 'true';
}

export function setLaunchAtLogin(enabled: boolean): void {
  setSetting(LAUNCH_AT_LOGIN_KEY, enabled ? 'true' : 'false');
}

export function getDeliveryMode(): 'on_app' | 'on_day_start' {
  const val = getSetting('delivery_mode');
  return val === 'on_day_start' ? 'on_day_start' : 'on_app';
}

export function setDeliveryMode(mode: 'on_app' | 'on_day_start'): void {
  setSetting('delivery_mode', mode);
}

export function getLastDayStartDeliverDate(): string | null {
  return getSetting('last_day_start_deliver_date');
}

export function setLastDayStartDeliverDate(dateStr: string): void {
  setSetting('last_day_start_deliver_date', dateStr);
}

export function getNoteForDate(
  targetApp: string,
  deliverOnDate: string
): {
  id: number;
  target_app: string;
  deliver_on_date: string;
  note_text: string;
  created_at: string;
  delivered_at: string | null;
} | null {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');

  const stmt = db.prepare(`
    SELECT * FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `);
  const row = stmt.get(targetApp, deliverOnDate);
  return (row ?? null) as {
    id: number;
    target_app: string;
    deliver_on_date: string;
    note_text: string;
    created_at: string;
    delivered_at: string | null;
  } | null;
}

export function getUndeliveredNoteForDate(
  targetApp: string,
  deliverOnDate: string
): {
  id: number;
  target_app: string;
  deliver_on_date: string;
  note_text: string;
  created_at: string;
  delivered_at: string | null;
} | null {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');

  const stmt = db.prepare(`
    SELECT * FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ? AND delivered_at IS NULL
  `);
  const row = stmt.get(targetApp, deliverOnDate);
  return (row ?? null) as {
    id: number;
    target_app: string;
    deliver_on_date: string;
    note_text: string;
    created_at: string;
    delivered_at: string | null;
  } | null;
}

export function markNoteAsDelivered(noteId: number): void {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');

  const stmt = db.prepare(`
    UPDATE handoff_notes SET delivered_at = datetime('now') WHERE id = ?
  `);
  stmt.run(noteId);
}

export function upsertNoteForTomorrow(
  targetApp: string,
  noteText: string
): number {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');

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
  return result.lastInsertRowid as number;
}

export function upsertNoteForToday(
  targetApp: string,
  noteText: string
): number {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');

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
  return result.lastInsertRowid as number;
}

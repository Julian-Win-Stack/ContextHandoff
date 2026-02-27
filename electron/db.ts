import Database from 'better-sqlite3'
import path from 'node:path'
import { app } from 'electron'

let db: Database.Database | null = null

export function getTomorrowDateStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getTodayDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function initDb(): Database.Database {
  const userData = app.getPath('userData')
  const dbPath = path.join(userData, 'handoff.db')
  db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS handoff_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_app TEXT NOT NULL DEFAULT 'cursor',
      deliver_on_date TEXT NOT NULL,
      note_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at TEXT
    )
  `)

  return db
}

export function getNoteForDate(
  targetApp: string,
  deliverOnDate: string
): {
  id: number
  target_app: string
  deliver_on_date: string
  note_text: string
  created_at: string
  delivered_at: string | null
} | null {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')

  const stmt = db.prepare(`
    SELECT * FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `)
  const row = stmt.get(targetApp, deliverOnDate)
  return (row ?? null) as {
    id: number
    target_app: string
    deliver_on_date: string
    note_text: string
    created_at: string
    delivered_at: string | null
  } | null
}

export function getUndeliveredNoteForDate(
  targetApp: string,
  deliverOnDate: string
): {
  id: number
  target_app: string
  deliver_on_date: string
  note_text: string
  created_at: string
  delivered_at: string | null
} | null {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')

  const stmt = db.prepare(`
    SELECT * FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ? AND delivered_at IS NULL
  `)
  const row = stmt.get(targetApp, deliverOnDate)
  return (row ?? null) as {
    id: number
    target_app: string
    deliver_on_date: string
    note_text: string
    created_at: string
    delivered_at: string | null
  } | null
}

export function markNoteAsDelivered(noteId: number): void {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')

  const stmt = db.prepare(`
    UPDATE handoff_notes SET delivered_at = datetime('now') WHERE id = ?
  `)
  stmt.run(noteId)
}

export function upsertNoteForTomorrow(targetApp: string, noteText: string): number {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')

  const tomorrow = getTomorrowDateStr()

  const deleteStmt = db.prepare(`
    DELETE FROM handoff_notes
    WHERE target_app = ? AND deliver_on_date = ?
  `)
  deleteStmt.run(targetApp, tomorrow)

  const insertStmt = db.prepare(`
    INSERT INTO handoff_notes (target_app, deliver_on_date, note_text)
    VALUES (?, ?, ?)
  `)
  const result = insertStmt.run(targetApp, tomorrow, noteText)
  return result.lastInsertRowid as number
}

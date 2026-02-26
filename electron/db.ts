import Database from 'better-sqlite3'
import path from 'node:path'
import { app } from 'electron'

let db: Database.Database | null = null

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

export function insertNote(
  targetApp: string,
  deliverOnDate: string,
  noteText: string
): number {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')

  const stmt = db.prepare(`
    INSERT INTO handoff_notes (target_app, deliver_on_date, note_text)
    VALUES (?, ?, ?)
  `)
  const result = stmt.run(targetApp, deliverOnDate, noteText)
  return result.lastInsertRowid as number
}

export function getNotes(): Array<{
  id: number
  target_app: string
  deliver_on_date: string
  note_text: string
  created_at: string
  delivered_at: string | null
}> {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')

  const stmt = db.prepare('SELECT * FROM handoff_notes')
  return stmt.all() as Array<{
    id: number
    target_app: string
    deliver_on_date: string
    note_text: string
    created_at: string
    delivered_at: string | null
  }>
}

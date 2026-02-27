import { useState, useEffect } from 'react'
import './App.css'

const isDev = import.meta.env.DEV

function getTomorrowFormatted(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getTodayFormatted(): string {
  const d = new Date()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function App() {
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deliverToday, setDeliverToday] = useState(false)

  useEffect(() => {
    const channel = deliverToday ? 'db:getNoteForToday' : 'db:getNoteForTomorrow'
    window.ipcRenderer.invoke(channel).then((result: { note_text: string } | null) => {
      setNote(result?.note_text ?? '')
    })
  }, [deliverToday])

  async function handleSave() {
    setSaving(true)
    const channel = deliverToday ? 'db:upsertForToday' : 'db:upsertForTomorrow'
    await window.ipcRenderer.invoke(channel, { targetApp: 'cursor', noteText: note })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="editor">
      <h2>Context Handoff</h2>
      <p className="editor-delivery">Will deliver on: {deliverToday ? getTodayFormatted() : getTomorrowFormatted()}</p>
      <textarea
        placeholder="Write your note for tomorrow..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={8}
      />
      <div className="editor-actions">
        <button
          type="button"
          className="editor-save"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : deliverToday ? 'Save for today' : 'Save for tomorrow'}
        </button>
        {isDev && (
          <label className="editor-deliver-today">
            <input
              type="checkbox"
              checked={deliverToday}
              onChange={(e) => setDeliverToday(e.target.checked)}
            />
            Deliver today
          </label>
        )}
      </div>
      {saved && <p className="editor-feedback">Saved!</p>}
    </div>
  )
}

export default App

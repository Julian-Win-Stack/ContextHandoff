import { useState, useEffect } from 'react'
import './App.css'

function getTomorrowFormatted(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function App() {
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.ipcRenderer.invoke('db:getNoteForTomorrow').then((result: { note_text: string } | null) => {
      if (result?.note_text) setNote(result.note_text)
    })
  }, [])

  async function handleSave() {
    setSaving(true)
    await window.ipcRenderer.invoke('db:upsertForTomorrow', { targetApp: 'cursor', noteText: note })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="editor">
      <h2>Context Handoff</h2>
      <p className="editor-delivery">Will deliver on: {getTomorrowFormatted()}</p>
      <textarea
        placeholder="Write your note for tomorrow..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={8}
      />
      <button
        type="button"
        className="editor-save"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save for tomorrow'}
      </button>
      {saved && <p className="editor-feedback">Saved!</p>}
    </div>
  )
}

export default App

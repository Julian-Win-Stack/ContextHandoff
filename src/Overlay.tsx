import { useState, useEffect } from 'react'
import './Overlay.css'

function Overlay() {
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    window.ipcRenderer.invoke('overlay:getNote').then((result: { note_text: string } | null) => {
      setNote(result?.note_text ?? null)
    })
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') window.close()
  }

  return (
    <div className="overlay">
      <p className="overlay-hint">Click esc to dismiss</p>
      <div className="overlay-note">{note ?? '(No note)'}</div>
    </div>
  )
}

export default Overlay

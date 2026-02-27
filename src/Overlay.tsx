import { useState, useEffect } from 'react'
import './Overlay.css'

function Overlay() {
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    window.ipcRenderer.invoke('overlay:getNote').then((result: { note_text: string } | null) => {
      setNote(result?.note_text ?? null)
    })
  }, [])

  function handleDismiss() {
    window.close()
  }

  return (
    <div className="overlay">
      <div className="overlay-note">{note ?? '(No note)'}</div>
      <button type="button" className="overlay-dismiss" onClick={handleDismiss}>
        Dismiss
      </button>
    </div>
  )
}

export default Overlay

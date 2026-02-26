import { useState } from 'react'
import './App.css'

function App() {
  const [note, setNote] = useState('')

  return (
    <div className="editor">
      <h2>Tomorrow Note</h2>
      <textarea
        placeholder="Write your note for tomorrow..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={8}
      />
    </div>
  )
}

export default App

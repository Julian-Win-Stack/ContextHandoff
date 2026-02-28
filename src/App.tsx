import { useState, useEffect } from 'react';
import './App.css';

const isDev = import.meta.env.DEV;

function getTomorrowFormatted(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getTodayFormatted(): string {
  const d = new Date();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function App() {
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deliverToday, setDeliverToday] = useState(false);
  const [targetAppBundleId, setTargetAppBundleId] = useState<string | null>(
    null
  );
  const [targetAppDisplayName, setTargetAppDisplayName] = useState<
    string | null
  >(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  useEffect(() => {
    window.ipcRenderer
      .invoke('app:getTargetApp')
      .then(
        (res: { bundleId: string | null; displayName: string | null }) => {
          setTargetAppBundleId(res?.bundleId ?? null);
          setTargetAppDisplayName(res?.displayName ?? null);
        }
      );
  }, []);

  useEffect(() => {
    const channel = deliverToday
      ? 'db:getNoteForToday'
      : 'db:getNoteForTomorrow';
    window.ipcRenderer
      .invoke(channel)
      .then((result: { note_text: string } | null) => {
        setNote(result?.note_text ?? '');
      });
  }, [deliverToday, targetAppBundleId]);

  async function handleSelectCurrentApp() {
    setSelectError(null);
    const lastActive = (await window.ipcRenderer.invoke(
      'app:getLastActiveApp'
    )) as { bundleId: string; displayName: string };
    if (!lastActive?.bundleId) {
      setSelectError(
        'No app detected. Open the editor from the app you want to select.'
      );
      return;
    }
    await window.ipcRenderer.invoke('app:setTargetApp', {
      bundleId: lastActive.bundleId,
      displayName: lastActive.displayName,
    });
    setTargetAppBundleId(lastActive.bundleId);
    setTargetAppDisplayName(lastActive.displayName);
  }

  async function handleSelectAppFromPicker() {
    setSelectError(null);
    const picked = (await window.ipcRenderer.invoke(
      'app:pickAppFromFinder'
    )) as { bundleId: string; displayName: string } | null;
    if (!picked?.bundleId) {
      setSelectError('Please select an application (.app)');
      return;
    }
    await window.ipcRenderer.invoke('app:setTargetApp', picked);
    setTargetAppBundleId(picked.bundleId);
    setTargetAppDisplayName(picked.displayName);
  }

  async function handleSave() {
    if (!targetAppBundleId) return;
    setSaving(true);
    const channel = deliverToday ? 'db:upsertForToday' : 'db:upsertForTomorrow';
    await window.ipcRenderer.invoke(channel, {
      targetApp: targetAppBundleId,
      noteText: note,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="editor">
      <div className="editor-main">
        <h2>Context Handoff</h2>
        <p className="editor-delivery">
          Will deliver on:{' '}
          {deliverToday ? getTodayFormatted() : getTomorrowFormatted()}
        </p>
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
            disabled={saving || !targetAppBundleId}
          >
            {saving
              ? 'Saving...'
              : deliverToday
                ? 'Save for today'
                : 'Save for tomorrow'}
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
      <div className="editor-target">
        {targetAppDisplayName ? (
          <p className="editor-target-label">
            Current app: <strong>{targetAppDisplayName}</strong>
          </p>
        ) : (
          <p className="editor-target-label">App not selected</p>
        )}
        <button
          type="button"
          className="editor-select-app"
          onClick={handleSelectCurrentApp}
        >
          Select current app
        </button>
        <button
          type="button"
          className="editor-select-app"
          onClick={handleSelectAppFromPicker}
        >
          Select app
        </button>
        {selectError && (
          <p className="editor-select-error">{selectError}</p>
        )}
      </div>
    </div>
  );
}

export default App;

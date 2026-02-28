import { useState, useEffect } from 'react';
import './App.css';

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

function minutesToHHMM(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function hhmmToMinutes(hhmm: string): number | null {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return hours * 60 + mins;
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
  const [deliverAfterTime, setDeliverAfterTime] = useState<string | null>(
    null
  );

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
    window.ipcRenderer
      .invoke('settings:getDeliverAfterMinutes')
      .then((minutes: number | null) => {
        if (minutes === null) {
          setDeliverAfterTime(null);
        } else {
          setDeliverAfterTime(minutesToHHMM(minutes));
        }
      });
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

  function handleDeliverAfterChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (!value) {
      setDeliverAfterTime(null);
      return;
    }
    const minutes = hhmmToMinutes(value);
    if (minutes === null) return;
    window.ipcRenderer.invoke('settings:setDeliverAfterMinutes', minutes);
    setDeliverAfterTime(value);
  }

  async function handleSave() {
    if (!targetAppBundleId || !deliverAfterTime) return;
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
        <div className="editor-delivery-section">
          <label htmlFor="deliver-after" className="editor-delivery-label">
            Deliver after
          </label>
          <input
            id="deliver-after"
            type="time"
            className="editor-delivery-time"
            value={deliverAfterTime ?? ''}
            onChange={handleDeliverAfterChange}
          />
          <p className="editor-delivery-helper">
            Note will only show after this time (local time).
          </p>
          {!deliverAfterTime && (
            <p className="editor-delivery-error">
              Please select a delivery time.
            </p>
          )}
        </div>
        <div className="editor-actions">
          <button
            type="button"
            className="editor-save"
            onClick={handleSave}
            disabled={
              saving || !targetAppBundleId || !deliverAfterTime
            }
          >
            {saving
              ? 'Saving...'
              : deliverToday
                ? 'Save for today'
                : 'Save for tomorrow'}
          </button>
          <label className="editor-deliver-today">
            <input
              type="checkbox"
              checked={deliverToday}
              onChange={(e) => setDeliverToday(e.target.checked)}
            />
            Deliver today
          </label>
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

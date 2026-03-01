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
  const [noteError, setNoteError] = useState<string | null>(null);
  const [deliverAfterTime, setDeliverAfterTime] = useState<string | null>(
    null
  );
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<
    'on_app' | 'on_day_start'
  >('on_app');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    window.ipcRenderer.invoke('app:resizeEditor', showAdvanced);
  }, [showAdvanced]);

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
    window.ipcRenderer
      .invoke('settings:getLaunchAtLogin')
      .then((enabled: boolean) => setLaunchAtLogin(enabled));
  }, []);

  useEffect(() => {
    window.ipcRenderer
      .invoke('settings:getDeliveryMode')
      .then((mode: 'on_app' | 'on_day_start') => setDeliveryMode(mode));
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
  }, [deliverToday, deliveryMode]);

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
    const targetApp =
      deliveryMode === 'on_day_start' ? 'day_start' : targetAppBundleId;
    if (!targetApp || !deliverAfterTime) return;
    if (!note.trim()) {
      setNoteError('Please enter a note.');
      return;
    }
    setNoteError(null);
    setSaving(true);
    const channel = deliverToday ? 'db:upsertForToday' : 'db:upsertForTomorrow';
    await window.ipcRenderer.invoke(channel, {
      targetApp,
      noteText: note,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div
      className={`editor ${!showAdvanced ? 'editor--advanced-collapsed' : ''}`}
    >
      <div className="editor-main">
        <h2>Context Handoff</h2>
        <p className="editor-delivery">
          Will deliver on:{' '}
          {deliverToday ? getTodayFormatted() : getTomorrowFormatted()}
        </p>
        <textarea
          placeholder="Write your note for tomorrow..."
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setNoteError(null);
          }}
          rows={8}
        />
        {noteError && (
          <p className="editor-note-error">{noteError}</p>
        )}
        <div className="editor-delivery-row">
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
          {!deliverAfterTime && (
            <span className="editor-delivery-error">
              Please select a delivery time.
            </span>
          )}
        </div>
        <div className="editor-actions">
          <button
            type="button"
            className="editor-save"
            onClick={handleSave}
            disabled={
              saving ||
              !deliverAfterTime ||
              (deliveryMode === 'on_app' && !targetAppBundleId)
            }
          >
            {saving ? 'Saving...' : 'Save'}
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
      <div className="editor-divider" />
      <div className="editor-target">
        <div
          className="advanced-header"
          onClick={() => setShowAdvanced(!showAdvanced)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowAdvanced((v) => !v);
            }
          }}
        >
          Advanced {showAdvanced ? '▾' : '▸'}
        </div>
        {showAdvanced && (
          <div className="advanced-section">
            <p className="editor-delivery-mode-label">
              Show reminder when…
            </p>
            <div className="editor-delivery-mode">
              <label className="editor-delivery-mode-option">
                <input
                  type="radio"
                  name="delivery-mode"
                  checked={deliveryMode === 'on_app'}
                  onChange={() => {
                    setDeliveryMode('on_app');
                    setSelectError(null);
                    window.ipcRenderer.invoke(
                      'settings:setDeliveryMode',
                      'on_app'
                    );
                  }}
                />
                I open a specific app
              </label>
              <label className="editor-delivery-mode-option">
                <input
                  type="radio"
                  name="delivery-mode"
                  checked={deliveryMode === 'on_day_start'}
                  onChange={() => {
                    setDeliveryMode('on_day_start');
                    setSelectError(null);
                    window.ipcRenderer.invoke(
                      'settings:setDeliveryMode',
                      'on_day_start'
                    );
                  }}
                />
                I unlock my Mac (start of day)
              </label>
            </div>
            {deliveryMode === 'on_app' && (
              <>
                {targetAppDisplayName ? (
                  <p className="editor-target-label">
                    Current app: <strong>{targetAppDisplayName}</strong>
                  </p>
                ) : (
                  <p className="editor-target-label">App not selected</p>
                )}
                <div className="editor-select-app-wrapper">
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
                </div>
              </>
            )}
            {selectError && (
              <p className="editor-select-error">{selectError}</p>
            )}
            <label className="editor-launch-at-login">
              <input
                type="checkbox"
                checked={launchAtLogin}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setLaunchAtLogin(enabled);
                  window.ipcRenderer.invoke(
                    'settings:setLaunchAtLogin',
                    enabled
                  );
                }}
              />
              Launch at login (recommended)
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

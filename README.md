
# Context HandOff

A macOS menu-bar (tray) utility that lets you leave a note for “tomorrow you” and delivers it at the exact moment you start working — either when you open a specific app (e.g. Cursor) or when you unlock your Mac.

This project demonstrates shipping a real desktop utility with OS-level integrations: tray apps, SQLite persistence, IPC boundaries, Accessibility permission handling, and self-healing background loops.

---

## What It Does

**Tonight:** write a short note in the Editor.  
**Tomorrow:** the note pops **once**, then is marked delivered.

Delivery triggers:

- **On App Focus** — show the reminder when the selected app becomes frontmost
- **On Day Start** — show the reminder when you unlock your Mac (first unlock of the day)

Guardrails:

- **Deliver-after time** gate (e.g. “don’t show before 10:00”)
- **One-time delivery** (no repeat spam after it’s delivered)
- **Launch at login** toggle for reliability across restarts
- **Watchdog** that restarts the poller if it stalls

---

## User Flow

1. Launch app → it runs in the menu bar (no big window).
2. Click tray icon → Editor opens.
3. Write note → Save for tomorrow (or Save for today in dev/testing).
4. Next day (after deliver-after time):
   - If **On App Focus**: open/focus selected app → overlay appears once.
   - If **On Day Start**: unlock Mac → overlay appears once.
5. Note is marked delivered so it won’t show again.

---

## 🏗 Architecture Overview

Electron has two worlds:

- **Main process**: system control (tray, windows, DB, app detection)
- **Renderer**: UI (React Editor + Overlay)

Renderer never touches OS APIs directly — it calls the main process through IPC.

---

## 🧰 Tech Stack

### Desktop
- Electron
- TypeScript
- macOS menu bar tray + multi-window (Editor + Overlay)

### UI (Renderer)
- React
- Vite
- CSS

### Storage
- SQLite (`better-sqlite3`)
- DB stored in `app.getPath("userData")`

### OS / System Integrations
- `active-win` (frontmost app detection on macOS)
- `powerMonitor` (unlock-screen detection)
- `app.setLoginItemSettings` (launch at login)

---

## 🚀 Core Features

### 🟦 Menu-Bar (Tray) App
- Starts silently (no big window on launch)
- Tray click opens/focuses the Editor window
- Dock hidden on macOS (`app.dock.hide()`)

---

### 🗄 Durable Local Storage (SQLite)
Two tables:

- **handoff_notes**
  - `target_app`
  - `deliver_on_date`
  - `note_text`
  - `delivered_at` (NULL until delivered)
- **app_settings**
  - key/value store for:
    - `target_app` (bundleId)
    - `deliver_after_minutes`
    - `delivery_mode`
    - `launch_at_login`
    - `last_day_start_deliver_date`

DB path:
- `~/Library/Application Support/<YourAppName>/handoff.db`

---

### ⏰ Deliver-After Time Gate
- User picks a time via `<input type="time">`
- Reminder only triggers if:
  - `nowMinutes >= deliver_after_minutes`

Prevents accidental delivery at night or too early.

---

### 🎯 Two Delivery Modes

#### 1) On App Focus (`delivery_mode = on_app`)
- Poll every 500ms
- Read frontmost app **bundleId**
- If it matches the selected target app → check eligibility → show overlay

Requires macOS **Accessibility** permission.

#### 2) On Day Start (`delivery_mode = on_day_start`)
- Listen to `powerMonitor.on('unlock-screen')`
- Deliver only once per day using `last_day_start_deliver_date`

No Accessibility required.

---

### 🪟 Overlay Window (One-Time Reminder)
- Always on top
- Shows note text
- Marks note as delivered immediately after showing
- Prevents repeat triggers

---

### 🛡 Accessibility Permission Handling (macOS Reality)
Frontmost app detection requires Accessibility permission.

Implemented guardrails:
- One-time permission check (no “permission request spam” in a 500ms loop)
- UI banner explains how to grant permission
- Retry button re-checks permission and starts poller when granted
- Tray tooltip updates if permission is missing

---

### 🔁 Self-Healing Watchdog (Reliability)
Background loops can silently stall (promise rejection, thrown error, blocked interval).

Implementation:
- Poller updates `lastPollTickAt` on every tick
- Watchdog checks every 5s
- If `now - lastPollTickAt > 5s` → restart poller

This prevents the “tray icon exists but reminders never fire” failure mode.

---

## 🧠 Technical Highlights

### IPC Boundary (Safe Desktop Architecture)
All privileged actions live in main process:
- DB reads/writes
- App picker (`dialog.showOpenDialog`)
- Launch at login
- Permission status checks
- Window resizing / overlay display

Renderer does:
- UI + form state
- calls main via IPC (`ipcMain.handle`)

---

### App Targeting Uses bundleId (Not Display Names)
- Frontmost app detection returns bundleId reliably
- App selection via Finder reads `Info.plist` for:
  - `CFBundleIdentifier`
  - display name fallback chain (`CFBundleDisplayName` → `CFBundleName` → folder name)

This avoids “Google Chrome vs Chrome” string mismatch issues.

---

## 🧪 Testing Notes (Manual)
This app is OS-driven, so “tests” are primarily real interaction checks:

- Tray click → Editor opens
- Save note → persists after restart
- On App Focus mode:
  - after deliver-after time, focusing target app triggers overlay once
- On Day Start mode:
  - lock screen → unlock → overlay once per day
- Launch at login works in packaged build

---

## 💻 Run Locally

```bash
npm install
npm run dev
```

Note: macOS permissions can behave inconsistently during dev if you rebuild/run from different paths. For stable permission testing, install a packaged build into /Applications.

⸻

## 📦 Package & Install Locally (macOS)

```bash
npm run dist
```
### Installation Steps

Then:

- Open the generated `.dmg` or `.zip`
- Drag the `.app` into `/Applications`
- Run the app from `/Applications`  
  *(Important for stable Accessibility permission behavior on macOS)*

---

## Why It Failed to Find Users (Honest Postmortem)

This app solves a real personal problem: forgetting a planned task when the day starts.

However, it didn’t find users in my immediate network for several reasons:

### 1) “Good Enough” Substitutes Already Exist

Most people already rely on:

- Google Calendar  
- Reminders / Notes  
- Todoist / Notion  
- Messaging themselves  

Because these tools already solve most of the problem, the incremental benefit of installing a new background utility must be significantly higher to justify adoption.

---

### 2) The Pain Isn’t Frequent Enough

Many people forget occasionally — but not consistently.

Adoption usually requires:

- Frequent pain  
- High cost of forgetting  

For most people I spoke to, the problem was not strong enough.

---

### 3) Permission + Background-App Friction Is a Big Ask

App-focus delivery requires macOS **Accessibility permission**.

Even if technically safe, it feels heavy:

- It introduces setup friction  
- It feels invasive  
- It increases adoption resistance  

For small or occasional pain, this friction prevents installation.

---

### 4) It’s a Behavior-Change Product

The app requires a new habit:

- Write a note at night  
- Trust it will appear the next day  

People who already have this habit use other tools.  
People who don’t often won’t adopt a new workflow.

**Conclusion:**  
The audience is niche — context-switchers who dislike traditional todo systems but still want contextual, one-time reminders.

---

## Lessons Learned

### Product

- Competing with existing habits is harder than competing with “no solution.”
- Friction (permissions + always-running utility) must be justified by strong recurring pain.
- Narrow tools need either:
  - A strong niche with high pain, or  
  - A broader wedge or integration that removes habit burden.

---

### Engineering

Desktop apps introduce different failure modes than web apps:

- OS permissions  
- Dev vs packaged behavior  
- Resource paths (`public/` vs `process.resourcesPath`)  
- Native module packaging constraints  

Reliability matters even in small apps:

- Watchdogs and guardrails prevent silent failure.  
- Clear IPC boundaries make the app safer and easier to reason about.

---

## Project Goals (Why I Built This)

This anchor project demonstrates:

- Shipping an end-to-end system with real OS constraints  
- Designing a durable local data model (SQLite)  
- Handling permissions and platform quirks (macOS Accessibility)  
- Building reliable background behavior (poller + watchdog)  
- Maintaining a clean separation between UI and privileged system logic via IPC  

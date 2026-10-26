# Hillstone Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GitHub Pages control panel plus a Chrome extension that watch Hillstone Park Avenue South on Wisely and book the first table matching a saved party size and time window, with no second confirmation.

**Architecture:** One repo, one npm package. Pure, tested logic lives in `src/core/` (time zone maths, hunt editing, inventory parsing, the hunt state machine) and is shared by the React site (`src/ui/`, built by Vite) and the MV3 extension (`extension/src/`, bundled by esbuild into a committed `extension/dist/`). The extension owns all state in `chrome.storage.local`; the site is a remote control that talks to it through a content script using `window.postMessage`.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, esbuild, Chrome MV3 (`alarms`, `storage`, `notifications`, `offscreen`, `tabs`), GitHub Actions → Pages. Versions: copy `Menu Generator/package.json`.

**Spec:** `docs/superpowers/specs/2026-10-26-hillstone-watch-design.md`

## Global Constraints

- Guest name/email/phone never appear in source, tests, fixtures, commit messages or screenshots. They live only in `chrome.storage.local`.
- Never call Wisely's create-reservation API, and never read, fake, replay or bypass an Arkose token. Booking only happens by driving `https://reservations.getwisely.com/hillstone-park-avenue?g=midtown-parkave` in a normal tab.
- Availability: `GET https://loyaltyapi.wisely.io/v2/web/reservations/inventory?merchant_id=278278&party_size=N&search_ts=<ms>&show_reservation_types=1&limit=50`. One call per day returns that whole day's open times (verified 2026-10-26).
- Check interval: 30 s (`chrome.alarms` `periodInMinutes: 0.5`), never faster.
- All dates/times are America/New_York, independent of the PC clock's zone.
- Party size 1–4. Days 1–5. The default hunt has exactly one day.
- One booking per hunt. The first `booked` outcome stops everything.
- Accent dark green `#2f5d50`, light background `#f4f1ec`. Dog rails reused from Menu Generator.
- `.superpowers/`, `node_modules/` and `dist/` (site build only) are git-ignored. `extension/dist/` **is** committed.
- Repo / site name: `Hillstone-Watch` → `https://alessisheinman.github.io/Hillstone-Watch/`.

## Review Focus

1. **DST and PC time zone.** A day of 2026-11-01 (clocks fall back) or a PC set to another zone must still map 7:00 PM to 7:00 PM New York. Test in Task 1.
2. **A failed check** (Cloudflare 403/5xx, HTML instead of JSON, offline) must log "check failed" and keep hunting, never crash or stop silently. Test in Task 4.
3. **Chrome restart / service worker killed mid-hunt.** The hunt resumes from storage and the alarm is recreated. Covered by `ensureAlarm()` on `onStartup` + `onInstalled` in Task 6.
4. **Overlapping triggers.** An alarm fires while a booking tab is open. No second booking must start. Test in Task 4 (`checks only while status is 'hunting'`).
5. **Bad windows.** A window where "to" is before "from", a day already in the past, or a 6th day must be rejected with a message, not saved. Test in Task 2.

---

## File Structure

```
package.json · vite.config.ts · tsconfig.json · index.html · .gitignore · README.md
.github/workflows/deploy.yml          copied from Menu Generator
src/core/types.ts                     shared types + message protocol
src/core/time.ts (+ .test.ts)         New York time maths/formatting
src/core/hunt.ts (+ .test.ts)         new hunt, add/remove day, validation
src/core/inventory.ts (+ .test.ts)    URL builder, response parser
src/core/machine.ts (+ .test.ts)      pure hunt state machine
src/core/__fixtures__/*.json          real Wisely responses (already saved)
src/main.tsx
src/ui/App.tsx · HuntCard.tsx · GuestCard.tsx · Activity.tsx · StatusPill.tsx · ExtensionBanner.tsx
src/ui/DogRails.tsx · styles.css      DogRails copied verbatim
src/ui/bridge.ts                      site side of postMessage protocol
src/assets/dogs/ (+ large/)           copied from Menu Generator
extension/build.mjs                   esbuild → extension/dist, copies static/
extension/static/manifest.json · offscreen.html · icon-128.png
extension/src/background.ts           alarms, polling, storage, alerts, booking tabs
extension/src/storage.ts              typed chrome.storage wrappers
extension/src/alerts.ts               notifications + offscreen beeps + focus tab
extension/src/offscreen.ts            WebAudio beeps
extension/src/site-bridge.ts          content script on the site origin
extension/src/wisely-selectors.ts     DOM selectors found in Task 7
extension/src/wisely-driver.ts        content script on Wisely: fill + confirm + outcome
```

---

### Task 1: Scaffold + New York time maths

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.github/workflows/deploy.yml`, `src/core/time.ts`, `src/core/time.test.ts`
- Modify: `.gitignore` (already has `.superpowers/ node_modules/ dist/`; make `dist/` → `/dist/` so `extension/dist/` is tracked)

**Interfaces:**
- Produces:
  - `nyDateTimeToMs(date: string /* YYYY-MM-DD */, time: string /* HH:MM 24h */): number`
  - `msToNyDate(ms: number): string` → `YYYY-MM-DD`
  - `formatNyTime(ms: number): string` → `"7:30 PM"`
  - `formatNyDay(date: string): string` → `"Sat, Nov 7"`
  - `todayNy(now: number): string` → `YYYY-MM-DD`

- [ ] **Step 1: Scaffold.** Copy `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `deploy.yml` from `D:\Claude projects\Menu Generator`. Rename to `hillstone-watch` / title `Hillstone Watch`. Drop `docx`, `@dnd-kit/*`, `jszip`. Add devDeps `esbuild` and `@types/chrome` (versions as in `clothing-resell/apps/extension/package.json`). Add `"types": ["node","vite/client","chrome"]`. Add `extension/src` to tsconfig `include`. Add script `"build:ext": "node extension/build.mjs"`. Run `npm install`.

- [ ] **Step 2: Write the failing tests** in `src/core/time.test.ts`:

```ts
expect(nyDateTimeToMs('2026-11-02', '12:00')).toBe(1793638800000); // real Wisely slot, EST
expect(nyDateTimeToMs('2026-11-02', '21:00')).toBe(1793671200000);
expect(nyDateTimeToMs('2026-10-28', '14:00')).toBe(1793210400000); // EDT
expect(nyDateTimeToMs('2026-11-01', '19:00')).toBe(Date.UTC(2026, 10, 2, 0, 0)); // fall-back day, EST
expect(formatNyTime(1793671200000)).toBe('9:00 PM');
expect(msToNyDate(1793671200000)).toBe('2026-11-02');
expect(formatNyDay('2026-11-07')).toBe('Sat, Nov 7');
expect(todayNy(Date.UTC(2026, 9, 27, 2, 0))).toBe('2026-10-26'); // 10 PM NY on the 26th
```

Set `test.env: { TZ: 'Asia/Tokyo' }` in `vite.config.ts` so every test runs with a non-New-York PC zone and the PC's zone can't leak in.

- [ ] **Step 3: Run** `npx vitest run src/core/time.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 4: Implement `src/core/time.ts`** with `Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ... })`. For `nyDateTimeToMs`: take the wall time as if UTC, read NY's offset at that instant from `formatToParts`, subtract, then re-check the offset once (handles DST edges). No date library.
- [ ] **Step 5: Run** `npx vitest run`. Expected: all PASS.
- [ ] **Step 6: Commit** `feat: scaffold project and New York time helpers`.

---

### Task 2: Hunt editing + validation

**Files:** Create `src/core/types.ts`, `src/core/hunt.ts`, `src/core/hunt.test.ts`

**Interfaces:**
- Consumes: `nyDateTimeToMs`, `todayNy` (Task 1)
- Produces (in `types.ts`):

```ts
export type PartySize = 1 | 2 | 3 | 4;
export interface HuntDay { date: string; from: string; to: string } // YYYY-MM-DD, HH:MM, HH:MM
export interface HuntDraft { partySize: PartySize; days: HuntDay[] }
export interface Guest { firstName: string; lastName: string; email: string; phone: string; wheelchair: boolean }
```

- Produces (in `hunt.ts`):
  - `MAX_DAYS = 5`
  - `newDraft(now: number): HuntDraft` → party 2, one day = today NY, `19:00`–`21:00`
  - `addDay(d: HuntDraft): HuntDraft` → appends a day one calendar day after the last day, **copying `days[0].from/to`**. No-op at 5 days.
  - `removeDay(d: HuntDraft, index: number): HuntDraft` → never removes the last remaining day
  - `validateDraft(d: HuntDraft, now: number): string | null` → message or `null`
  - `validateGuest(g: Guest): string | null`

- [ ] **Step 1: Write failing tests:**
  - `newDraft` has exactly 1 day, party 2.
  - `addDay` copies `from`/`to` from day 0 even when the last day has different times. Stops at 5.
  - `removeDay` on a 1-day draft returns it unchanged.
  - `validateDraft`: `to` < `from` → `'"To" must be after "From"'`; a window whose `to` is already past → `'Sat, Nov 7 is already over'` (use `formatNyDay`); duplicate dates → `'Each day can only be added once'`; 6 days → `'Up to 5 days'`; valid → `null`.
  - `validateGuest`: empty first/last name → message; email without `@` → message; phone with fewer than 10 digits → message; valid → `null`. Use obviously fake values in tests (`Test`, `test@example.com`, `555-555-5555`).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: hunt draft editing and validation`.

---

### Task 3: Inventory URL + parser

**Files:** Create `src/core/inventory.ts`, `src/core/inventory.test.ts`. Fixtures already exist: `src/core/__fixtures__/inventory-2026-11-02-party2.json` (released day, searched 7 PM, party 2) and `inventory-unreleased.json` (2026-11-03).

**Interfaces:**
- Produces (add `Slot` to `types.ts`):

```ts
export interface Slot { reservedTs: number; displayTime: string; typeId: number; typeName: string }
export interface DayInventory { released: boolean; slots: Slot[] }
export const MERCHANT_ID = 278278;
export const BOOKING_URL = 'https://reservations.getwisely.com/hillstone-park-avenue?g=midtown-parkave';
export function inventoryUrl(date: string, from: string, partySize: PartySize): string;
export function parseInventory(json: unknown, partySize: PartySize): DayInventory; // throws Error('Unexpected response') on bad shape
```

`parseInventory` keeps times with `is_available === 1` and `min_party_size <= partySize <= max_party_size`, in type order as returned (Dinner first), sorted by `reservedTs` (stable). `released = !before_day_release`.

- [ ] **Step 1: Write failing tests:**
  - `inventoryUrl('2026-11-02','19:00',2)` contains `merchant_id=278278`, `party_size=2`, `search_ts=1793664000000`, `limit=50`.
  - Released fixture, party 2 → first slot `{ reservedTs: 1793638800000, displayTime: '12:00 PM', typeName: 'Dinner', typeId: 1695 }`, and contains `9:00 PM` Dinner `1793671200000`.
  - Same fixture, party 3 → no Dinner slot at `1793638800000` (that one is max 2), but a Lunch one at `1793638800000` exists.
  - Unreleased fixture → `{ released: false, slots: [] }`.
  - `parseInventory('<html>', 2)` and `parseInventory({}, 2)` throw `'Unexpected response'`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: Wisely inventory URL and parser`.

---

### Task 4: Hunt state machine

**Files:** Create `src/core/machine.ts`, `src/core/machine.test.ts`

**Interfaces:**
- Consumes: `HuntDraft`, `HuntDay`, `Slot`, `DayInventory`, `nyDateTimeToMs`, `formatNyDay`, `formatNyTime`
- Produces (add to `types.ts`):

```ts
export type Status = 'idle' | 'hunting' | 'booking' | 'needs-you' | 'booked' | 'ended';
export interface Match { date: string; slot: Slot; partySize: PartySize }
export interface ActivityEntry { at: number; text: string; kind: 'info' | 'near' | 'hit' | 'error' }
export interface HuntState {
  status: Status; draft: HuntDraft | null; activity: ActivityEntry[];
  lastCheckedAt: number | null; current: Match | null; booked: Match | null; practice: boolean;
}
export type CheckResult = { date: string; inventory: DayInventory } | { date: string; error: string };
export type BookingOutcome = 'booked' | 'needs-you' | 'failed' | 'practice-ready';
```

- Produces (in `machine.ts`):
  - `initialState(): HuntState`
  - `ACTIVITY_LIMIT = 50` (newest first, trimmed)
  - `start(s, draft, now, practice = false): HuntState` → `hunting`, activity "Hunt started" (or "Practice run started")
  - `stop(s, now): HuntState` → `idle`, "Stopped"
  - `daysToCheck(s, now): HuntDay[]` → days whose window end is still in the future, only when `status === 'hunting'`, else `[]`
  - `onChecks(s, results: CheckResult[], now): { state: HuntState; book: Match | null }`
  - `onBookingOutcome(s, outcome: BookingOutcome, detail: string, now): HuntState`
  - `onBookingTimeout(s, now): HuntState` (used when status is `booking` for >90 s)

Rules for `onChecks`:
- Ignore everything unless `status === 'hunting'` (overlapping triggers).
- Matching slot: `nyDateTimeToMs(date, from) <= reservedTs <= nyDateTimeToMs(date, to)`. Pick earliest `date`, then earliest `reservedTs` → status `booking`, `current = match`, activity kind `hit`: `"Found Sat, Nov 7 7:30 PM — booking"`, and return it as `book`.
- No match: one `info` line per check round: `"Nothing in window"`, or `"Nov 3 not released yet"`. If a released day has slots outside the window, log a `near` line with the closest one: `"Nov 2 closest: 9:00 PM"`.
- An error result logs kind `error`, `"Check failed: <error>"`, and status stays `hunting`.
- After updating, if status is still `hunting` and `daysToCheck` is empty → status `ended`, activity `"All days passed — no table found"`.
- Always set `lastCheckedAt = now`.

Rules for `onBookingOutcome`:
- `booked` → `status 'booked'`, `booked = current`, `current = null`, hit entry `"Booked Sat, Nov 7 7:30 PM, party of 2"`.
- `needs-you` → `status 'needs-you'` (no timeout; a human is in the loop).
- `failed` → back to `hunting`, `current = null`, error entry with detail.
- `practice-ready` → `idle`, info entry `"Practice run filled the form — not confirmed"`.

- [ ] **Step 1: Write failing tests** (use the released fixture via `parseInventory` for slots; `now = Date.UTC(2026, 10, 1, 12)`):
  - Window 2026-11-02 19:00–21:00, party 2 → `book` is the 9:00 PM Dinner slot, status `booking`.
  - Window 12:00–12:00 → matches `1793638800000` (inclusive ends).
  - Window 17:00–20:30 → `book` null, status `hunting`, a `near` entry mentioning `9:00 PM`.
  - Two days both matching → earliest date wins.
  - `onChecks` while status `booking` → state unchanged, `book` null.
  - Error result → status still `hunting`, `error` entry starts with `Check failed`.
  - `now` after the only day's `to` → status `ended`.
  - `booked` outcome → status `booked` and `daysToCheck` returns `[]`.
  - `failed` outcome → status `hunting`.
  - Activity never exceeds 50 entries.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: hunt state machine`.

---

### Task 5: Site UI + bridge

**Files:** Create `src/main.tsx`, `src/ui/*` (see File Structure), copy `Menu Generator/src/ui/DogRails.tsx` and the dog section of its `styles.css` (lines ~264–335 plus the `.app > :not(.dog-rail)` rule and the `--rail` breakpoints) and `src/assets/dogs/**`. Test: `src/ui/bridge.test.ts`.

**Interfaces:**
- Consumes: everything in `core/`.
- Produces the message protocol in `types.ts` (also used by Task 6):

```ts
export type SiteToExt =
  | { type: 'hello' } | { type: 'start'; draft: HuntDraft; practice?: boolean } | { type: 'stop' }
  | { type: 'saveGuest'; guest: Guest };
export interface ExtSnapshot { state: HuntState; guest: { firstName: string; lastName: string; saved: boolean; wheelchair: boolean } | null }
export type ExtToSite = { type: 'snapshot'; snapshot: ExtSnapshot } | { type: 'error'; message: string };
// Envelope on window.postMessage: { source: 'hw-site', msg: SiteToExt } and { source: 'hw-ext', msg: ExtToSite }
```

The snapshot never carries email or phone back to the page.

- `bridge.ts`: `connect(win: Window, onMessage: (m: ExtToSite) => void, timeoutMs = 1500): Promise<boolean>` (sends `hello`, resolves `false` if no snapshot in time) and `send(win: Window, msg: SiteToExt): void`.

- [ ] **Step 1: Write failing tests** for `bridge.ts` with a fake window (an `EventTarget` with `postMessage` that dispatches `MessageEvent`s): resolves `true` when a `hw-ext` snapshot arrives; resolves `false` after the timeout; ignores messages without `source: 'hw-ext'`.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement `bridge.ts`.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Build the page** to match the approved mockup `.superpowers/brainstorm/1795-1793040910/content/main-screen-v2.html`:
  - Top bar "Hillstone Watch" + `StatusPill`: Idle / Hunting · last checked Ns ago (ticks every second) / Booking… / Needs you (red) / Booked / Ended.
  - `HuntCard`: party 1-2-3-4 segmented buttons; one row per day (`<input type=date>`, `<input type=time>` from/to; ✕ only when >1 day); "+ Add another day" link (hidden at 5) using `addDay`; inline `validateDraft` message; Start / Stop button. The form is locked while not `idle`/`booked`/`ended`.
  - `GuestCard`: shows name; email/phone shown as "saved"; wheelchair Yes/No. "Edit details" opens inline inputs (`validateGuest`) and sends `saveGuest`. Text: "Saved in this browser only — never in the public code." Start is disabled until a guest is saved.
  - `Activity`: newest first, time via `formatNyTime`, `hit` green bold, `error` red.
  - Booked banner: "✓ Booked — Sat, Nov 7, 7:30 PM, party of 2".
  - Small link under Activity: "Practice run (fills the form, doesn't confirm)". Sends `start` with `practice: true`.
  - `ExtensionBanner` when `connect` returns false: "Extension not found" + numbered install steps (chrome://extensions → Developer mode → Load unpacked → pick `extension/dist`), and a one-liner "Works only while Chrome is open and the PC is awake." Start disabled.
- [ ] **Step 6: Verify** `npm run build` passes and `npm run dev` shows the page with dog rails and the extension banner (no extension yet). Check at 1500px, 1300px and 700px widths.
- [ ] **Step 7: Commit** `feat: control panel site`.

---

### Task 6: Extension core — storage, polling, alerts, site bridge

**Files:** Create `extension/build.mjs` (pattern: `clothing-resell/apps/extension/build.mjs`; entry points `background.ts`, `offscreen.ts`, `site-bridge.ts`, `wisely-driver.ts`; `format: 'esm'` for background/offscreen, `'iife'` for the two content scripts), `extension/static/manifest.json`, `extension/static/offscreen.html`, `extension/static/icon-128.png` (green square with "H"), `extension/src/background.ts`, `storage.ts`, `alerts.ts`, `offscreen.ts`, `site-bridge.ts`, a stub `wisely-driver.ts`.

**Interfaces:**
- Consumes: `machine.ts`, `inventory.ts`, protocol types.
- `storage.ts`: `loadState(): Promise<HuntState>`, `saveState(s: HuntState)`, `loadGuest(): Promise<Guest | null>`, `saveGuest(g: Guest)`. Key names: `hw:state`, `hw:guest`.
- `alerts.ts`: `alertBooked(m: Match)` (notification + 3 beeps at 880 Hz), `alertNeedsYou(tabId: number)` (notification with `requireInteraction: true` + 8 beeps at 660 Hz + `chrome.tabs.update(tabId,{active:true})` + `chrome.windows.update(windowId,{focused:true})`), `alertEnded()`. Beeps: same square-wave pattern as the confirmed prototype `.superpowers/brainstorm/1795-1793040910/content/alert-test.html`, played in the offscreen document (`reasons: ['AUDIO_PLAYBACK']`). Clicking a notification focuses the relevant tab.
- Runtime messages from content scripts to background: `{ kind: 'site', msg: SiteToExt }`, `{ kind: 'getJob' }` → `{ match, guest, practice } | null`, `{ kind: 'outcome', outcome: BookingOutcome, detail: string }`.

Manifest essentials:

```json
{
  "manifest_version": 3, "name": "Hillstone Watch", "version": "0.1.0",
  "permissions": ["alarms", "storage", "notifications", "offscreen", "tabs"],
  "host_permissions": ["https://loyaltyapi.wisely.io/*", "https://reservations.getwisely.com/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    { "matches": ["https://alessisheinman.github.io/Hillstone-Watch/*", "http://localhost:5173/*"], "js": ["site-bridge.js"] },
    { "matches": ["https://reservations.getwisely.com/hillstone-park-avenue*"], "js": ["wisely-driver.js"], "run_at": "document_idle" }
  ],
  "icons": { "128": "icon-128.png" }
}
```

Background behaviour:
- `ensureAlarm()` on `runtime.onInstalled` and `runtime.onStartup`: a `hw-check` alarm with `periodInMinutes: 0.5` exists while status is `hunting`, and is cleared otherwise.
- On `hw-check`: `daysToCheck` → fetch each day's `inventoryUrl` sequentially, `parseInventory` (wrap fetch/parse errors into `{date, error}`) → `onChecks` → save → broadcast snapshot to every site tab → if `book`, open the booking tab (`chrome.tabs.create({ url: BOOKING_URL, active: false })`), remember its id in `chrome.storage.session` (`hw:job`), and start a 90 s `hw-booking-timeout` alarm.
- `start` also runs one check immediately instead of waiting 30 s.
- On `outcome`: `onBookingOutcome` → save → alerts (`booked` → `alertBooked` and leave the tab open; `needs-you` → `alertNeedsYou`; `failed` → close the tab) → clear the timeout alarm for anything but `needs-you` → `ensureAlarm()`.
- `stop` closes any open booking tab.
- `site-bridge.ts`: relays `hw-site` window messages to the background, and relays snapshots back with `source: 'hw-ext'`. It also listens for `chrome.storage.onChanged` on `hw:state` to push live snapshots.

- [ ] **Step 1: Implement the files above.** `wisely-driver.ts` is a stub for now that sends `{ kind: 'outcome', outcome: 'failed', detail: 'driver not built yet' }`.
- [ ] **Step 2: Build** `npm run build:ext`. Expected: `extension/dist/` contains `manifest.json`, `background.js`, `offscreen.html`, `offscreen.js`, `site-bridge.js`, `wisely-driver.js`, `icon-128.png`.
- [ ] **Step 3: Verify in Chrome** (load unpacked `extension/dist`, `npm run dev`):
  - The banner disappears and the status is Idle.
  - Save a fake guest (`Test` / `Person` / `test@example.com` / `555-555-5555`).
  - Start a hunt for a released day with a window that has no slots → an activity line roughly every 30 s; still updating with the tab in the background for 3+ minutes.
  - Start a hunt whose window contains an open slot → the booking tab opens, the stub reports failed, the tab closes, and hunting resumes.
  - Reload the extension mid-hunt → it keeps hunting.
  - Stop → Idle.
- [ ] **Step 4: Commit** `feat: extension polling, alerts and site bridge` (including `extension/dist`).

---

### Task 7: Wisely driver — find the page's controls, practice run

**Files:** Create `extension/src/wisely-selectors.ts`; implement `extension/src/wisely-driver.ts`.

**Interfaces:**
- Consumes: runtime messages `getJob` / `outcome` (Task 6).
- `wisely-selectors.ts` exports one `const SEL = { … }` object plus `findSlotButton(typeName: string, displayTime: string): HTMLElement | null`. Each entry has a comment saying what it is on the page.

- [ ] **Step 1: Discovery (Chrome tools, read-only).** Open `BOOKING_URL` and record selectors for: party-size select, date picker, time select, the per-type sections ("Dinner", "Lunch") and their time buttons, then click an open time button and record the guest form fields (first name, last name, email, phone, country code if present), the wheelchair/accessibility question, the marketing email and SMS opt-ins, and the final confirm button. **Do not press the final confirm.** Also note the confirmation-page marker text, the error/"no longer available" marker, and how the Arkose puzzle appears (iframe host such as `olo-api.arkoselabs.com` or `client-api.arkoselabs.com`).
- [ ] **Step 2: Implement the driver.**
  - `getJob` → if none, do nothing.
  - Set party / date / time to the job's values. Wisely is a Vue app, so set values through the native value setter and dispatch `input` + `change`.
  - Wait (MutationObserver, 15 s max) for `findSlotButton(slot.typeName, slot.displayTime)` and click it. If it's missing → `failed`, `"Slot no longer listed"`.
  - Fill the guest fields, set wheelchair to match `guest.wheelchair`, leave any other optional fields (occasion, notes) blank, and make sure both marketing opt-ins are **unchecked**.
  - `practice` → send `practice-ready` and stop here.
  - Otherwise click confirm, then watch: confirmation marker → `booked`; Arkose iframe visible → `needs-you` (keep watching after that; when the confirmation marker appears → `booked`); error marker → `failed` with its text; nothing after 60 s → `failed`, `"No response from Wisely"`.
- [ ] **Step 3: Verify with a practice run** from the site, using the fake guest, on a released day with an open slot. Expected: the tab opens, the right slot is chosen, the form fills with the fake details, both opt-ins are unticked, nothing is submitted, the activity says "Practice run filled the form — not confirmed", and the status is Idle. Repeat for party 4 and a Lunch slot.
- [ ] **Step 4: Commit** `feat: Wisely booking driver with practice run`.

---

### Task 8: Publish + real end-to-end test (Adam present)

**Files:** Create `README.md` (what it is, install-the-extension steps, Practice run, "never put guest details in the code").

- [ ] **Step 1: Ask Adam before publishing.** Then create the public repo `alessisheinman/Hillstone-Watch` with `gh repo create --public --source . --push`, enable Pages (GitHub Actions source), and wait for the deploy workflow to go green. Confirm `https://alessisheinman.github.io/Hillstone-Watch/` loads and the installed extension is detected there.
- [ ] **Step 2: Jane Doe test booking (spec: End-to-end test booking).** Adam types `Jane` / `Doe` with **his own** email and phone into Edit details. Pick a released day with an open slot and start a real hunt. Expected: either booked (green notification + 3 beeps, site shows "Booked …") or needs-you (red notification, Wisely tab in front; after the puzzle is solved → booked). Adam cancels through Wisely's confirmation email/SMS right away, and we confirm the cancellation.
- [ ] **Step 3: Switch the details back to the client's** (Adam enters them in Edit details).
- [ ] **Step 4: Commit** any fixes from the live test, rebuild `extension/dist`, push.

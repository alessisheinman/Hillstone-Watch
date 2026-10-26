# Hillstone Watch — design

Date: 2026-10-26 · Owner: Adam · Status: draft for approval

## Why

Hillstone Park Avenue South (NYC) is very hard to book. Tables only appear when someone cancels or a new
day opens, and the only way to get one today is to keep refreshing the booking page, at a desk and on a
phone, all day. Tables that open get taken within minutes.

Hillstone Watch does the refreshing. Adam sets a day, a time window and a party size, and the moment a
matching table appears it books it, with no second confirmation, because the head count and time were
already confirmed when the hunt was set up and any pause loses the table.

It is the third tool for the same client as the kitchen Menu Generator and the Proposed Menu Generator, and
it carries over their scrolling dog-photo rails. Everything else is its own design.

## Goals

- Pick a party size (1–4) and **one day** with a from–to time window. That is the normal use.
- Optionally add more days (max 5 total). Each added day copies the first day's window, editable per day.
- Press Start; it checks Hillstone's availability on its own while Chrome is open.
- When a table inside any window appears, book it immediately for the saved guest — no "are you sure?" step.
- First successful booking stops the whole hunt.
- Alert Adam even when he is on another tab, another app, or Chrome is minimised: Windows notification +
  sound, for both "booked" and "needs you".
- Guest details entered once and remembered.
- Same dog-photo rails as the other two sites.

## Non-goals

- Running when the computer is asleep or Chrome is closed. A Chrome tab/extension on Adam's computer is
  enough (Adam's decision). No server, no hosting costs.
- Phone app or phone alerts.
- Other Hillstone locations or other restaurants.
- Multiple guests / guest profiles. It is always the same guest.

## Anti-goals (failure even if it "works")

- **Getting around Wisely's bot check.** Booking is protected by Arkose Labs (see below). The tool must never
  solve, skip, fake or replay Arkose tokens, or call the create-reservation API directly. Booking always
  happens on Wisely's real page, in Adam's normal Chrome, and if Arkose shows a puzzle a human solves it.
- **Guest details in the repo.** The repos for this client are public. Name, email and phone must never be
  in source, tests, fixtures, commit messages or screenshots — they live only in Adam's browser storage.
- Booking more than one table per hunt, or booking outside the window/party size that was set.
- Hammering Wisely hard enough to get Adam's IP blocked by Cloudflare.
- A silent failure: if the hunt stops for any reason, Adam can see why.

## What we found (recon, 2026-10-26)

- The "Make a Reservation" button on hillstonerestaurant.com calls the **Wisely** widget:
  `https://reservations.getwisely.com/hillstone-park-avenue?g=midtown-parkave`. Merchant id **278278**.
- Availability: `GET https://loyaltyapi.wisely.io/v2/web/reservations/inventory?merchant_id=278278&party_size=N&search_ts=<epoch ms>&show_reservation_types=1&limit=N`
  - Responds `Access-Control-Allow-Origin: *`, so a page on any origin (or an extension) can call it with no
    login.
  - Returns reservation types (`Dinner` id 1695, `Lunch` id 1862), each with `times[]`, `max_party_size: 4`,
    `times_window_mins: 61`. The booking page shows open times near the searched time (e.g. searching 7:00 PM
    returned a 9:45 PM dinner slot and 3:00–3:30 PM lunch slots), so one search does not cover a whole
    window — the builder must work out the search pattern needed to cover a from–to window.
  - Closures: `GET https://api.wisely.io/host/reservations_widget/closures?merchant_id=278278`.
- Booking: Wisely's booking app sends an `arkose-token` header on create-reservation, and the feature flag
  `featureFlags/arkoseEnabled` is **on** for Hillstone. Arkose often passes invisibly in a normal browser but
  can show a puzzle.
- Hillstone's online max party is 4. Their page says resale/trading of reservations is prohibited (this tool
  books for the client herself, so that doesn't apply).

## How it works (decided)

Two pieces, in one new public GitHub repo:

1. **The site** — static Vite + React + TypeScript, GitHub Pages via Actions, same stack and deploy as
   Menu Generator. It is the control panel: hunt setup, guest details, status, activity list, dog rails.
2. **A Chrome extension** (Manifest V3, loaded unpacked on Adam's Chrome). It does the actual work so it keeps
   going when the site tab is in the background (Chrome throttles background tabs):
   - holds the active hunt and guest details in `chrome.storage.local`;
   - checks availability on a timer;
   - on a match, opens Wisely's real booking page, picks the slot, fills the guest form, and presses confirm;
   - raises the alerts (Windows notification + sound), and brings the Wisely tab to the front when a human is
     needed;
   - reports status/activity back to the site.

The site talks to the extension through a content script the extension injects on the site's own origin
(builder may choose `externally_connectable` instead). If the extension isn't detected, the site shows a
clear "install the extension" banner with the steps, and Start is disabled.

### Hunt flow

1. Adam sets party size + day(s) + window(s) and presses Start.
2. Every ~30 s the extension checks availability for each day still in the future.
3. A slot counts as a match when its time is inside that day's window (inclusive of both ends) for the set
   party size. If several match at once, take the earliest day, then the earliest time.
4. Booking: open the Wisely page, select the slot, fill First name, Last name, Email, Phone, wheelchair = No,
   leave any marketing/SMS opt-in unticked, submit.
5. Outcomes:
   - **Booked** → stop the hunt, "Booked" notification + 3 beeps, show day/time/party on the site.
   - **Puzzle shown** → "Needs you" notification that stays until clicked + repeated beeps, Wisely tab to the
     front. When Adam solves it, Wisely continues and the outcome is re-detected.
   - **Slot gone / error** → log it, close that tab, keep hunting.
6. A day whose window has fully passed drops out; when none are left, the hunt ends with a notice.
7. Stop button ends the hunt at any time.

### The page (mockup approved in brainstorming)

Light background, dark-green accent (to tell it apart from the light-red kitchen site and dark proposal
site). Top bar "Hillstone Watch" with a live status pill ("Hunting · last checked 14s ago" / "Idle" /
"Booked" / "Needs you"). Left card "The hunt": party size 1-2-3-4 buttons, one day row (date, from, to),
small "+ Add another day" link, Start/Stop button. Right column: "Booking for" card (name shown; email and
phone shown as "saved"; Edit details), then "Activity" list (time-stamped checks, near-misses, outcomes).
Dog rails on both sides; strip under the top bar on narrow screens; click a photo to enlarge — reuse
Menu Generator's `DogRails.tsx` and its CSS, and copy its `src/assets/dogs/` (thumbs + `large/`).

Alert sound/notification behaviour was prototyped and confirmed working on Adam's machine (beeps + Windows
pop-up while on another tab).

## Constraints

- Public repo: guest details only ever in browser/extension storage; `.gitignore` the brainstorm folder
  (`.superpowers/`).
- Check interval no faster than 30 s (also Chrome's `chrome.alarms` minimum).
- Must work with Chrome on Windows 11.
- All days/times are New York time (America/New_York), regardless of the PC's clock setting. *(my call)*
- Any optional Wisely form fields beyond name/email/phone/wheelchair (occasion, notes, etc.) are left blank.
  *(my call)*
- Works only while Chrome is running and the PC is awake; the site says so in one line.

## Left to the builder

- Exact search pattern against the inventory endpoint to cover a window, and parsing of `times[]`.
- How the extension drives Wisely's page (URL params if supported, otherwise UI steps) and how it detects
  booked / puzzle / failed. Discovering the exact form fields happens at build time, without submitting real
  bookings (test the fill step up to, but not including, the final confirm; the first real booking is Adam's).
- Site ↔ extension messaging mechanism.
- Repo/site name (working name "Hillstone Watch"), extension icon, sound design.
- Activity list length/retention.
- Tests for the matching logic (window inclusion, earliest pick, day expiry) — required; UI/extension
  automation tests optional.

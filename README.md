# Hillstone Watch

Watches Hillstone Park Avenue South (NYC) on Wisely and books the first table that fits a day, time window and
party size — straight away, with no second "are you sure?".

Two parts:

- **The site** (`src/`, GitHub Pages) — the control panel: party size, day(s) and time window, guest details,
  live status and activity.
- **The Chrome extension** (`extension/`) — does the work in the background while Chrome is open: checks Wisely
  every 30 seconds, opens Wisely's real booking page when a table appears, fills it in and presses
  "Complete Reservation", and alerts you (Windows notification + sound).

Wisely protects bookings with a "prove you're human" check. This tool never tries to get around it: if Wisely
shows a puzzle, you get a loud alert, the Wisely tab jumps to the front, you solve it and the booking finishes.

## Install the extension (once)

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose this repo's `extension/dist` folder.
3. Open the site. The "Extension not found" banner should disappear.

After pulling a new version, press the reload arrow on the extension's card in `chrome://extensions`.

## Using it

1. **Booking for → Add guest details** (once). They are saved inside the extension in this browser only.
2. Pick party size, the day and the time window. Add up to 4 more days if you like — each copies the first
   day's times.
3. **Start hunting.** Leave Chrome open and the PC awake. You can use other tabs and apps.
4. When a table is booked you get a notification and three beeps, and the site shows what was booked.

Hillstone releases tables 7 days ahead; a day further out shows "not released yet" and is booked the moment it
opens. Online bookings max out at 4 people.

**Practice run** (under Activity) does everything except press "Complete Reservation" — handy for checking it
still works if Wisely changes its page.

## Never commit guest details

This repo is public. Names, emails and phone numbers live only in the extension's storage — never in code,
tests, fixtures or commit messages.

## Development

```
npm install
npm test               # core logic
npm run dev            # site at http://localhost:5173 (the extension also works there)
npm run build:ext      # rebuild extension/dist (committed, so it can be loaded without Node)
node scripts/smoke-extension.mjs poll|practice   # end-to-end in a throwaway Chromium with fake details
```

If Wisely changes its booking page, update `extension/src/wisely-selectors.ts` and check with a practice run.

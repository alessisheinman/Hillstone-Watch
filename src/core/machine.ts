import { formatNyDay, formatNyTime, nyDateTimeToMs } from './time';
import type { ActivityEntry, BookingOutcome, CheckResult, HuntDay, HuntDraft, HuntState, Match, Slot } from './types';

// The whole hunt as pure functions: the extension feeds in check results and booking outcomes,
// saves what comes back, and acts on `book`.

export const ACTIVITY_LIMIT = 50;

export function initialState(): HuntState {
  return { status: 'idle', draft: null, activity: [], lastCheckedAt: null, current: null, booked: null, practice: false };
}

function log(s: HuntState, now: number, text: string, kind: ActivityEntry['kind'] = 'info'): HuntState {
  return { ...s, activity: [{ at: now, text, kind }, ...s.activity].slice(0, ACTIVITY_LIMIT) };
}

const label = (m: Match) => `${formatNyDay(m.date)} ${m.slot.displayTime}`;
const windowOf = (d: HuntDay) => [nyDateTimeToMs(d.date, d.from), nyDateTimeToMs(d.date, d.to)] as const;

export function start(s: HuntState, draft: HuntDraft, now: number, practice = false): HuntState {
  const next: HuntState = { ...s, status: 'hunting', draft, current: null, booked: null, practice, lastCheckedAt: null };
  return log(next, now, practice ? 'Practice run started' : 'Hunt started');
}

export function stop(s: HuntState, now: number): HuntState {
  return log({ ...s, status: 'idle', current: null }, now, 'Stopped');
}

export function daysToCheck(s: HuntState, now: number): HuntDay[] {
  if (s.status !== 'hunting' || !s.draft) return [];
  return s.draft.days.filter((d) => windowOf(d)[1] > now);
}

/** The open time nearest to the window, for the "closest" hint. */
function closest(slots: Slot[], from: number, to: number): Slot {
  const gap = (t: number) => (t < from ? from - t : t - to);
  return slots.reduce((a, b) => (gap(b.reservedTs) < gap(a.reservedTs) ? b : a));
}

export function onChecks(s: HuntState, results: CheckResult[], now: number): { state: HuntState; book: Match | null } {
  if (s.status !== 'hunting' || !s.draft) return { state: s, book: null };
  const { draft } = s;
  let state: HuntState = { ...s, lastCheckedAt: now };
  const matches: Match[] = [];
  const notes: string[] = [];
  let near = false;

  for (const r of results) {
    const day = draft.days.find((d) => d.date === r.date);
    if (!day) continue;
    if ('error' in r) {
      state = log(state, now, `Check failed (${formatNyDay(r.date)}): ${r.error}`, 'error');
      continue;
    }
    if (!r.inventory.released) {
      notes.push(`${formatNyDay(r.date)} not released yet`);
      continue;
    }
    const [from, to] = windowOf(day);
    const inWindow = r.inventory.slots.filter((x) => x.reservedTs >= from && x.reservedTs <= to);
    if (inWindow.length) {
      matches.push({ date: r.date, slot: inWindow[0], partySize: draft.partySize });
    } else if (r.inventory.slots.length) {
      near = true;
      notes.push(`${formatNyDay(r.date)} closest ${formatNyTime(closest(r.inventory.slots, from, to).reservedTs)}`);
    } else {
      notes.push(`${formatNyDay(r.date)} nothing open nearby`);
    }
  }

  if (matches.length) {
    const book = matches.sort((a, b) => a.date.localeCompare(b.date) || a.slot.reservedTs - b.slot.reservedTs)[0];
    state = log({ ...state, status: 'booking', current: book }, now, `Found ${label(book)} — booking`, 'hit');
    return { state, book };
  }

  if (notes.length || !results.length) {
    state = log(state, now, ['Nothing in window', ...notes].join(' — '), near ? 'near' : 'info');
  }
  if (daysToCheck(state, now).length === 0) {
    state = log({ ...state, status: 'ended' }, now, 'All days passed — no table found');
  }
  return { state, book: null };
}

export function onBookingOutcome(s: HuntState, outcome: BookingOutcome, detail: string, now: number): HuntState {
  if ((s.status !== 'booking' && s.status !== 'needs-you') || !s.current) return s;
  const m = s.current;
  switch (outcome) {
    case 'booked':
      return log({ ...s, status: 'booked', booked: m, current: null }, now, `Booked ${label(m)}, party of ${m.partySize}`, 'hit');
    case 'needs-you':
      return log({ ...s, status: 'needs-you' }, now, 'Wisely wants a puzzle solved — waiting for you', 'error');
    case 'failed':
      return log({ ...s, status: 'hunting', current: null }, now, `Booking failed: ${detail} — still hunting`, 'error');
    case 'practice-ready':
      return log({ ...s, status: 'idle', current: null }, now, 'Practice run filled the form — not confirmed');
  }
}

export function onBookingTimeout(s: HuntState, now: number): HuntState {
  if (s.status !== 'booking') return s;
  return onBookingOutcome(s, 'failed', "booking page didn't respond", now);
}

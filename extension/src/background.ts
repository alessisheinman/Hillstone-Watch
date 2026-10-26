import { mergeGuest, validateDraft, validateGuest } from '../../src/core/hunt';
import { BOOKING_URL, inventoryUrl, mergeInventories, parseInventory, searchPoints } from '../../src/core/inventory';
import { canStart, daysToCheck, note, onBookingOutcome, onBookingTimeout, onChecks, recoverAfterRestart, start, stop } from '../../src/core/machine';
import type { BookingOutcome, CheckResult, DayInventory, ExtSnapshot, ExtToSite, Guest, HuntDay, HuntState, PartySize, SiteToExt } from '../../src/core/types';
import { alertBooked, alertEnded, alertNeedsYou, alertUnconfirmed, focusTab } from './alerts';
import { loadGuest, loadJobTab, loadState, saveGuest, saveJobTab, saveState } from './storage';

const CHECK = 'hw-check';
const BOOKING_TIMEOUT = 'hw-booking-timeout';

// Every read-modify-write of the hunt goes through this queue so two events can't interleave.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  queue = run.catch(() => undefined);
  return run;
}

async function ensureAlarm(s: HuntState) {
  if (s.status === 'hunting') {
    if (!(await chrome.alarms.get(CHECK))) await chrome.alarms.create(CHECK, { periodInMinutes: 0.5 });
  } else {
    await chrome.alarms.clear(CHECK);
  }
}

async function snapshot(): Promise<ExtSnapshot> {
  const [state, guest] = await Promise.all([loadState(), loadGuest()]);
  return {
    state,
    guest: guest && { firstName: guest.firstName, lastName: guest.lastName, wheelchair: guest.wheelchair, saved: true },
  };
}

async function closeJobTab() {
  const tabId = await loadJobTab();
  await saveJobTab(null);
  await chrome.alarms.clear(BOOKING_TIMEOUT);
  if (tabId !== null) await chrome.tabs.remove(tabId).catch(() => undefined);
}

async function fetchDay(day: HuntDay, partySize: PartySize): Promise<CheckResult> {
  try {
    const parts: DayInventory[] = [];
    for (const time of searchPoints(day)) {
      const res = await fetch(inventoryUrl(day.date, time, partySize), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      parts.push(parseInventory(await res.json().catch(() => null), partySize));
    }
    return { date: day.date, inventory: mergeInventories(parts) };
  } catch (e) {
    return { date: day.date, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Never let a surprise stop the hunt silently: log it where Adam can see it. */
async function runCheck() {
  try {
    await checkOnce();
  } catch (e) {
    await serial(async () => saveState(note(await loadState(), Date.now(), `Check crashed: ${e instanceof Error ? e.message : e}`, 'error')));
  }
}

async function checkOnce() {
  const before = await loadState();
  const days = daysToCheck(before, Date.now());
  if (before.status !== 'hunting' || !before.draft) return;
  // Network calls happen outside the queue so a Stop click never waits on Wisely.
  const results: CheckResult[] = [];
  for (const d of days) results.push(await fetchDay(d, before.draft.partySize));

  await serial(async () => {
    const { state, book } = onChecks(await loadState(), results, Date.now());
    await saveState(state);
    await ensureAlarm(state);
    if (book) {
      const tab = await chrome.tabs.create({ url: BOOKING_URL, active: false });
      await saveJobTab(tab.id ?? null);
      await chrome.alarms.create(BOOKING_TIMEOUT, { delayInMinutes: 1.5 });
    } else if (state.status === 'ended') {
      await alertEnded();
    }
  });
}

async function handleSite(msg: SiteToExt): Promise<ExtToSite> {
  const error = (message: string): ExtToSite => ({ type: 'error', message });
  switch (msg.type) {
    case 'hello':
      break;
    case 'start': {
      const problem = validateDraft(msg.draft, Date.now()) ?? (!(await loadGuest()) ? 'Save the guest details first' : null);
      if (problem) return error(problem);
      const started = await serial(async () => {
        const current = await loadState();
        if (!canStart(current)) return false; // already hunting or booking — one at a time
        const next = start(current, msg.draft, Date.now(), !!msg.practice);
        await saveState(next);
        await ensureAlarm(next);
        return true;
      });
      if (!started) return error('A hunt is already running — stop it first');
      void runCheck(); // first check now, not in 30 s
      break;
    }
    case 'stop':
      await serial(async () => {
        await closeJobTab();
        const next = stop(await loadState(), Date.now());
        await saveState(next);
        await ensureAlarm(next);
      });
      break;
    case 'saveGuest': {
      const merged = mergeGuest(await loadGuest(), msg.guest);
      const problem = validateGuest(merged);
      if (problem) return error(problem);
      await saveGuest(merged);
      break;
    }
  }
  return { type: 'snapshot', snapshot: await snapshot() };
}

async function handleOutcome(tabId: number | undefined, outcome: BookingOutcome, detail: string) {
  await serial(async () => {
    const jobTab = await loadJobTab();
    if (tabId === undefined || tabId !== jobTab) return; // a Wisely tab we didn't open
    const before = await loadState();
    const next = onBookingOutcome(before, outcome, detail, Date.now());
    if (next === before) return;
    await saveState(next);
    await chrome.alarms.clear(BOOKING_TIMEOUT);
    if (outcome === 'submitting') {
      // Wisely is working on it; if nothing comes back in 3 minutes the result counts as unconfirmed.
      await chrome.alarms.create(BOOKING_TIMEOUT, { delayInMinutes: 3 });
    } else if (next.status === 'booked' && next.booked) {
      await saveJobTab(null); // leave the confirmation open to look at
      await alertBooked(next.booked);
    } else if (next.status === 'needs-you') {
      await alertNeedsYou(tabId);
    } else if (next.status === 'unconfirmed') {
      await saveJobTab(null); // leave Wisely's page open so Adam can see what happened
      await alertUnconfirmed(tabId);
    } else if (outcome === 'practice-ready') {
      await saveJobTab(null);
    } else {
      await closeJobTab(); // failed before submitting, or Wisely refused: try again on the next opening
    }
    await ensureAlarm(next);
  });
}

async function jobFor(tabId: number | undefined): Promise<{ match: HuntState['current']; guest: Guest; practice: boolean } | null> {
  const [jobTab, state, guest] = await Promise.all([loadJobTab(), loadState(), loadGuest()]);
  if (tabId === undefined || tabId !== jobTab || !guest || !state.current) return null;
  if (state.status !== 'booking' && state.status !== 'needs-you') return null;
  return { match: state.current, guest, practice: state.practice };
}

type Incoming =
  | { kind: 'site'; msg: SiteToExt }
  | { kind: 'getJob' }
  | { kind: 'outcome'; outcome: BookingOutcome; detail: string };

chrome.runtime.onMessage.addListener((m: Incoming, sender, sendResponse) => {
  if (m.kind === 'site') handleSite(m.msg).then(sendResponse);
  else if (m.kind === 'getJob') jobFor(sender.tab?.id).then(sendResponse);
  else if (m.kind === 'outcome') handleOutcome(sender.tab?.id, m.outcome, m.detail).then(() => sendResponse(true));
  else return false;
  return true; // answering asynchronously
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === CHECK) void runCheck();
  if (a.name === BOOKING_TIMEOUT) {
    void serial(async () => {
      const before = await loadState();
      const next = onBookingTimeout(before, Date.now());
      if (next === before) return;
      await saveState(next);
      if (next.status === 'unconfirmed') {
        const tabId = await loadJobTab();
        await saveJobTab(null);
        await alertUnconfirmed(tabId);
      } else {
        await closeJobTab();
      }
      await ensureAlarm(next);
    });
  }
});

// Closing the Wisely tab mid-booking counts as a failed attempt, so hunting carries on.
chrome.tabs.onRemoved.addListener((tabId) => {
  void loadJobTab().then((jobTab) => {
    if (jobTab === tabId) void handleOutcome(tabId, 'failed', 'Wisely tab was closed');
  });
});

chrome.notifications.onClicked.addListener(() => {
  void loadJobTab().then((tabId) => {
    if (tabId !== null) void focusTab(tabId);
  });
});

// A restart loses the Wisely tab, so a booking in flight is resolved here rather than left hanging.
const resume = () =>
  void serial(async () => {
    const before = await loadState();
    const next = (await loadJobTab()) === null ? recoverAfterRestart(before, Date.now()) : before;
    if (next !== before) await saveState(next);
    if (next.status === 'unconfirmed') await alertUnconfirmed(null);
    await ensureAlarm(next);
  });
chrome.runtime.onStartup.addListener(resume);
chrome.runtime.onInstalled.addListener(resume);

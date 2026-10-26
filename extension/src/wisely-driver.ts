import { isConfirmationPath } from '../../src/core/inventory';
import type { BookingOutcome, Guest, Match } from '../../src/core/types';
import { findSlotButton, OPT_IN_LABEL, SEL } from './wisely-selectors';

// Runs on Wisely's real booking page in a tab the extension opened. It fills in what a person would and presses
// "Complete Reservation". Wisely's own bot check (Arkose) runs as normal; if it shows a puzzle, a person solves it.

interface Job { match: Match; guest: Guest; practice: boolean }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).getBoundingClientRect().width > 0;

function report(outcome: BookingOutcome, detail = '') {
  return chrome.runtime.sendMessage({ kind: 'outcome', outcome, detail });
}

async function waitFor<T>(find: () => T | null | undefined | false, what: string, timeoutMs = 15_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const found = find();
    if (found) return found;
    if (Date.now() > end) throw new Error(`${what} not found`);
    await sleep(150);
  }
}

/** Vue only notices values set the way a browser sets them. */
function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  el.focus();
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur();
}

function chooseOption(select: HTMLSelectElement, pick: (label: string) => boolean): boolean {
  const i = [...select.options].findIndex((o) => !o.disabled && pick(text(o)));
  if (i < 0) return false;
  if (select.selectedIndex !== i) {
    select.selectedIndex = i;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

const minutes = (label: string) => {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label);
  return m ? ((+m[1] % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + +m[2] : NaN;
};

async function pickDate(date: string) {
  const [y, mo, d] = date.split('-').map(Number);
  const month = new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if ((document.querySelector<HTMLInputElement>(SEL.dateInput)?.value ?? '') === date) return;
  (await waitFor(() => document.querySelector<HTMLElement>(SEL.dateBox), 'date box')).click();
  for (let i = 0; i < 3 && text(await waitFor(() => document.querySelector(SEL.monthLabel), 'calendar')) !== month; i++) {
    (await waitFor(() => document.querySelector<HTMLElement>(SEL.nextMonth), 'next month')).click();
    await sleep(300);
  }
  const day = await waitFor(
    () => [...document.querySelectorAll<HTMLElement>(SEL.dayCircle)].find((c) => text(c) === String(d)),
    `${month} ${d} in the calendar`,
  );
  day.click();
  await waitFor(() => document.querySelector<HTMLInputElement>(SEL.dateInput)?.value === date, 'chosen date');
}

async function searchAndPickSlot({ match }: Job) {
  // The options arrive a moment after the select itself, so keep trying until the party size is there.
  const party = new RegExp(`^${match.partySize} guests?$`);
  await waitFor(() => { const g = document.querySelector<HTMLSelectElement>(SEL.guests); return !!g && chooseOption(g, (l) => party.test(l)); }, 'party size option');
  await pickDate(match.date);

  // Search at the slot's own time (or the nearest one offered) so its button is listed.
  const timeSelect = await waitFor(() => document.querySelector<HTMLSelectElement>(SEL.time), 'time');
  const target = minutes(match.slot.displayTime);
  const labels = [...timeSelect.options].filter((o) => !o.disabled).map((o) => text(o));
  const nearest = labels.reduce((a, b) => (Math.abs(minutes(b) - target) < Math.abs(minutes(a) - target) ? b : a));
  chooseOption(timeSelect, (l) => l === nearest);

  const button = await waitFor(() => findSlotButton(match.slot.typeName, match.slot.displayTime), 'Slot no longer listed', 15_000)
    .catch(() => { throw new Error('Slot no longer listed'); });
  button.click();
}

async function fillGuest({ guest }: Job) {
  setInput(await waitFor(() => document.querySelector<HTMLInputElement>(SEL.firstName), 'guest form', 15_000), guest.firstName);
  setInput(document.querySelector<HTMLInputElement>(SEL.lastName)!, guest.lastName);
  setInput(document.querySelector<HTMLInputElement>(SEL.email)!, guest.email);
  setInput(document.querySelector<HTMLInputElement>(SEL.phone)!, guest.phone.replace(/\D/g, '').slice(-10));

  const wheelchair = document.querySelector<HTMLInputElement>(SEL.wheelchair);
  if (wheelchair && wheelchair.checked !== guest.wheelchair) wheelchair.click();

  for (const box of document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
    const label = text(box.closest('label')) || text(document.querySelector(`label[for="${box.id}"]`));
    if (box.checked && OPT_IN_LABEL.test(label)) box.click();
  }
}

/** After pressing Complete: Wisely moves to /…/<id>/confirm on success, or shows an error, or asks for a puzzle.
 *  Anything else is reported as failed, which the hunt treats as "couldn't confirm" — never as a reason to rebook. */
async function watchOutcome() {
  let askedForHelp = false;
  let end = Date.now() + 60_000;
  for (;;) {
    if (isConfirmationPath(location.pathname)) return report('booked', location.pathname);
    if (!location.pathname.endsWith('/review')) return report('failed', `Wisely went to ${location.pathname}`);
    const error = document.querySelector(SEL.submitError);
    if (visible(error)) return report('rejected', text(error) || 'Wisely refused the booking');
    const puzzle = [...document.querySelectorAll(SEL.arkoseFrame)].some((f) => (f as HTMLElement).getBoundingClientRect().height > 80);
    if (puzzle && !askedForHelp) {
      askedForHelp = true;
      end = Date.now() + 15 * 60_000; // a person is on the way
      await report('needs-you');
    }
    if (Date.now() > end) {
      const hints = [...document.querySelectorAll('[class*="error"]')].filter(visible).map(text).filter(Boolean).join('; ');
      return report('failed', hints || 'No response from Wisely');
    }
    await sleep(250);
  }
}

async function run() {
  const job = (await chrome.runtime.sendMessage({ kind: 'getJob' })) as Job | null;
  // Only start from the search page; any later page load in this tab (review, confirm…) must not start over.
  if (!job || !/^\/hillstone-park-avenue\/?$/.test(location.pathname)) return;
  try {
    await searchAndPickSlot(job);
    await fillGuest(job);
    if (job.practice) return void (await report('practice-ready'));
    const complete = await waitFor(() => document.querySelector<HTMLElement>(SEL.complete), 'Complete Reservation button');
    await report('submitting'); // from here on, an unclear result must never lead to booking again
    complete.click();
    await watchOutcome();
  } catch (e) {
    await report('failed', e instanceof Error ? e.message : String(e));
  }
}

void run();

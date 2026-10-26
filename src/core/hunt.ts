import { formatNyDay, nyDateTimeToMs, todayNy } from './time';
import type { Guest, HuntDraft } from './types';

export const MAX_DAYS = 5;

/** Most hunts are a single day, so that's the default. */
export function newDraft(now: number): HuntDraft {
  return { partySize: 2, days: [{ date: todayNy(now), from: '19:00', to: '21:00' }] };
}

function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Adds the day after the last one, with the first day's window. */
export function addDay(d: HuntDraft): HuntDraft {
  if (d.days.length >= MAX_DAYS) return d;
  const { from, to } = d.days[0];
  return { ...d, days: [...d.days, { date: nextDate(d.days[d.days.length - 1].date), from, to }] };
}

export function removeDay(d: HuntDraft, index: number): HuntDraft {
  if (d.days.length <= 1) return d;
  return { ...d, days: d.days.filter((_, i) => i !== index) };
}

export function validateDraft(d: HuntDraft, now: number): string | null {
  if (d.days.length === 0) return 'Pick a day';
  if (d.days.length > MAX_DAYS) return 'Up to 5 days';
  if (new Set(d.days.map((x) => x.date)).size !== d.days.length) return 'Each day can only be added once';
  for (const day of d.days) {
    if (day.to < day.from) return '"To" must be after "From"';
    if (nyDateTimeToMs(day.date, day.to) <= now) return `${formatNyDay(day.date)} is already over`;
  }
  return null;
}

export function validateGuest(g: Guest): string | null {
  if (!g.firstName.trim()) return 'First name is required';
  if (!g.lastName.trim()) return 'Last name is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email.trim())) return 'Email looks wrong';
  if (g.phone.replace(/\D/g, '').length < 10) return 'Phone needs 10 digits';
  return null;
}

/** The page never sees the saved email/phone, so leaving them blank in an edit means "keep what's saved". */
export function mergeGuest(saved: Guest | null, edit: Guest): Guest {
  const email = edit.email.trim() || saved?.email || '';
  const phone = edit.phone.trim() || saved?.phone || '';
  return { firstName: edit.firstName.trim(), lastName: edit.lastName.trim(), email, phone, wheelchair: edit.wheelchair };
}

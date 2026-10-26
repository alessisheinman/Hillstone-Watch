// Hillstone is in New York, so every date and time in the app is New York wall-clock time,
// whatever zone the PC itself is set to.
const ZONE = 'America/New_York';

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

function nyParts(ms: number) {
  const p = Object.fromEntries(partsFormat.formatToParts(ms).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

/** How far New York's wall clock is ahead of UTC at this instant (negative: -4h or -5h). */
function nyOffsetMs(ms: number): number {
  const p = nyParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** "2026-11-07" + "19:30" in New York → epoch milliseconds. */
export function nyDateTimeToMs(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Guess with the offset at the wall time read as UTC, then re-check once in case a DST change sits in between.
  const guess = asUtc - nyOffsetMs(asUtc);
  return asUtc - nyOffsetMs(guess);
}

/** New York calendar date of an instant, as YYYY-MM-DD. */
export function msToNyDate(ms: number): string {
  const p = nyParts(ms);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** "9:00 PM" */
export function formatNyTime(ms: number): string {
  return timeFormat.format(ms).replace(/ /g, ' ');
}

/** "2026-11-07" → "Sat, Nov 7" */
export function formatNyDay(date: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  return dayFormat.format(Date.UTC(y, mo - 1, d));
}

export function todayNy(now: number): string {
  return msToNyDate(now);
}

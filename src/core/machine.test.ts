import { describe, expect, it } from 'vitest';
import released from './__fixtures__/inventory-2026-11-02-party2.json';
import unreleased from './__fixtures__/inventory-unreleased.json';
import { parseInventory } from './inventory';
import {
  ACTIVITY_LIMIT, daysToCheck, initialState, onBookingOutcome, onBookingTimeout, onChecks, start, stop,
} from './machine';
import type { CheckResult, HuntDraft, HuntState } from './types';

const now = Date.UTC(2026, 10, 1, 12); // Nov 1, morning in New York
const nov2 = parseInventory(released, 2);
const draft = (from: string, to: string, ...extra: string[]): HuntDraft => ({
  partySize: 2,
  days: [{ date: '2026-11-02', from, to }, ...extra.map((date) => ({ date, from, to }))],
});
const hunting = (d: HuntDraft) => start(initialState(), d, now);
const ok = (date: string, inventory = nov2): CheckResult => ({ date, inventory });

describe('onChecks', () => {
  it('books the earliest slot inside the window', () => {
    const { state, book } = onChecks(hunting(draft('19:00', '21:00')), [ok('2026-11-02')], now);
    expect(book?.slot).toMatchObject({ reservedTs: 1793671200000, displayTime: '9:00 PM', typeName: 'Dinner' });
    expect(book?.partySize).toBe(2);
    expect(state.status).toBe('booking');
    expect(state.current).toEqual(book);
    expect(state.activity[0]).toMatchObject({ kind: 'hit', text: 'Found Mon, Nov 2 9:00 PM — booking' });
  });

  it('includes both ends of the window', () => {
    const { book } = onChecks(hunting(draft('12:00', '12:00')), [ok('2026-11-02')], now);
    expect(book?.slot.reservedTs).toBe(1793638800000);
  });

  it('keeps hunting and reports the closest time when nothing fits', () => {
    const { state, book } = onChecks(hunting(draft('18:00', '20:30')), [ok('2026-11-02')], now);
    expect(book).toBeNull();
    expect(state.status).toBe('hunting');
    expect(state.activity[0].kind).toBe('near');
    expect(state.activity[0].text).toContain('9:00 PM');
    expect(state.lastCheckedAt).toBe(now);
  });

  it('says when a day is not released yet', () => {
    const d: HuntDraft = { partySize: 2, days: [{ date: '2026-11-03', from: '19:00', to: '21:00' }] };
    const { state } = onChecks(hunting(d), [ok('2026-11-03', parseInventory(unreleased, 2))], now);
    expect(state.activity[0].text).toContain('Tue, Nov 3 not released yet');
  });

  it('picks the earliest day when several days match', () => {
    const d = draft('19:00', '21:00', '2026-11-01');
    const { book } = onChecks(hunting(d), [ok('2026-11-02'), ok('2026-11-01', {
      released: true, slots: [{ reservedTs: Date.UTC(2026, 10, 2, 1, 30), displayTime: '8:30 PM', typeId: 1695, typeName: 'Dinner' }],
    })], now);
    expect(book?.date).toBe('2026-11-01');
  });

  it('ignores checks while a booking is already under way', () => {
    const booking = onChecks(hunting(draft('19:00', '21:00')), [ok('2026-11-02')], now).state;
    const again = onChecks(booking, [ok('2026-11-02')], now + 30_000);
    expect(again.book).toBeNull();
    expect(again.state).toBe(booking);
  });

  it('logs a failed check and keeps hunting', () => {
    const { state } = onChecks(hunting(draft('19:00', '21:00')), [{ date: '2026-11-02', error: 'HTTP 403' }], now);
    expect(state.status).toBe('hunting');
    expect(state.activity[0].kind).toBe('error');
    expect(state.activity[0].text.startsWith('Check failed')).toBe(true);
  });

  it('ends the hunt once every window has passed', () => {
    const later = Date.UTC(2026, 10, 3, 3); // Nov 2, 10 PM New York
    const { state } = onChecks(hunting(draft('19:00', '21:00')), [], later);
    expect(state.status).toBe('ended');
    expect(state.activity[0].text).toBe('All days passed — no table found');
  });

  it('keeps the activity list to 50 entries', () => {
    let s = hunting(draft('18:00', '20:30'));
    for (let i = 0; i < 80; i++) s = onChecks(s, [ok('2026-11-02')], now + i).state;
    expect(s.activity).toHaveLength(ACTIVITY_LIMIT);
  });
});

describe('daysToCheck', () => {
  it('only lists days whose window has not ended', () => {
    const s = hunting(draft('19:00', '21:00', '2026-11-03'));
    expect(daysToCheck(s, Date.UTC(2026, 10, 3, 3)).map((d) => d.date)).toEqual(['2026-11-03']);
  });

  it('lists nothing unless hunting', () => {
    expect(daysToCheck(initialState(), now)).toEqual([]);
  });
});

describe('booking outcomes', () => {
  const booking = (): HuntState => onChecks(hunting(draft('19:00', '21:00')), [ok('2026-11-02')], now).state;

  it('stops everything once booked', () => {
    const s = onBookingOutcome(booking(), 'booked', '', now);
    expect(s.status).toBe('booked');
    expect(s.booked?.slot.displayTime).toBe('9:00 PM');
    expect(s.current).toBeNull();
    expect(s.activity[0]).toMatchObject({ kind: 'hit', text: 'Booked Mon, Nov 2 9:00 PM, party of 2' });
    expect(daysToCheck(s, now)).toEqual([]);
  });

  it('waits for a person when Wisely shows a puzzle, then can still finish', () => {
    const s = onBookingOutcome(booking(), 'needs-you', '', now);
    expect(s.status).toBe('needs-you');
    expect(onBookingOutcome(s, 'booked', '', now).status).toBe('booked');
  });

  it('goes back to hunting when the booking fails', () => {
    const s = onBookingOutcome(booking(), 'failed', 'Slot no longer listed', now);
    expect(s.status).toBe('hunting');
    expect(s.current).toBeNull();
    expect(s.activity[0].text).toContain('Slot no longer listed');
  });

  it('ends a practice run without booking', () => {
    const practice = onChecks(start(initialState(), draft('19:00', '21:00'), now, true), [ok('2026-11-02')], now).state;
    const s = onBookingOutcome(practice, 'practice-ready', '', now);
    expect(s.status).toBe('idle');
    expect(s.booked).toBeNull();
    expect(s.activity[0].text).toBe('Practice run filled the form — not confirmed');
  });

  it('ignores an outcome that arrives when nothing is being booked', () => {
    const s = hunting(draft('19:00', '21:00'));
    expect(onBookingOutcome(s, 'booked', '', now)).toBe(s);
  });

  it('goes back to hunting when the booking page never answers', () => {
    expect(onBookingTimeout(booking(), now).status).toBe('hunting');
  });
});

describe('start / stop', () => {
  it('starts hunting with a log line', () => {
    const s = hunting(draft('19:00', '21:00'));
    expect(s.status).toBe('hunting');
    expect(s.activity[0].text).toBe('Hunt started');
  });

  it('stops', () => {
    expect(stop(hunting(draft('19:00', '21:00')), now).status).toBe('idle');
  });
});

import { describe, expect, it } from 'vitest';
import { addDay, MAX_DAYS, newDraft, removeDay, validateDraft, validateGuest } from './hunt';
import type { Guest, HuntDraft } from './types';

const now = Date.UTC(2026, 10, 1, 16, 0); // Nov 1, 11 AM New York

describe('newDraft', () => {
  it('starts with one day today, 7–9 PM, party of 2', () => {
    expect(newDraft(now)).toEqual({ partySize: 2, days: [{ date: '2026-11-01', from: '19:00', to: '21:00' }] });
  });
});

describe('addDay', () => {
  it("copies the first day's window, not the last day's", () => {
    const d: HuntDraft = {
      partySize: 2,
      days: [{ date: '2026-11-07', from: '18:00', to: '20:00' }, { date: '2026-11-08', from: '12:00', to: '13:00' }],
    };
    expect(addDay(d).days[2]).toEqual({ date: '2026-11-09', from: '18:00', to: '20:00' });
  });

  it('rolls over month ends', () => {
    const d: HuntDraft = { partySize: 2, days: [{ date: '2026-11-30', from: '19:00', to: '21:00' }] };
    expect(addDay(d).days[1].date).toBe('2026-12-01');
  });

  it('stops at 5 days', () => {
    let d = newDraft(now);
    for (let i = 0; i < 10; i++) d = addDay(d);
    expect(d.days).toHaveLength(MAX_DAYS);
  });
});

describe('removeDay', () => {
  it('never removes the last remaining day', () => {
    const d = newDraft(now);
    expect(removeDay(d, 0)).toEqual(d);
  });

  it('removes the chosen day', () => {
    const d = addDay(newDraft(now));
    expect(removeDay(d, 0).days).toEqual([d.days[1]]);
  });
});

describe('validateDraft', () => {
  const day = (date: string, from = '19:00', to = '21:00') => ({ date, from, to });

  it('accepts a valid hunt', () => {
    expect(validateDraft({ partySize: 2, days: [day('2026-11-07')] }, now)).toBeNull();
  });

  it('rejects a window that ends before it starts', () => {
    expect(validateDraft({ partySize: 2, days: [day('2026-11-07', '21:00', '19:00')] }, now)).toBe('"To" must be after "From"');
  });

  it('rejects a day whose window is already over', () => {
    expect(validateDraft({ partySize: 2, days: [day('2026-10-31')] }, now)).toBe('Sat, Oct 31 is already over');
  });

  it('rejects the same date twice', () => {
    expect(validateDraft({ partySize: 2, days: [day('2026-11-07'), day('2026-11-07')] }, now)).toBe('Each day can only be added once');
  });

  it('rejects more than 5 days', () => {
    const days = ['03', '04', '05', '06', '07', '08'].map((d) => day(`2026-11-${d}`));
    expect(validateDraft({ partySize: 2, days }, now)).toBe('Up to 5 days');
  });

  it('rejects no days', () => {
    expect(validateDraft({ partySize: 2, days: [] }, now)).toBe('Pick a day');
  });
});

describe('validateGuest', () => {
  const ok: Guest = { firstName: 'Test', lastName: 'Person', email: 'test@example.com', phone: '555-555-5555', wheelchair: false };

  it('accepts complete details', () => {
    expect(validateGuest(ok)).toBeNull();
  });

  it('needs first and last name', () => {
    expect(validateGuest({ ...ok, firstName: ' ' })).toBe('First name is required');
    expect(validateGuest({ ...ok, lastName: '' })).toBe('Last name is required');
  });

  it('needs a real-looking email', () => {
    expect(validateGuest({ ...ok, email: 'test.example.com' })).toBe('Email looks wrong');
  });

  it('needs at least 10 phone digits', () => {
    expect(validateGuest({ ...ok, phone: '555-5555' })).toBe('Phone needs 10 digits');
  });
});

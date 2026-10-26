import { describe, expect, it } from 'vitest';
import { formatNyDay, formatNyTime, msToNyDate, nyDateTimeToMs, todayNy } from './time';

describe('nyDateTimeToMs', () => {
  it('matches real Wisely slot timestamps in standard time', () => {
    expect(nyDateTimeToMs('2026-11-02', '12:00')).toBe(1793638800000);
    expect(nyDateTimeToMs('2026-11-02', '21:00')).toBe(1793671200000);
  });

  it('matches a real Wisely slot timestamp in daylight time', () => {
    expect(nyDateTimeToMs('2026-10-28', '14:00')).toBe(1793210400000);
  });

  it('uses standard time in the evening of the fall-back day', () => {
    expect(nyDateTimeToMs('2026-11-01', '19:00')).toBe(Date.UTC(2026, 10, 2, 0, 0));
  });

  it('is not affected by the PC time zone', () => {
    expect(process.env.TZ).toBe('Asia/Tokyo');
    expect(nyDateTimeToMs('2026-11-02', '21:00')).toBe(1793671200000);
  });
});

describe('formatting', () => {
  it('formats a time in New York', () => {
    expect(formatNyTime(1793671200000)).toBe('9:00 PM');
  });

  it('gives the New York calendar date of an instant', () => {
    expect(msToNyDate(1793671200000)).toBe('2026-11-02');
  });

  it('formats a day label', () => {
    expect(formatNyDay('2026-11-07')).toBe('Sat, Nov 7');
  });

  it('gives today in New York, not UTC', () => {
    expect(todayNy(Date.UTC(2026, 9, 27, 2, 0))).toBe('2026-10-26'); // 10 PM NY on the 26th
  });
});

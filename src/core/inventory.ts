import { nyDateTimeToMs } from './time';
import type { DayInventory, HuntDay, PartySize, Slot } from './types';

export const MERCHANT_ID = 278278;
export const BOOKING_URL = 'https://reservations.getwisely.com/hillstone-park-avenue?g=midtown-parkave';
const INVENTORY_URL = 'https://loyaltyapi.wisely.io/v2/web/reservations/inventory';

/** Open times Wisely has within roughly ±6 hours of `time` (not the whole day — see searchPoints). */
export function inventoryUrl(date: string, time: string, partySize: PartySize): string {
  const q = new URLSearchParams({
    merchant_id: String(MERCHANT_ID),
    party_size: String(partySize),
    search_ts: String(nyDateTimeToMs(date, time)),
    show_reservation_types: '1',
    limit: '50',
  });
  return `${INVENTORY_URL}?${q}`;
}

interface RawTime { reserved_ts: number; display_time: string; is_available: number; min_party_size: number; max_party_size: number }
interface RawType { reservation_type_id: number; reservation_type_name: string; times: RawTime[] }

export function parseInventory(json: unknown, partySize: PartySize): DayInventory {
  const types = (json as { types?: unknown } | null)?.types;
  if (typeof json !== 'object' || !Array.isArray(types)) throw new Error('Unexpected response');
  const slots: Slot[] = [];
  for (const t of types as RawType[]) {
    for (const x of t.times ?? []) {
      if (x.is_available !== 1 || partySize < x.min_party_size || partySize > x.max_party_size) continue;
      slots.push({ reservedTs: x.reserved_ts, displayTime: x.display_time, typeId: t.reservation_type_id, typeName: t.reservation_type_name });
    }
  }
  // Stable sort keeps Wisely's type order (Dinner first) for times listed under both.
  slots.sort((a, b) => a.reservedTs - b.reservedTs);
  return { released: !(json as { before_day_release?: boolean }).before_day_release, slots };
}

const SPAN = 4 * 60; // minutes between searches on a long window; well inside Wisely's ±6 h reach

const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
const toHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** The times to search so every minute of the window is covered: the middle of a short window,
 *  or every 4 hours plus the end of a long one. */
export function searchPoints(day: HuntDay): string[] {
  const from = toMin(day.from);
  const to = toMin(day.to);
  if (to - from <= SPAN) return [toHhmm(Math.floor((from + to) / 2))];
  const points: string[] = [];
  for (let m = from; m < to; m += SPAN) points.push(toHhmm(m));
  points.push(toHhmm(to));
  return points;
}

export function mergeInventories(parts: DayInventory[]): DayInventory {
  const seen = new Map<string, Slot>();
  for (const p of parts) for (const s of p.slots) seen.set(`${s.typeId}-${s.reservedTs}`, seen.get(`${s.typeId}-${s.reservedTs}`) ?? s);
  const slots = [...seen.values()].sort((a, b) => a.reservedTs - b.reservedTs || a.typeId - b.typeId);
  return { released: parts.every((p) => p.released), slots };
}

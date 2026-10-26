import { nyDateTimeToMs } from './time';
import type { DayInventory, PartySize, Slot } from './types';

export const MERCHANT_ID = 278278;
export const BOOKING_URL = 'https://reservations.getwisely.com/hillstone-park-avenue?g=midtown-parkave';
const INVENTORY_URL = 'https://loyaltyapi.wisely.io/v2/web/reservations/inventory';

/** One call returns every open time that day, so searching from the window start is enough. */
export function inventoryUrl(date: string, from: string, partySize: PartySize): string {
  const q = new URLSearchParams({
    merchant_id: String(MERCHANT_ID),
    party_size: String(partySize),
    search_ts: String(nyDateTimeToMs(date, from)),
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

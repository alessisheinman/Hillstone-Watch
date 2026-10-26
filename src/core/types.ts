export type PartySize = 1 | 2 | 3 | 4;

/** One day to hunt on: New York date YYYY-MM-DD and a window HH:MM–HH:MM (24h, both ends included). */
export interface HuntDay { date: string; from: string; to: string }
export interface HuntDraft { partySize: PartySize; days: HuntDay[] }

/** The person the table is booked for. Only ever kept in the extension's storage — never in code. */
export interface Guest { firstName: string; lastName: string; email: string; phone: string; wheelchair: boolean }

/** One open table time from Wisely. Lunch and Dinner can both list the same time. */
export interface Slot { reservedTs: number; displayTime: string; typeId: number; typeName: string }
export interface DayInventory { released: boolean; slots: Slot[] }

export type Status = 'idle' | 'hunting' | 'booking' | 'needs-you' | 'booked' | 'ended';
export interface Match { date: string; slot: Slot; partySize: PartySize }
export interface ActivityEntry { at: number; text: string; kind: 'info' | 'near' | 'hit' | 'error' }
export interface HuntState {
  status: Status;
  draft: HuntDraft | null;
  activity: ActivityEntry[]; // newest first
  lastCheckedAt: number | null;
  current: Match | null; // the slot being booked right now
  booked: Match | null;
  practice: boolean; // fill Wisely's form but never press confirm
}
export type CheckResult = { date: string; inventory: DayInventory } | { date: string; error: string };
export type BookingOutcome = 'booked' | 'needs-you' | 'failed' | 'practice-ready';

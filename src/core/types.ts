export type PartySize = 1 | 2 | 3 | 4;

/** One day to hunt on: New York date YYYY-MM-DD and a window HH:MM–HH:MM (24h, both ends included). */
export interface HuntDay { date: string; from: string; to: string }
export interface HuntDraft { partySize: PartySize; days: HuntDay[] }

/** The person the table is booked for. Only ever kept in the extension's storage — never in code. */
export interface Guest { firstName: string; lastName: string; email: string; phone: string; wheelchair: boolean }

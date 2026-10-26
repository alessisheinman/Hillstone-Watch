import { initialState } from '../../src/core/machine';
import type { Guest, HuntState } from '../../src/core/types';

const STATE = 'hw:state';
const GUEST = 'hw:guest';
const JOB = 'hw:job';

export const KEYS = { STATE, GUEST } as const;

export async function loadState(): Promise<HuntState> {
  return ((await chrome.storage.local.get(STATE))[STATE] as HuntState | undefined) ?? initialState();
}
export async function saveState(s: HuntState): Promise<void> {
  await chrome.storage.local.set({ [STATE]: s });
}

export async function loadGuest(): Promise<Guest | null> {
  return ((await chrome.storage.local.get(GUEST))[GUEST] as Guest | undefined) ?? null;
}
export async function saveGuest(g: Guest): Promise<void> {
  await chrome.storage.local.set({ [GUEST]: g });
}

/** The Wisely tab currently booking, if any. Session storage: forgotten when Chrome closes, like the tab. */
export async function loadJobTab(): Promise<number | null> {
  return ((await chrome.storage.session.get(JOB))[JOB] as number | undefined) ?? null;
}
export async function saveJobTab(tabId: number | null): Promise<void> {
  if (tabId === null) await chrome.storage.session.remove(JOB);
  else await chrome.storage.session.set({ [JOB]: tabId });
}

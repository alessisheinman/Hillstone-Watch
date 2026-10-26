import { formatNyDay } from '../../src/core/time';
import type { Match } from '../../src/core/types';

const ICON = 'icon-128.png';

async function beep(times: number, freq: number) {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Plays the alert when a table is booked or needs attention',
    });
  }
  await chrome.runtime.sendMessage({ kind: 'beep', times, freq });
}

async function notify(id: string, title: string, message: string, sticky: boolean) {
  await chrome.notifications.create(id, { type: 'basic', iconUrl: ICON, title, message, priority: 2, requireInteraction: sticky });
}

export async function focusTab(tabId: number) {
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
}

export async function alertBooked(m: Match) {
  await notify('hw-booked', '✓ Hillstone booked', `${formatNyDay(m.date)}, ${m.slot.displayTime}, party of ${m.partySize}`, false);
  await beep(3, 880);
}

export async function alertNeedsYou(tabId: number) {
  await focusTab(tabId);
  await notify('hw-needs-you', '⚠ Hillstone needs you', 'Wisely wants a "prove you\'re human" puzzle. Solve it to finish the booking.', true);
  await beep(8, 660);
}

export async function alertEnded() {
  await notify('hw-ended', 'Hillstone hunt ended', 'Every day in the hunt has passed without a table.', false);
}

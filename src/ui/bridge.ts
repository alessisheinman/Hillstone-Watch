import type { ExtToSite, SiteToExt } from '../core/types';

// The extension's content script lives in this same window, so messages go to ourselves and it picks them up.

export function send(win: Window, msg: SiteToExt): void {
  win.postMessage({ source: 'hw-site', msg }, '*');
}

/** Listens for the extension for as long as the page is open; resolves whether it answered `hello` in time. */
export function connect(win: Window, onMessage: (m: ExtToSite) => void, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    win.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.source !== 'hw-ext') return;
      const msg = e.data.msg as ExtToSite;
      if (msg.type === 'snapshot') {
        clearTimeout(timer);
        resolve(true);
      }
      onMessage(msg);
    });
    send(win, { type: 'hello' });
  });
}

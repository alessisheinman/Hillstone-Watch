import type { ExtToSite, SiteToExt } from '../../src/core/types';

// Runs inside the Hillstone Watch page: passes the page's messages to the background and its answers back.

function reply(msg: ExtToSite) {
  window.postMessage({ source: 'hw-ext', msg }, window.location.origin);
}

async function forward(msg: SiteToExt) {
  try {
    reply(await chrome.runtime.sendMessage({ kind: 'site', msg }));
  } catch {
    reply({ type: 'error', message: 'Lost touch with the extension — reload this page.' });
  }
}

window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== window || e.data?.source !== 'hw-site') return;
  void forward(e.data.msg as SiteToExt);
});

// Push live updates whenever the hunt changes in the background.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes['hw:state'] || changes['hw:guest'])) void forward({ type: 'hello' });
});

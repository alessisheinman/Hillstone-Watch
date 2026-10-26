"use strict";
(() => {
  // extension/src/site-bridge.ts
  function reply(msg) {
    window.postMessage({ source: "hw-ext", msg }, window.location.origin);
  }
  async function forward(msg) {
    try {
      reply(await chrome.runtime.sendMessage({ kind: "site", msg }));
    } catch {
      reply({ type: "error", message: "Lost touch with the extension \u2014 reload this page." });
    }
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.source !== "hw-site") return;
    void forward(e.data.msg);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes["hw:state"] || changes["hw:guest"])) void forward({ type: "hello" });
  });
})();

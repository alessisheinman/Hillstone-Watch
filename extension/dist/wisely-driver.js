"use strict";
(() => {
  // extension/src/wisely-driver.ts
  void chrome.runtime.sendMessage({ kind: "outcome", outcome: "failed", detail: "driver not built yet" });
})();

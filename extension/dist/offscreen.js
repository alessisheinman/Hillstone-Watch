// extension/src/offscreen.ts
var ctx = new AudioContext();
function beep(times, freq) {
  let t = ctx.currentTime;
  for (let i = 0; i < times; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(1e-4, t + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.3);
    t += 0.35;
  }
}
chrome.runtime.onMessage.addListener((m) => {
  if (m.kind !== "beep") return;
  void ctx.resume().then(() => beep(m.times ?? 3, m.freq ?? 880));
});

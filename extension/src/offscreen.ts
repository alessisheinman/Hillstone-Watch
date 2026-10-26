// Hidden page whose only job is making noise: service workers can't play audio.
const ctx = new AudioContext();

function beep(times: number, freq: number) {
  let t = ctx.currentTime;
  for (let i = 0; i < times; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.3);
    t += 0.35;
  }
}

chrome.runtime.onMessage.addListener((m: { kind?: string; times?: number; freq?: number }) => {
  if (m.kind !== 'beep') return;
  void ctx.resume().then(() => beep(m.times ?? 3, m.freq ?? 880));
});

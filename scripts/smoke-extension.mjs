// End-to-end smoke test of the extension in a throwaway Chromium profile (never your own Chrome).
// Needs `npm run dev` running and `npm run build:ext` done. Uses fake guest details only.
// Usage: node scripts/smoke-extension.mjs [poll|book|practice]
import { chromium } from 'playwright-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] ?? 'poll';
const EXE = join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe');
const EXT = fileURLToPath(new URL('../extension/dist/', import.meta.url));
const SITE = 'http://localhost:5173/';
const FAKE = { first: 'Test', last: 'Person', email: 'test@example.com', phone: process.env.PHONE ?? '555-555-5555' };
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** First day in the next week with an open time for 2, straight from Wisely. */
// PARTY (1-4), TYPE (Dinner/Lunch) and FROM_DAY (days ahead) narrow the search.
const PARTY = Number(process.env.PARTY ?? 2);
async function findOpenSlot() {
  for (let i = Number(process.env.FROM_DAY ?? 1); i <= 7; i++) {
    const day = new Date(Date.now() + i * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const ts = Date.parse(`${day}T12:00:00-05:00`);
    const res = await fetch(`https://loyaltyapi.wisely.io/v2/web/reservations/inventory?merchant_id=278278&party_size=${PARTY}&search_ts=${ts}&show_reservation_types=1&limit=50`);
    const json = await res.json();
    const t = json.types.flatMap((x) => x.times.map((s) => ({ ...s, type: x.reservation_type_name }))).find((s) => s.is_available && s.max_party_size >= PARTY && s.min_party_size <= PARTY && (!process.env.TYPE || s.type === process.env.TYPE));
    if (t) {
      const hhmm = new Date(t.reserved_ts).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
      return { day, hhmm, display: t.display_time, type: t.type };
    }
  }
  throw new Error('No open slot in the next 7 days');
}

const PROFILE = mkdtempSync(join(tmpdir(), 'hw-smoke-'));
const launch = () => chromium.launchPersistentContext(PROFILE, {
  executablePath: EXE,
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let ctx = await launch();
const worker = async () => ctx.serviceWorkers()[0] ?? ctx.waitForEvent('serviceworker');
await worker();
let page = await ctx.newPage();
await page.goto(SITE);
await page.getByText('Idle').waitFor({ timeout: 10_000 });
log('extension detected, status Idle; banner shown:', await page.getByText('Extension not found.').isVisible());

await page.getByRole('button', { name: 'Add guest details' }).click();
await page.getByLabel('First name').fill(FAKE.first);
await page.getByLabel('Last name').fill(FAKE.last);
await page.getByLabel('Email').fill(FAKE.email);
await page.getByLabel('Phone').fill(FAKE.phone);
await page.getByRole('button', { name: 'Save' }).click();
await page.getByText(`${FAKE.first} ${FAKE.last}`).waitFor();
log('guest saved');

const slot = await findOpenSlot();
log('open slot on Wisely:', slot);
const activity = () => page.locator('.log li').allInnerTexts();
const status = () => page.locator('.pill').innerText();

async function setWindow(day, from, to) {
  await page.locator('.seg button', { hasText: String(PARTY) }).click();
  await page.getByLabel('Date').fill(day);
  await page.getByLabel('From').fill(from);
  await page.getByLabel('To').fill(to);
}

if (mode === 'poll') {
  await setWindow(slot.day, '23:00', '23:30'); // after closing: never matches
  await page.getByRole('button', { name: 'Start hunting' }).click();
  await sleep(5_000);
  log('after start:', await status(), (await activity()).slice(0, 2));
  const other = await ctx.newPage(); // put the site tab in the background
  await other.goto('about:blank');
  await sleep(Number(process.env.WAIT ?? 70_000));
  const lines = await activity();
  log('after 75 s in background:', await status(), `${lines.filter((l) => l.includes('Nothing in window')).length} checks`, lines[0]);

  log('closing and reopening Chrome mid-hunt…');
  await ctx.close();
  ctx = await launch();
  page = await ctx.newPage();
  await page.goto(SITE);
  await page.getByText(/Hunting/).waitFor({ timeout: 15_000 });
  await sleep(35_000);
  const after = await activity();
  log('after restart:', await status(), '| alarms:', JSON.stringify(await (await worker()).evaluate(() => chrome.alarms.getAll())), '|', after[0]);
  await page.getByRole('button', { name: 'Stop hunting' }).click();
  await page.getByText('Idle').waitFor();
  log('stopped:', await status());
}

if (mode === 'book' || mode === 'practice') {
  await setWindow(slot.day, slot.hhmm, slot.hhmm);
  const tabOpened = ctx.waitForEvent('page', { predicate: (p) => p.url().includes('getwisely.com'), timeout: 20_000 });
  if (mode === 'book') await page.getByRole('button', { name: 'Start hunting' }).click();
  else await page.evaluate(() => {
    // The site has no practice button; ask the extension directly, the way the site would.
    const draft = { partySize: Number(document.querySelector('.seg .on').textContent), days: [{ date: document.querySelector('[aria-label="Date"]').value, from: document.querySelector('[aria-label="From"]').value, to: document.querySelector('[aria-label="To"]').value }] };
    window.postMessage({ source: 'hw-site', msg: { type: 'start', draft, practice: true } }, '*');
  });
  const wisely = await tabOpened;
  log('Wisely tab opened:', wisely.url());
  await sleep(mode === 'book' ? 8_000 : 25_000);
  log('status:', await status());
  log('activity:', (await activity()).slice(0, 4));
  log('Wisely tab still open:', !wisely.isClosed());
  if (mode === 'practice' && !wisely.isClosed()) {
    await wisely.screenshot({ path: join(tmpdir(), 'hw-practice.png'), fullPage: true });
    log('Wisely app state:', JSON.stringify(await wisely.evaluate(() => {
      const st = document.querySelector('#app').__vue__.$store.state;
      const r = st.reservation ?? {};
      return { guest: st.api?.guest ?? r.guest, party: r.numberOfGuests?.value, time: r.time?.label ?? r.time?.reservedTs, url: location.pathname };
    })));
  }
  if (await page.getByRole('button', { name: 'Stop hunting' }).isVisible()) await page.getByRole('button', { name: 'Stop hunting' }).click();
}

await ctx.close();

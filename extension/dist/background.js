// src/core/time.ts
var ZONE = "America/New_York";
var partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});
var timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });
var dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
function nyParts(ms) {
  const p = Object.fromEntries(partsFormat.formatToParts(ms).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}
function nyOffsetMs(ms) {
  const p = nyParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1e3) * 1e3;
}
function nyDateTimeToMs(date, time) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const guess = asUtc - nyOffsetMs(asUtc);
  return asUtc - nyOffsetMs(guess);
}
function formatNyTime(ms) {
  return timeFormat.format(ms).replace(/ /g, " ");
}
function formatNyDay(date) {
  const [y, mo, d] = date.split("-").map(Number);
  return dayFormat.format(Date.UTC(y, mo - 1, d));
}

// src/core/hunt.ts
var MAX_DAYS = 5;
function validateDraft(d, now) {
  if (d.days.length === 0) return "Pick a day";
  if (![1, 2, 3, 4].includes(d.partySize)) return "Party size must be 1\u20134";
  if (d.days.some((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x.date))) return "Pick a date";
  if (d.days.some((x) => !/^\d{2}:\d{2}$/.test(x.from) || !/^\d{2}:\d{2}$/.test(x.to))) return "Pick a time window";
  if (d.days.length > MAX_DAYS) return "Up to 5 days";
  if (new Set(d.days.map((x) => x.date)).size !== d.days.length) return "Each day can only be added once";
  for (const day of d.days) {
    if (day.to < day.from) return '"To" must be after "From"';
    if (nyDateTimeToMs(day.date, day.to) <= now) return `${formatNyDay(day.date)} is already over`;
  }
  return null;
}
function validateGuest(g) {
  if (!g.firstName.trim()) return "First name is required";
  if (!g.lastName.trim()) return "Last name is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email.trim())) return "Email looks wrong";
  if (g.phone.replace(/\D/g, "").length < 10) return "Phone needs 10 digits";
  return null;
}
function mergeGuest(saved, edit) {
  const email = edit.email.trim() || saved?.email || "";
  const phone = edit.phone.trim() || saved?.phone || "";
  return { firstName: edit.firstName.trim(), lastName: edit.lastName.trim(), email, phone, wheelchair: edit.wheelchair };
}

// src/core/inventory.ts
var MERCHANT_ID = 278278;
var BOOKING_URL = "https://reservations.getwisely.com/hillstone-park-avenue?g=midtown-parkave";
var INVENTORY_URL = "https://loyaltyapi.wisely.io/v2/web/reservations/inventory";
function inventoryUrl(date, time, partySize) {
  const q = new URLSearchParams({
    merchant_id: String(MERCHANT_ID),
    party_size: String(partySize),
    search_ts: String(nyDateTimeToMs(date, time)),
    show_reservation_types: "1",
    limit: "50"
  });
  return `${INVENTORY_URL}?${q}`;
}
function parseInventory(json, partySize) {
  const types = json?.types;
  if (typeof json !== "object" || !Array.isArray(types)) throw new Error("Unexpected response");
  const slots = [];
  for (const t of types) {
    for (const x of t.times ?? []) {
      if (x.is_available !== 1 || partySize < x.min_party_size || partySize > x.max_party_size) continue;
      slots.push({ reservedTs: x.reserved_ts, displayTime: x.display_time, typeId: t.reservation_type_id, typeName: t.reservation_type_name });
    }
  }
  slots.sort((a, b) => a.reservedTs - b.reservedTs);
  return { released: !json.before_day_release, slots };
}
var SPAN = 4 * 60;
var toMin = (hhmm) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
var toHhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function searchPoints(day) {
  const from = toMin(day.from);
  const to = toMin(day.to);
  if (to - from <= SPAN) return [toHhmm(Math.floor((from + to) / 2))];
  const points = [];
  for (let m = from; m < to; m += SPAN) points.push(toHhmm(m));
  points.push(toHhmm(to));
  return points;
}
function mergeInventories(parts) {
  const seen = /* @__PURE__ */ new Map();
  for (const p of parts) for (const s of p.slots) seen.set(`${s.typeId}-${s.reservedTs}`, seen.get(`${s.typeId}-${s.reservedTs}`) ?? s);
  const slots = [...seen.values()].sort((a, b) => a.reservedTs - b.reservedTs || a.typeId - b.typeId);
  return { released: parts.every((p) => p.released), slots };
}

// src/core/machine.ts
var ACTIVITY_LIMIT = 50;
function initialState() {
  return { status: "idle", draft: null, activity: [], lastCheckedAt: null, current: null, booked: null, practice: false, submitted: false };
}
function log(s, now, text, kind = "info") {
  return { ...s, activity: [{ at: now, text, kind }, ...s.activity].slice(0, ACTIVITY_LIMIT) };
}
var note = log;
var label = (m) => `${formatNyDay(m.date)} ${m.slot.displayTime}`;
var windowOf = (d) => [nyDateTimeToMs(d.date, d.from), nyDateTimeToMs(d.date, d.to)];
function start(s, draft, now, practice = false) {
  const next = { ...s, status: "hunting", draft, current: null, booked: null, practice, submitted: false, lastCheckedAt: null };
  return log(next, now, practice ? "Practice run started" : "Hunt started");
}
function canStart(s) {
  return s.status !== "hunting" && s.status !== "booking" && s.status !== "needs-you";
}
function stop(s, now) {
  return log({ ...s, status: "idle", current: null }, now, "Stopped");
}
function daysToCheck(s, now) {
  if (s.status !== "hunting" || !s.draft) return [];
  return s.draft.days.filter((d) => windowOf(d)[1] > now);
}
function closest(slots, from, to) {
  const gap = (t) => t < from ? from - t : t - to;
  return slots.reduce((a, b) => gap(b.reservedTs) < gap(a.reservedTs) ? b : a);
}
function onChecks(s, results, now) {
  if (s.status !== "hunting" || !s.draft) return { state: s, book: null };
  const { draft } = s;
  let state = { ...s, lastCheckedAt: now };
  const matches = [];
  const notes = [];
  let near = false;
  for (const r of results) {
    const day = draft.days.find((d) => d.date === r.date);
    if (!day) continue;
    if ("error" in r) {
      state = log(state, now, `Check failed (${formatNyDay(r.date)}): ${r.error}`, "error");
      continue;
    }
    if (!r.inventory.released) {
      notes.push(`${formatNyDay(r.date)} not released yet`);
      continue;
    }
    const [from, to] = windowOf(day);
    const inWindow = r.inventory.slots.filter((x) => x.reservedTs >= from && x.reservedTs <= to);
    if (inWindow.length) {
      matches.push({ date: r.date, slot: inWindow[0], partySize: draft.partySize });
    } else if (r.inventory.slots.length) {
      near = true;
      notes.push(`${formatNyDay(r.date)} closest ${formatNyTime(closest(r.inventory.slots, from, to).reservedTs)}`);
    } else {
      notes.push(`${formatNyDay(r.date)} nothing open nearby`);
    }
  }
  if (matches.length) {
    const book = matches.sort((a, b) => a.date.localeCompare(b.date) || a.slot.reservedTs - b.slot.reservedTs)[0];
    state = log({ ...state, status: "booking", current: book }, now, `Found ${label(book)} \u2014 booking`, "hit");
    return { state, book };
  }
  if (notes.length || !results.length) {
    state = log(state, now, ["Nothing in window", ...notes].join(" \u2014 "), near ? "near" : "info");
  }
  if (daysToCheck(state, now).length === 0) {
    state = log({ ...state, status: "ended" }, now, "All days passed \u2014 no table found");
  }
  return { state, book: null };
}
function onBookingOutcome(s, outcome, detail, now) {
  if (s.status !== "booking" && s.status !== "needs-you" || !s.current) return s;
  const m = s.current;
  switch (outcome) {
    case "submitting":
      return log({ ...s, submitted: true }, now, "Pressed Complete Reservation");
    case "booked":
      return log({ ...s, status: "booked", booked: m, current: null, submitted: false }, now, `Booked ${label(m)}, party of ${m.partySize}`, "hit");
    case "needs-you":
      return log({ ...s, status: "needs-you" }, now, "Wisely wants a puzzle solved \u2014 waiting for you", "error");
    case "rejected":
      return log({ ...s, status: "hunting", current: null, submitted: false }, now, `Wisely refused: ${detail} \u2014 still hunting`, "error");
    case "failed":
      if (s.submitted) return unconfirmed(s, detail, now);
      return log({ ...s, status: "hunting", current: null }, now, `Booking failed: ${detail} \u2014 still hunting`, "error");
    case "practice-ready":
      return log({ ...s, status: "idle", current: null }, now, "Practice run filled the form \u2014 not confirmed");
  }
}
function unconfirmed(s, detail, now) {
  const what = s.current ? `the ${label(s.current)} booking` : "the booking";
  return log({ ...s, status: "unconfirmed", submitted: false }, now, `Couldn't confirm ${what} (${detail}) \u2014 check your email before hunting again`, "error");
}
function recoverAfterRestart(s, now) {
  if (s.status !== "booking" && s.status !== "needs-you") return s;
  if (s.submitted) return unconfirmed(s, "Chrome restarted mid-booking", now);
  return log({ ...s, status: "hunting", current: null }, now, "Chrome restarted mid-booking \u2014 still hunting", "error");
}
function onBookingTimeout(s, now) {
  if (s.status !== "booking") return s;
  return onBookingOutcome(s, "failed", "booking page didn't respond", now);
}

// extension/src/alerts.ts
var ICON = "icon-128.png";
async function beep(times, freq) {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Plays the alert when a table is booked or needs attention"
    });
  }
  await chrome.runtime.sendMessage({ kind: "beep", times, freq });
}
async function notify(id, title, message, sticky) {
  await chrome.notifications.create(id, { type: "basic", iconUrl: ICON, title, message, priority: 2, requireInteraction: sticky });
}
async function focusTab(tabId) {
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (tab?.windowId !== void 0) await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
}
async function alertBooked(m) {
  await notify("hw-booked", "\u2713 Hillstone booked", `${formatNyDay(m.date)}, ${m.slot.displayTime}, party of ${m.partySize}`, false);
  await beep(3, 880);
}
async function alertNeedsYou(tabId) {
  await focusTab(tabId);
  await notify("hw-needs-you", "\u26A0 Hillstone needs you", `Wisely wants a "prove you're human" puzzle. Solve it to finish the booking.`, true);
  await beep(8, 660);
}
async function alertEnded() {
  await notify("hw-ended", "Hillstone hunt ended", "Every day in the hunt has passed without a table.", false);
}
async function alertUnconfirmed(tabId) {
  if (tabId !== null) await focusTab(tabId).catch(() => void 0);
  await notify("hw-unconfirmed", "\u26A0 Hillstone: couldn't confirm", "The booking was submitted but the result is unclear. Check the email/text from Wisely before hunting again.", true);
  await beep(8, 660);
}

// extension/src/storage.ts
var STATE = "hw:state";
var GUEST = "hw:guest";
var JOB = "hw:job";
async function loadState() {
  return (await chrome.storage.local.get(STATE))[STATE] ?? initialState();
}
async function saveState(s) {
  await chrome.storage.local.set({ [STATE]: s });
}
async function loadGuest() {
  return (await chrome.storage.local.get(GUEST))[GUEST] ?? null;
}
async function saveGuest(g) {
  await chrome.storage.local.set({ [GUEST]: g });
}
async function loadJobTab() {
  return (await chrome.storage.session.get(JOB))[JOB] ?? null;
}
async function saveJobTab(tabId) {
  if (tabId === null) await chrome.storage.session.remove(JOB);
  else await chrome.storage.session.set({ [JOB]: tabId });
}

// extension/src/background.ts
var CHECK = "hw-check";
var BOOKING_TIMEOUT = "hw-booking-timeout";
var queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => void 0);
  return run;
}
async function ensureAlarm(s) {
  if (s.status === "hunting") {
    if (!await chrome.alarms.get(CHECK)) await chrome.alarms.create(CHECK, { periodInMinutes: 0.5 });
  } else {
    await chrome.alarms.clear(CHECK);
  }
}
async function snapshot() {
  const [state, guest] = await Promise.all([loadState(), loadGuest()]);
  return {
    state,
    guest: guest && { firstName: guest.firstName, lastName: guest.lastName, wheelchair: guest.wheelchair, saved: true }
  };
}
async function closeJobTab() {
  const tabId = await loadJobTab();
  await saveJobTab(null);
  await chrome.alarms.clear(BOOKING_TIMEOUT);
  if (tabId !== null) await chrome.tabs.remove(tabId).catch(() => void 0);
}
async function fetchDay(day, partySize) {
  try {
    const parts = [];
    for (const time of searchPoints(day)) {
      const res = await fetch(inventoryUrl(day.date, time, partySize), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      parts.push(parseInventory(await res.json().catch(() => null), partySize));
    }
    return { date: day.date, inventory: mergeInventories(parts) };
  } catch (e) {
    return { date: day.date, error: e instanceof Error ? e.message : String(e) };
  }
}
async function runCheck() {
  try {
    await checkOnce();
  } catch (e) {
    await serial(async () => saveState(note(await loadState(), Date.now(), `Check crashed: ${e instanceof Error ? e.message : e}`, "error")));
  }
}
async function checkOnce() {
  const before = await loadState();
  const days = daysToCheck(before, Date.now());
  if (before.status !== "hunting" || !before.draft) return;
  const results = [];
  for (const d of days) results.push(await fetchDay(d, before.draft.partySize));
  await serial(async () => {
    const { state, book } = onChecks(await loadState(), results, Date.now());
    await saveState(state);
    await ensureAlarm(state);
    if (book) {
      const tab = await chrome.tabs.create({ url: BOOKING_URL, active: false });
      await saveJobTab(tab.id ?? null);
      await chrome.alarms.create(BOOKING_TIMEOUT, { delayInMinutes: 1.5 });
    } else if (state.status === "ended") {
      await alertEnded();
    }
  });
}
async function handleSite(msg) {
  const error = (message) => ({ type: "error", message });
  switch (msg.type) {
    case "hello":
      break;
    case "start": {
      const problem = validateDraft(msg.draft, Date.now()) ?? (!await loadGuest() ? "Save the guest details first" : null);
      if (problem) return error(problem);
      const started = await serial(async () => {
        const current = await loadState();
        if (!canStart(current)) return false;
        const next = start(current, msg.draft, Date.now(), !!msg.practice);
        await saveState(next);
        await ensureAlarm(next);
        return true;
      });
      if (!started) return error("A hunt is already running \u2014 stop it first");
      void runCheck();
      break;
    }
    case "stop":
      await serial(async () => {
        await closeJobTab();
        const next = stop(await loadState(), Date.now());
        await saveState(next);
        await ensureAlarm(next);
      });
      break;
    case "saveGuest": {
      const merged = mergeGuest(await loadGuest(), msg.guest);
      const problem = validateGuest(merged);
      if (problem) return error(problem);
      await saveGuest(merged);
      break;
    }
  }
  return { type: "snapshot", snapshot: await snapshot() };
}
async function handleOutcome(tabId, outcome, detail) {
  await serial(async () => {
    const jobTab = await loadJobTab();
    if (tabId === void 0 || tabId !== jobTab) return;
    const before = await loadState();
    const next = onBookingOutcome(before, outcome, detail, Date.now());
    if (next === before) return;
    await saveState(next);
    await chrome.alarms.clear(BOOKING_TIMEOUT);
    if (outcome === "submitting") {
      await chrome.alarms.create(BOOKING_TIMEOUT, { delayInMinutes: 3 });
    } else if (next.status === "booked" && next.booked) {
      await saveJobTab(null);
      await alertBooked(next.booked);
    } else if (next.status === "needs-you") {
      await alertNeedsYou(tabId);
    } else if (next.status === "unconfirmed") {
      await saveJobTab(null);
      await alertUnconfirmed(tabId);
    } else if (outcome === "practice-ready") {
      await saveJobTab(null);
    } else {
      await closeJobTab();
    }
    await ensureAlarm(next);
  });
}
async function jobFor(tabId) {
  const [jobTab, state, guest] = await Promise.all([loadJobTab(), loadState(), loadGuest()]);
  if (tabId === void 0 || tabId !== jobTab || !guest || !state.current) return null;
  if (state.status !== "booking" && state.status !== "needs-you") return null;
  return { match: state.current, guest, practice: state.practice };
}
chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
  if (m.kind === "site") handleSite(m.msg).then(sendResponse);
  else if (m.kind === "getJob") jobFor(sender.tab?.id).then(sendResponse);
  else if (m.kind === "outcome") handleOutcome(sender.tab?.id, m.outcome, m.detail).then(() => sendResponse(true));
  else return false;
  return true;
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === CHECK) void runCheck();
  if (a.name === BOOKING_TIMEOUT) {
    void serial(async () => {
      const before = await loadState();
      const next = onBookingTimeout(before, Date.now());
      if (next === before) return;
      await saveState(next);
      if (next.status === "unconfirmed") {
        const tabId = await loadJobTab();
        await saveJobTab(null);
        await alertUnconfirmed(tabId);
      } else {
        await closeJobTab();
      }
      await ensureAlarm(next);
    });
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void loadJobTab().then((jobTab) => {
    if (jobTab === tabId) void handleOutcome(tabId, "failed", "Wisely tab was closed");
  });
});
chrome.notifications.onClicked.addListener(() => {
  void loadJobTab().then((tabId) => {
    if (tabId !== null) void focusTab(tabId);
  });
});
var resume = () => void serial(async () => {
  const before = await loadState();
  const next = await loadJobTab() === null ? recoverAfterRestart(before, Date.now()) : before;
  if (next !== before) await saveState(next);
  if (next.status === "unconfirmed") await alertUnconfirmed(null);
  await ensureAlarm(next);
});
chrome.runtime.onStartup.addListener(resume);
chrome.runtime.onInstalled.addListener(resume);

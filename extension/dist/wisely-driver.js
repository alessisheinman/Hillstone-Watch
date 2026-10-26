"use strict";
(() => {
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

  // src/core/inventory.ts
  function isConfirmationPath(path) {
    return /^\/hillstone-park-avenue\/[^/]+\/confirm\/?$/.test(path);
  }
  var SPAN = 4 * 60;

  // extension/src/wisely-selectors.ts
  var SEL = {
    // Search page
    guests: 'select[aria-label="Number of Guests"]',
    // options read " 2 guests "
    dateBox: ".input--expandable",
    // clicking it opens the calendar below
    dateInput: 'input[aria-label="Date"]',
    // shows YYYY-MM-DD; read-only, set through the calendar
    monthLabel: ".calendar__month__label",
    // " November 2026 "
    nextMonth: 'a[aria-label="Next Month"]',
    dayCircle: ".calendar__month__day__circle--existing:not(.calendar__month__day__circle--passed)",
    // text " 7 "
    time: 'select[aria-label="Time"]',
    // options read " 07:00 PM "
    section: ".reservations-available__reservation",
    // one per type (Dinner, Lunch)
    sectionTitle: ".reservations-available__reservation__header__title",
    // " Dinner "
    slotButton: "button.reservations-available__reservation__btn",
    // " 9:00 PM "
    // Review page (/hillstone-park-avenue/review)
    firstName: "#first_name",
    lastName: "#last_name",
    email: "#email",
    phone: "input.vti__input",
    // vue-tel-input, US by default
    wheelchair: "#Wheelchair",
    // checkbox under "Special requests (optional)"
    complete: "button.page--review__button--complete",
    // "Complete Reservation"
    submitError: ".page--review__submit-error",
    arkoseFrame: 'iframe[src*="arkoselabs"]'
    // the "prove you're human" puzzle
  };
  var OPT_IN_LABEL = /market|promot|offer|news|sms|text me|email me|updates/i;
  var norm = (s) => s.replace(/\s+/g, " ").trim().replace(/^0/, "");
  function findSlotButton(typeName, displayTime) {
    for (const section of document.querySelectorAll(SEL.section)) {
      if (norm(section.querySelector(SEL.sectionTitle)?.textContent ?? "") !== typeName) continue;
      for (const b of section.querySelectorAll(SEL.slotButton)) {
        if (norm(b.textContent ?? "") === norm(displayTime)) return b;
      }
    }
    return null;
  }

  // extension/src/wisely-driver.ts
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  var text = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  var visible = (el) => !!el && el.getBoundingClientRect().width > 0;
  function report(outcome, detail = "") {
    return chrome.runtime.sendMessage({ kind: "outcome", outcome, detail });
  }
  async function waitFor(find, what, timeoutMs = 15e3) {
    const end = Date.now() + timeoutMs;
    for (; ; ) {
      const found = find();
      if (found) return found;
      if (Date.now() > end) throw new Error(`${what} not found`);
      await sleep(150);
    }
  }
  function setInput(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }
  function chooseOption(select, pick) {
    const i = [...select.options].findIndex((o) => !o.disabled && pick(text(o)));
    if (i < 0) return false;
    if (select.selectedIndex !== i) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }
  var minutes = (label) => {
    const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label);
    return m ? (+m[1] % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + +m[2] : NaN;
  };
  async function pickDate(date) {
    const [y, mo, d] = date.split("-").map(Number);
    const month = new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    if ((document.querySelector(SEL.dateInput)?.value ?? "") === date) return;
    (await waitFor(() => document.querySelector(SEL.dateBox), "date box")).click();
    for (let i = 0; i < 3 && text(await waitFor(() => document.querySelector(SEL.monthLabel), "calendar")) !== month; i++) {
      (await waitFor(() => document.querySelector(SEL.nextMonth), "next month")).click();
      await sleep(300);
    }
    const day = await waitFor(
      () => [...document.querySelectorAll(SEL.dayCircle)].find((c) => text(c) === String(d)),
      `${month} ${d} in the calendar`
    );
    day.click();
    await waitFor(() => document.querySelector(SEL.dateInput)?.value === date, "chosen date");
  }
  async function searchAndPickSlot({ match }) {
    const party = new RegExp(`^${match.partySize} guests?$`);
    await waitFor(() => {
      const g = document.querySelector(SEL.guests);
      return !!g && chooseOption(g, (l) => party.test(l));
    }, "party size option");
    await pickDate(match.date);
    const timeSelect = await waitFor(() => document.querySelector(SEL.time), "time");
    const target = minutes(match.slot.displayTime);
    const labels = [...timeSelect.options].filter((o) => !o.disabled).map((o) => text(o));
    const nearest = labels.reduce((a, b) => Math.abs(minutes(b) - target) < Math.abs(minutes(a) - target) ? b : a);
    chooseOption(timeSelect, (l) => l === nearest);
    const button = await waitFor(() => findSlotButton(match.slot.typeName, match.slot.displayTime), "Slot no longer listed", 15e3).catch(() => {
      throw new Error("Slot no longer listed");
    });
    button.click();
  }
  async function fillGuest({ guest }) {
    setInput(await waitFor(() => document.querySelector(SEL.firstName), "guest form", 15e3), guest.firstName);
    setInput(document.querySelector(SEL.lastName), guest.lastName);
    setInput(document.querySelector(SEL.email), guest.email);
    setInput(document.querySelector(SEL.phone), guest.phone.replace(/\D/g, "").slice(-10));
    const wheelchair = document.querySelector(SEL.wheelchair);
    if (wheelchair && wheelchair.checked !== guest.wheelchair) wheelchair.click();
    for (const box of document.querySelectorAll("input[type=checkbox]")) {
      const label = text(box.closest("label")) || text(document.querySelector(`label[for="${box.id}"]`));
      if (box.checked && OPT_IN_LABEL.test(label)) box.click();
    }
  }
  async function watchOutcome() {
    let askedForHelp = false;
    let end = Date.now() + 6e4;
    for (; ; ) {
      if (isConfirmationPath(location.pathname)) return report("booked", location.pathname);
      if (!location.pathname.endsWith("/review")) return report("failed", `Wisely went to ${location.pathname}`);
      const error = document.querySelector(SEL.submitError);
      if (visible(error)) return report("rejected", text(error) || "Wisely refused the booking");
      const puzzle = [...document.querySelectorAll(SEL.arkoseFrame)].some((f) => f.getBoundingClientRect().height > 80);
      if (puzzle && !askedForHelp) {
        askedForHelp = true;
        end = Date.now() + 15 * 6e4;
        await report("needs-you");
      }
      if (Date.now() > end) {
        const hints = [...document.querySelectorAll('[class*="error"]')].filter(visible).map(text).filter(Boolean).join("; ");
        return report("failed", hints || "No response from Wisely");
      }
      await sleep(250);
    }
  }
  async function run() {
    const job = await chrome.runtime.sendMessage({ kind: "getJob" });
    if (!job || !/^\/hillstone-park-avenue\/?$/.test(location.pathname)) return;
    try {
      await searchAndPickSlot(job);
      await fillGuest(job);
      if (job.practice) return void await report("practice-ready");
      const complete = await waitFor(() => document.querySelector(SEL.complete), "Complete Reservation button");
      await report("submitting");
      complete.click();
      await watchOutcome();
    } catch (e) {
      await report("failed", e instanceof Error ? e.message : String(e));
    }
  }
  void run();
})();

// What we drive on reservations.getwisely.com/hillstone-park-avenue, mapped 2026-10-26.
// If Wisely changes its page, this is the file to update (`node scripts/smoke-extension.mjs practice` shows quickly whether it still works).

export const SEL = {
  // Search page
  guests: 'select[aria-label="Number of Guests"]', // options read " 2 guests "
  dateBox: '.input--expandable', // clicking it opens the calendar below
  dateInput: 'input[aria-label="Date"]', // shows YYYY-MM-DD; read-only, set through the calendar
  monthLabel: '.calendar__month__label', // " November 2026 "
  nextMonth: 'a[aria-label="Next Month"]',
  dayCircle: '.calendar__month__day__circle--existing:not(.calendar__month__day__circle--passed)', // text " 7 "
  time: 'select[aria-label="Time"]', // options read " 07:00 PM "
  section: '.reservations-available__reservation', // one per type (Dinner, Lunch)
  sectionTitle: '.reservations-available__reservation__header__title', // " Dinner "
  slotButton: 'button.reservations-available__reservation__btn', // " 9:00 PM "

  // Review page (/hillstone-park-avenue/review)
  firstName: '#first_name',
  lastName: '#last_name',
  email: '#email',
  phone: 'input.vti__input', // vue-tel-input, US by default
  wheelchair: '#Wheelchair', // checkbox under "Special requests (optional)"
  complete: 'button.page--review__button--complete', // "Complete Reservation"
  submitError: '.page--review__submit-error',
  arkoseFrame: 'iframe[src*="arkoselabs"]', // the "prove you're human" puzzle
} as const;

/** Labels of opt-in boxes we must leave unticked if Wisely ever shows them. */
export const OPT_IN_LABEL = /market|promot|offer|news|sms|text me|email me|updates/i;

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/^0/, '');

export function findSlotButton(typeName: string, displayTime: string): HTMLElement | null {
  for (const section of document.querySelectorAll<HTMLElement>(SEL.section)) {
    if (norm(section.querySelector(SEL.sectionTitle)?.textContent ?? '') !== typeName) continue;
    for (const b of section.querySelectorAll<HTMLElement>(SEL.slotButton)) {
      if (norm(b.textContent ?? '') === norm(displayTime)) return b;
    }
  }
  return null;
}

import { addDay, MAX_DAYS, removeDay } from '../core/hunt';
import type { HuntDay, HuntDraft, PartySize } from '../core/types';

interface Props {
  draft: HuntDraft;
  onChange: (d: HuntDraft) => void;
  locked: boolean;
  busy: boolean;
  blocker: string | null;
  onStart: () => void;
  onStop: () => void;
}

const SIZES: PartySize[] = [1, 2, 3, 4];

export function HuntCard({ draft, onChange, locked, busy, blocker, onStart, onStop }: Props) {
  const setDay = (i: number, patch: Partial<HuntDay>) =>
    onChange({ ...draft, days: draft.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });

  return (
    <section className="card">
      <h3>The hunt</h3>
      <fieldset disabled={locked}>
        <div className="label">Party size</div>
        <div className="seg" role="group" aria-label="Party size">
          {SIZES.map((n) => (
            <button key={n} type="button" className={draft.partySize === n ? 'on' : ''} onClick={() => onChange({ ...draft, partySize: n })}>
              {n}
            </button>
          ))}
        </div>

        <div className="label">{draft.days.length > 1 ? 'Days & time windows' : 'Day & time window'}</div>
        {draft.days.map((d, i) => (
          <div className="day" key={i}>
            <input type="date" aria-label="Date" value={d.date} onChange={(e) => setDay(i, { date: e.target.value })} />
            <input type="time" aria-label="From" step={900} value={d.from} onChange={(e) => setDay(i, { from: e.target.value })} />
            <span className="to">to</span>
            <input type="time" aria-label="To" step={900} value={d.to} onChange={(e) => setDay(i, { to: e.target.value })} />
            {draft.days.length > 1 ? (
              <button type="button" className="x" aria-label="Remove day" onClick={() => onChange(removeDay(draft, i))}>✕</button>
            ) : <span />}
          </div>
        ))}
        {draft.days.length < MAX_DAYS && (
          <button type="button" className="link add" onClick={() => onChange(addDay(draft))}>
            + Add another day <span className="hint">(optional, up to {MAX_DAYS} — copies the first day's times)</span>
          </button>
        )}
      </fieldset>

      <p className="hint">The first table found gets booked straight away, then the hunt stops.</p>
      {!busy && blocker && <p className="problem">{blocker}</p>}
      {busy ? (
        <button type="button" className="go stop" onClick={onStop}>Stop hunting</button>
      ) : (
        <button type="button" className="go" disabled={!!blocker} onClick={onStart}>Start hunting</button>
      )}
    </section>
  );
}

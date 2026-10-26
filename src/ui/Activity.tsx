import { formatNyTime } from '../core/time';
import type { ActivityEntry } from '../core/types';

interface Props {
  entries: ActivityEntry[];
  canPractice: boolean;
  onPractice: () => void;
}

export function Activity({ entries, canPractice, onPractice }: Props) {
  return (
    <section className="card">
      <h3>Activity</h3>
      {entries.length === 0 ? (
        <p className="hint">Nothing yet.</p>
      ) : (
        <ol className="log">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`} className={e.kind}>
              <time>{formatNyTime(e.at)}</time> {e.text}
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="link practice" disabled={!canPractice} onClick={onPractice}>
        Practice run (fills the form, doesn't confirm)
      </button>
    </section>
  );
}

import { formatNyTime } from '../core/time';
import type { ActivityEntry } from '../core/types';

interface Props {
  entries: ActivityEntry[];
}

export function Activity({ entries }: Props) {
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
    </section>
  );
}

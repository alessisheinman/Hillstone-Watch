import type { HuntState } from '../core/types';

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
}

export function StatusPill({ state, now }: { state: HuntState; now: number }) {
  const text = {
    idle: 'Idle',
    hunting: state.lastCheckedAt ? `${state.practice ? 'Practice' : 'Hunting'} · last checked ${ago(now - state.lastCheckedAt)}` : 'Hunting · checking…',
    booking: 'Booking…',
    'needs-you': 'Needs you',
    booked: 'Booked',
    ended: 'Ended — no table',
  }[state.status];
  return (
    <span className={`pill pill-${state.status}`}>
      <i aria-hidden="true" />
      {text}
    </span>
  );
}

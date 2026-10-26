import { useCallback, useEffect, useState } from 'react';
import { newDraft, validateDraft } from '../core/hunt';
import { formatNyDay } from '../core/time';
import type { ExtSnapshot, Guest, HuntDraft } from '../core/types';
import { Activity } from './Activity';
import { connect, send } from './bridge';
import { DogLightbox, DogRails, DogStrip, type DogPhoto } from './DogRails';
import { ExtensionBanner } from './ExtensionBanner';
import { GuestCard } from './GuestCard';
import { HuntCard } from './HuntCard';
import { StatusPill } from './StatusPill';

const BUSY = new Set(['hunting', 'booking', 'needs-you']);

export function App() {
  const [connected, setConnected] = useState<boolean | null>(null); // null while still looking for the extension
  const [snapshot, setSnapshot] = useState<ExtSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<HuntDraft>(() => newDraft(Date.now()));
  const [now, setNow] = useState(Date.now());
  const [dog, setDog] = useState<DogPhoto | null>(null);
  const closeDog = useCallback(() => setDog(null), []);

  useEffect(() => {
    let first = true;
    connect(window, (m) => {
      if (m.type === 'error') return setError(m.message);
      setError(null);
      setConnected(true); // a slow-starting extension can answer after connect() has given up
      setSnapshot(m.snapshot);
      // Pick up the hunt the extension is already running (or last ran) when the page first opens.
      if (first && m.snapshot.state.draft) setDraft(m.snapshot.state.draft);
      first = false;
    }).then((found) => setConnected((c) => c || found));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = snapshot?.state ?? null;
  const busy = !!state && BUSY.has(state.status);
  const problem = validateDraft(draft, now);
  const blocker = !connected ? 'Extension not found' : !snapshot?.guest?.saved ? 'Save the guest details first' : problem;

  const startHunt = (practice = false) => send(window, { type: 'start', draft, practice });
  const saveGuest = (guest: Guest) => send(window, { type: 'saveGuest', guest });

  return (
    <div className="app">
      <DogRails onOpen={setDog} />
      <header className="topbar">
        <span className="brand">Hillstone Watch</span>
        {state && <StatusPill state={state} now={now} />}
      </header>
      <DogStrip onOpen={setDog} />
      {dog && <DogLightbox photo={dog} onClose={closeDog} />}

      {connected === false && <ExtensionBanner />}
      {error && <div className="banner bad">{error}</div>}
      {state?.status === 'booked' && state.booked && (
        <div className="banner good">
          ✓ Booked — {formatNyDay(state.booked.date)}, {state.booked.slot.displayTime}, party of {state.booked.partySize}
        </div>
      )}
      {state?.status === 'unconfirmed' && (
        <div className="banner bad">
          ⚠ Couldn't confirm whether the booking went through, so the hunt stopped to avoid booking twice. Check the
          email/text from Wisely (and the Wisely tab), then start again only if there's no reservation.
        </div>
      )}
      {state?.status === 'needs-you' && (
        <div className="banner bad">⚠ Wisely wants a "prove you're human" puzzle — switch to the Wisely tab and solve it to finish the booking.</div>
      )}

      <main className="grid">
        <HuntCard
          draft={draft}
          onChange={setDraft}
          locked={busy}
          busy={busy}
          blocker={blocker}
          onStart={() => startHunt()}
          onStop={() => send(window, { type: 'stop' })}
        />
        <div className="side">
          <GuestCard guest={snapshot?.guest ?? null} disabled={!connected} onSave={saveGuest} />
          <Activity
            entries={state?.activity ?? []}
            canPractice={!busy && !blocker}
            onPractice={() => startHunt(true)}
          />
        </div>
      </main>
      <p className="footnote">Works only while Chrome is open and the PC is awake.</p>
    </div>
  );
}

import { useState } from 'react';
import type { ExtSnapshot, Guest } from '../core/types';

interface Props {
  guest: ExtSnapshot['guest'];
  disabled: boolean;
  onSave: (g: Guest) => void;
}

export function GuestCard({ guest, disabled, onSave }: Props) {
  const [editing, setEditing] = useState<Guest | null>(null);
  const saved = !!guest?.saved;

  const begin = () =>
    setEditing({ firstName: guest?.firstName ?? '', lastName: guest?.lastName ?? '', email: '', phone: '', wheelchair: guest?.wheelchair ?? false });
  const field = (key: 'firstName' | 'lastName' | 'email' | 'phone', label: string, type = 'text') => (
    <label>
      <span>{label}</span>
      <input
        type={type}
        value={editing![key]}
        placeholder={saved && (key === 'email' || key === 'phone') ? 'saved — leave blank to keep' : ''}
        onChange={(e) => setEditing({ ...editing!, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <section className="card">
      <h3>Booking for</h3>
      {editing ? (
        <form
          className="guest-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(editing);
            setEditing(null);
          }}
        >
          {field('firstName', 'First name')}
          {field('lastName', 'Last name')}
          {field('email', 'Email', 'email')}
          {field('phone', 'Phone', 'tel')}
          <label className="check">
            <input type="checkbox" checked={editing.wheelchair} onChange={(e) => setEditing({ ...editing, wheelchair: e.target.checked })} />
            <span>Wheelchair accessible table</span>
          </label>
          <div className="row">
            <button type="submit" className="primary">Save</button>
            <button type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      ) : saved ? (
        <>
          <dl className="kv">
            <dt>Name</dt><dd>{guest!.firstName} {guest!.lastName}</dd>
            <dt>Email</dt><dd>saved</dd>
            <dt>Phone</dt><dd>saved</dd>
            <dt>Wheelchair</dt><dd>{guest!.wheelchair ? 'Yes' : 'No'}</dd>
          </dl>
          <button type="button" className="link" disabled={disabled} onClick={begin}>Edit details</button>
        </>
      ) : (
        <button type="button" className="primary" disabled={disabled} onClick={begin}>Add guest details</button>
      )}
      <p className="hint">Saved in this browser only — never in the public code.</p>
    </section>
  );
}

/**
 * AgeGate — asks once for month and year of birth (never pre-filled, no
 * nudging towards an answer), then lets the server decide the experience.
 *
 *   adult          → the app
 *   minor_blocked  → an honest "available from 18 for now" screen with
 *                    one-tap account deletion (nothing else is processed)
 *   minor_pending  → "a parent or guardian needs to confirm" (only if the
 *                    under-18 experience is ever switched on)
 *
 * Accounts on a database without the age column (migration not applied) have
 * `birth_year_month === undefined` and are not asked.
 */
import { useCallback, useEffect, useState } from 'react';
import { authLog } from '../lib/authLog';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { MONTHS, yearOptions, toBirthYearMonth, takePendingAge, ageFrom, ADULT_AGE } from '../lib/age';
import VittovaLogo from './VittovaLogo';
import { SUPPORT_EMAIL } from '../lib/legal';

function Shell({ children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-10 text-ink">
      <div className="w-full max-w-sm">
        <div className="mb-6"><VittovaLogo size={40} /></div>
        {children}
      </div>
    </main>
  );
}

function AgeQuestion({ onDone }) {
  const { session } = useAuth();
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async (value) => {
    setBusy(true);
    setError('');
    try {
      const d = await apiJson('/account/age', { session, method: 'POST', body: { birthYearMonth: value } });
      authLog('AGE_SAVED');
      onDone(d.age);
    } catch (err) {
      if (err?.data?.code === 'AGE_ALREADY_SET') { onDone(null); return; }
      authLog('AGE_SAVE_FAILED');
      setError(friendlyError(err, "We couldn't save that. Please try again."));
    } finally {
      setBusy(false);
    }
  }, [session, onDone]);

  // An answer given at sign-up on this device is used once, automatically.
  useEffect(() => {
    authLog('AGE_REQUIRED');
    const pending = takePendingAge();
    if (pending) submit(pending);
  }, [submit]);

  const value = toBirthYearMonth(year, month);
  return (
    <Shell>
      <h1 className="text-2xl font-bold">When were you born?</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">Vittova adapts to your age. We only keep the month and year, and you can't change it later without contacting support.</p>
      <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); if (value) submit(value); }}>
        <div className="grid grid-cols-2 gap-3">
          <label className="v-field-label mb-0">Month
            <select value={month} onChange={(e) => setMonth(e.target.value)} required
              className="v-input mt-1.5 bg-surface px-3 font-normal">
              <option value="" disabled>Select</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="v-field-label mb-0">Year
            <select value={year} onChange={(e) => setYear(e.target.value)} required
              className="v-input mt-1.5 bg-surface px-3 font-normal">
              <option value="" disabled>Select</option>
              {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={!value || busy} className="v-press v-btn-primary w-full">
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </Shell>
  );
}

function NotYetAvailable({ pending }) {
  const { session, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deleteNow = async () => {
    setBusy(true);
    setError('');
    try {
      await apiJson('/account', { session, method: 'DELETE', body: { confirmation: 'DELETE_MY_ACCOUNT' } });
      await logout();
    } catch (err) {
      setError(friendlyError(err, "We couldn't delete the account. Please try again or email us."));
      setBusy(false);
    }
  };
  return (
    <Shell>
      <h1 className="text-2xl font-bold">{pending ? 'A parent or guardian needs to confirm' : 'Vittova is for 18 and over, for now'}</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">
        {pending
          ? `Because you're under 18, a parent or guardian needs to confirm before you can use Vittova. Ask them to email ${SUPPORT_EMAIL} from their own address and we'll explain the next steps.`
          : "Because you're under 18, we can't set up Vittova for you yet. We haven't stored any spending data. You can delete this account now, and you're welcome back when you turn 18."}
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-6 space-y-2">
        <button type="button" onClick={deleteNow} disabled={busy} className="v-press v-btn-primary w-full">
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
        <button type="button" onClick={() => logout()} className="v-press v-btn-secondary min-h-12 w-full">Sign out</button>
      </div>
    </Shell>
  );
}

export default function AgeGate({ children }) {
  const { user, session } = useAuth();
  const [experience, setExperience] = useState(null);
  const asked = user && user.birth_year_month === null;
  const knownMinor = user?.birth_year_month && ageFrom(user.birth_year_month) < ADULT_AGE;

  // A known minor's experience comes from the server (blocked / pending / teen).
  useEffect(() => {
    if (!knownMinor || !session) return;
    apiJson('/account/age', { session }).then((d) => setExperience(d.age.experience)).catch(() => setExperience('minor_blocked'));
  }, [knownMinor, session]);

  if (experience === 'minor_blocked' || experience === 'minor_pending') return <NotYetAvailable pending={experience === 'minor_pending'} />;
  if (asked && experience === null) {
    return <AgeQuestion onDone={(age) => (age ? setExperience(age.experience) : window.location.reload())} />;
  }
  return children;
}

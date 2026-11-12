/**
 * Vittova AI memory — what the person chose to tell Vittova AI, which it uses
 * to personalise answers. Everything here is visible, editable and deletable;
 * turning personalisation off forgets it all and stops new memories.
 */
import { useCallback, useEffect, useState } from 'react';
import { Brain, Check, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import BackButton from '../components/BackButton';
import { EmptyState, ErrorState, Skeleton } from '../components/ui';

const KIND_LABEL = {
  income_cycle: 'Income', goal: 'Goal', preference: 'Preference', situation: 'About you', habit_target: 'Habit', language: 'Language',
};
const KINDS = Object.keys(KIND_LABEL);
const FIELD = 'min-h-[44px] w-full rounded-xl border border-line-strong bg-surface-2 px-3 text-ink';

function MemoryRow({ memory, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(memory.content);
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onSave(memory.id, text); setEditing(false); } finally { setBusy(false); }
  };
  return (
    <li className="py-3">
      <p className="text-xs font-medium text-ink-3">{KIND_LABEL[memory.kind] || 'Note'}</p>
      {editing ? (
        <form onSubmit={save} className="mt-1 flex gap-2">
          <label htmlFor={`mem-${memory.id}`} className="sr-only">Edit memory</label>
          <input id={`mem-${memory.id}`} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} className={FIELD} autoFocus />
          <button type="submit" disabled={busy || text.trim().length < 2} aria-label="Save" className="v-press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-bg disabled:opacity-50"><Check className="h-4 w-4" aria-hidden="true" /></button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-[15px] text-ink">{memory.content}</p>
          <span className="flex shrink-0">
            <button type="button" aria-label={`Edit: ${memory.content}`} onClick={() => setEditing(true)} className="flex h-11 w-11 items-center justify-center text-ink-3"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" aria-label={`Forget: ${memory.content}`} onClick={() => onDelete(memory.id)} className="flex h-11 w-11 items-center justify-center text-ink-3"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
          </span>
        </div>
      )}
    </li>
  );
}

export default function AiMemory() {
  const { session } = useAuth();
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('goal');
  const [content, setContent] = useState('');

  const load = useCallback(async () => {
    setFailed(false);
    try { setState(await apiJson('/ai/memory', { session })); } catch { setFailed(true); }
  }, [session]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, fallback) => {
    setError('');
    try { await fn(); await load(); } catch (err) { setError(friendlyError(err, fallback)); }
  };
  const add = (e) => {
    e.preventDefault();
    act(async () => { await apiJson('/ai/memory', { session, method: 'POST', body: { kind, content } }); setContent(''); }, "We couldn't save that.");
  };
  const toggle = () => {
    const on = !state.personalisation;
    if (!on && !window.confirm('Turn off personalisation? Vittova AI will forget everything listed here and stop remembering new things.')) return;
    act(() => apiJson('/ai/memory/personalisation', { session, method: 'PUT', body: { on } }), "We couldn't change that.");
  };
  const forgetAll = () => {
    if (!window.confirm('Forget everything Vittova AI remembers about you? This cannot be undone.')) return;
    act(() => apiJson('/ai/memory', { session, method: 'DELETE' }), "We couldn't clear your memories.");
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-24 md:p-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold text-ink">Vittova AI memory</h1>
        <p className="mt-1 text-sm text-ink-2">Things you chose to tell Vittova AI, so its answers fit your life. It never saves anything without you confirming, and never your messages themselves.</p>
      </div>
      {failed && <ErrorState onRetry={load} message="We couldn't load your memories." />}
      {!failed && !state && <Skeleton className="h-48 w-full" />}
      {state && (
        <>
          <button type="button" role="switch" aria-checked={state.personalisation} onClick={toggle} className="v-block flex min-h-[64px] w-full items-center gap-3 p-4 text-left">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-ink">Personalise answers</span>
              <span className="block text-xs text-ink-3">{state.personalisation ? 'On: Vittova AI uses what is listed below.' : 'Off: nothing is remembered or used.'}</span>
            </span>
            <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${state.personalisation ? 'bg-accent' : 'bg-surface-3'}`}>
              <span className={`absolute left-0 top-0.5 block h-5 w-5 rounded-full bg-knob transition-transform ${state.personalisation ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </span>
          </button>

          {!state.available && <p className="v-block p-4 text-sm text-ink-soft">Memory is being set up. Please check again later.</p>}

          {state.available && state.personalisation && (
            <>
              {state.memories.length === 0
                ? <EmptyState icon={Brain} title="Nothing remembered yet" body="Tell Vittova AI things like when your salary arrives or what you're saving for, and confirm when it offers to remember." />
                : (
                  <ul className="v-block v-rows px-4">
                    {state.memories.map((m) => (
                      <MemoryRow key={m.id} memory={m}
                        onSave={(id, text) => act(() => apiJson(`/ai/memory/${id}`, { session, method: 'PATCH', body: { content: text } }), "We couldn't save that.")}
                        onDelete={(id) => act(() => apiJson(`/ai/memory/${id}`, { session, method: 'DELETE' }), "We couldn't remove that.")} />
                    ))}
                  </ul>
                )}

              {state.memories.length < state.max && (
                <form onSubmit={add} className="v-block space-y-3 p-4">
                  <p className="text-sm font-medium text-ink">Add something</p>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                    <label htmlFor="mem-kind" className="sr-only">Type</label>
                    <select id="mem-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={FIELD}>
                      {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                    <label htmlFor="mem-content" className="sr-only">What to remember</label>
                    <input id="mem-content" value={content} maxLength={200} onChange={(e) => setContent(e.target.value)} placeholder="e.g. Salary arrives on the 1st" className={FIELD} />
                  </div>
                  <button type="submit" disabled={content.trim().length < 2} className="v-press v-btn-primary min-h-[44px] px-4 text-sm disabled:opacity-50">Remember this</button>
                </form>
              )}

              {state.memories.length > 0 && <button type="button" onClick={forgetAll} className="v-press v-btn-text min-h-[44px] text-danger">Forget everything</button>}
            </>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <p className="text-xs text-ink-3">Memories are deleted with your account. Vittova AI gives general financial education, not investment advice.</p>
        </>
      )}
    </div>
  );
}

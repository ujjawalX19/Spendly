/**
 * ReceiptSplitSheet — divide a receipt item by item. A photo only fills the
 * list; nothing is saved until the person confirms, and every line can be
 * corrected first. Tax, tips and discounts are shared by the server in
 * proportion to each person's items (lib/receiptSplit).
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ScanLine, Trash2, X } from 'lucide-react';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { prepareReceiptImage } from '../lib/receiptImage';

const FIELD = 'min-h-[44px] w-full rounded-xl border border-line-strong bg-surface-2 px-3 text-ink';

export default function ReceiptSplitSheet({ group, members, me, session, onClose, onSaved }) {
  const everyone = members.map((m) => m.id);
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState('');
  const [paidBy, setPaidBy] = useState(me);
  const [items, setItems] = useState([{ name: '', price: '', participants: everyone }]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [needsPro, setNeedsPro] = useState(false);
  const fileRef = useRef(null);
  const clientRef = useRef(crypto.randomUUID());

  const fail = (err, fallback) => {
    if (err.status === 403 && err.data?.code === 'PRO_REQUIRED') setNeedsPro(true);
    else setError(friendlyError(err, fallback));
  };

  const scan = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('scan');
    setError('');
    try {
      const imageBase64 = await prepareReceiptImage(file);
      const { receipt } = await apiJson('/expenses/scan-items', { session, method: 'POST', body: { imageBase64 } });
      setDescription(receipt.merchant || '');
      setTotal(String(receipt.total));
      if (receipt.items?.length) {
        setItems(receipt.items.map((i) => ({ name: i.itemName || i.name || '', price: String(i.price ?? ''), participants: everyone })));
      }
    } catch (err) {
      fail(err, "We couldn't read that receipt. You can type the items instead.");
    } finally {
      setBusy('');
    }
  };

  const change = (i, patch) => setItems((list) => list.map((item, n) => (n === i ? { ...item, ...patch } : item)));
  const toggle = (i, id) => change(i, { participants: items[i].participants.includes(id) ? items[i].participants.filter((x) => x !== id) : [...items[i].participants, id] });

  const submit = async (e) => {
    e.preventDefault();
    setBusy('save');
    setError('');
    try {
      await apiJson(`/groups/${group.id}/receipt-split`, {
        session, method: 'POST',
        body: { description, total: Number(total), paidBy, clientRef: clientRef.current, items: items.map((i) => ({ name: i.name, price: Number(i.price), participants: i.participants })) },
      });
      onSaved();
    } catch (err) {
      fail(err, "We couldn't save the split. Please try again.");
      setBusy('');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      <div className="v-scrim absolute inset-0" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="split-title" className="v-sheet relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="split-title" className="text-lg font-bold text-ink">Split a receipt</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-2"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        {needsPro ? (
          <div>
            <p className="text-sm leading-relaxed text-ink-soft">Splitting a receipt item by item is part of Vittova Pro. You can still add a shared expense and split it equally.</p>
            <Link to="/pro" className="v-press v-btn-primary mt-3 inline-flex min-h-[44px] items-center px-4 text-sm no-underline">See Vittova Pro</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={scan} />
            <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} className="v-press v-btn-secondary min-h-[44px] w-full disabled:opacity-60"><ScanLine className="h-4 w-4" aria-hidden="true" /> {busy === 'scan' ? 'Reading…' : 'Fill from a photo'}</button>
            <p className="text-xs text-ink-3">The photo is read by Google Gemini to find the items, and isn't stored. Check the lines before saving.</p>
            <div><label htmlFor="split-desc" className="mb-1 block text-xs font-medium text-ink-2">Description</label><input id="split-desc" required maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} className={FIELD} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label htmlFor="split-total" className="mb-1 block text-xs font-medium text-ink-2">Total paid (₹)</label><input id="split-total" type="number" inputMode="decimal" min="0.01" step="0.01" required value={total} onChange={(e) => setTotal(e.target.value)} className={FIELD} /></div>
              <div><label htmlFor="split-paid" className="mb-1 block text-xs font-medium text-ink-2">Paid by</label><select id="split-paid" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={FIELD}>{members.map((m) => <option key={m.id} value={m.id}>{m.id === me ? `${m.name} (you)` : m.name}</option>)}</select></div>
            </div>
            {items.map((item, i) => (
              <fieldset key={i} className="rounded-xl border border-line p-3">
                <legend className="px-1 text-xs text-ink-3">Item {i + 1}</legend>
                <div className="flex gap-2">
                  <input aria-label={`Item ${i + 1} name`} placeholder="Item" required maxLength={80} value={item.name} onChange={(e) => change(i, { name: e.target.value })} className={`${FIELD} flex-1`} />
                  <input aria-label={`Item ${i + 1} price in rupees`} placeholder="₹" type="number" inputMode="decimal" min="0.01" step="0.01" required value={item.price} onChange={(e) => change(i, { price: e.target.value })} className={`${FIELD} !w-24`} />
                  {items.length > 1 && <button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => setItems((l) => l.filter((_, n) => n !== i))} className="flex h-11 w-9 shrink-0 items-center justify-center text-ink-3"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const on = item.participants.includes(m.id);
                    return <button key={m.id} type="button" aria-pressed={on} onClick={() => toggle(i, m.id)} className={`min-h-[36px] rounded-full border px-3 text-xs font-medium ${on ? 'border-accent bg-accent text-on-fill' : 'border-line-strong text-ink-2'}`}>{m.id === me ? 'You' : m.name}</button>;
                  })}
                </div>
              </fieldset>
            ))}
            <button type="button" onClick={() => setItems((l) => [...l, { name: '', price: '', participants: everyone }])} className="v-press v-btn-text min-h-[44px]"><Plus className="h-4 w-4" aria-hidden="true" /> Add item</button>
            <p className="text-xs text-ink-3">Tax, service, tips and discounts are shared in proportion to each person's items.</p>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={!!busy} className="v-press v-btn-primary min-h-[48px] w-full disabled:opacity-60">{busy === 'save' ? 'Saving…' : 'Save split'}</button>
          </form>
        )}
      </div>
    </div>
  );
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRunnable } from '../src/lib/aiActionRules.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

test('only known actions with valid values can run', () => {
  assert.ok(isRunnable({ tool: 'create_budget', args: { category: 'Food', limit_inr: 2000 } }));
  assert.ok(!isRunnable({ tool: 'create_budget', args: { category: 'Crypto', limit_inr: 2000 } }));
  assert.ok(!isRunnable({ tool: 'create_budget', args: { category: 'Food', limit_inr: -5 } }));
  assert.ok(isRunnable({ tool: 'create_savings_goal', args: { name: 'Laptop', targetInr: 30000, targetDate: '2027-05-01' } }));
  assert.ok(!isRunnable({ tool: 'create_savings_goal', args: { name: 'Laptop', targetInr: 30000, targetDate: 'soon' } }));
  assert.ok(isRunnable({ tool: 'remember', args: { kind: 'goal', content: 'Saving for a laptop' } }));
  assert.ok(!isRunnable({ tool: 'remember', args: { kind: 'password', content: 'x y z' } }));
  for (const tool of ['transfer_money', 'make_payment', 'cancel_subscription', 'change_bank_account']) assert.ok(!isRunnable({ tool, args: {} }), tool);
});

test('actions run only after a tap, and nothing in the chat moves money', () => {
  const chat = read('src/pages/Chatbot.jsx');
  assert.match(chat, /onClick=\{run\}[^>]*>\{state === 'busy' \? 'Saving…' : 'Do it'\}/);
  assert.match(chat, /'Not now'|>Not now</);
  assert.doesNotMatch(read('src/lib/aiActions.js'), /payment|transfer|razorpay|billing/i);
});

test('memory screen: visible, editable, deletable, and off forgets everything', () => {
  const page = read('src/pages/AiMemory.jsx');
  for (const call of ["method: 'PATCH'", "method: 'DELETE'", '/ai/memory/personalisation']) assert.ok(page.includes(call), call);
  assert.match(page, /forget everything listed here/);
  assert.ok(read('src/App.jsx').includes('path="/ai-memory"'));
});

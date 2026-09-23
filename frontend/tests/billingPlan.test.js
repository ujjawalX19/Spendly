// Pro purchase screen helpers: which plan is offered, how its period reads,
// and which purchase tokens are sent to the server for verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { periodLabel, pickPlan, tokensToVerify } from '../src/lib/billingPlan.js';

const here = dirname(fileURLToPath(import.meta.url));

test('billing periods read as words', () => {
  assert.equal(periodLabel('P1M'), 'month');
  assert.equal(periodLabel('P1Y'), 'year');
  assert.equal(periodLabel('P3M'), '3 months');
  assert.equal(periodLabel('P1W'), 'week');
  assert.equal(periodLabel('nonsense'), '');
});

test('the base plan is offered, with Google\'s own price', () => {
  const products = [{
    productId: 'vittova_pro', title: 'Vittova Pro',
    offers: [
      { offerToken: 'promo', offerId: 'launch-offer', price: '₹0', billingPeriod: 'P1W' },
      { offerToken: 'base', offerId: null, price: '₹99.00', billingPeriod: 'P1M' },
    ],
  }];
  assert.deepEqual(pickPlan(products, ['vittova_pro']), { productId: 'vittova_pro', title: 'Vittova Pro', offerToken: 'base', price: '₹99.00', period: 'month' });
  assert.equal(pickPlan([], ['vittova_pro']), null);
  assert.equal(pickPlan([{ productId: 'vittova_pro', offers: [] }], ['vittova_pro']), null);
});

test('only completed purchases are sent to the server; pending ones wait', () => {
  assert.deepEqual(tokensToVerify([
    { purchaseToken: 'a', state: 'purchased' },
    { purchaseToken: 'b', state: 'pending' },
    { state: 'purchased' },
    null,
  ]), ['a']);
});

test('the app never grants Pro or hard-codes a price', () => {
  for (const file of ['lib/billing.js', 'lib/billingPlan.js', 'pages/ProUpgrade.jsx', 'contexts/ProContext.jsx']) {
    // Code only: comments are allowed to describe what must never happen.
    const text = readFileSync(join(here, '..', 'src', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(text, /is_pro\s*[:=]\s*true|setProStatus\(\s*\{\s*isPro:\s*true/, file);
    assert.doesNotMatch(text, /₹\s?\d{2,}(\.\d\d)?\s*\/\s*(month|year)/i, file);
  }
});

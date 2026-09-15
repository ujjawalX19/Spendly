// Every expense category the app offers must be one the API accepts. The
// dashboard once offered 'Grocery', which the backend rejected, so those
// expenses failed silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const listFrom = (file, name) => {
  const src = readFileSync(join(here, file), 'utf8');
  const start = src.indexOf(`const ${name} = [`);
  assert.ok(start >= 0, `${name} not found in ${file}`);
  const body = src.slice(src.indexOf('[', start) + 1, src.indexOf(']', start));
  return body.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
};

test('app expense categories match the backend', () => {
  const backend = listFrom('../../backend/routes/expenses.js', 'VALID_CATEGORIES');
  for (const file of ['../src/pages/Dashboard.jsx', '../src/pages/Transactions.jsx']) {
    const offered = listFrom(file, 'CATEGORIES');
    assert.deepEqual(offered.filter((c) => !backend.includes(c)), [], file);
  }
});

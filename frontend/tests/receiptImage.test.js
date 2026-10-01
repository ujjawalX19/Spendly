// Receipt scan, phone side: a camera photo (5–15 MB) is shrunk before upload.
// Full-size photos were larger than the server accepts, so most scans failed
// before the receipt was read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitWithin, dataUrlBytes, MAX_SIDE, MAX_UPLOAD_BYTES, JPEG_QUALITY } from '../src/lib/receiptImage.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

test('a camera photo is drawn at 1600 px on its long side, proportions kept', () => {
  // 50 MP phone photo, portrait and landscape.
  assert.deepEqual(fitWithin(6120, 8160), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(8160, 6120), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
  // A long, narrow till receipt.
  assert.deepEqual(fitWithin(1000, 4000), { width: 400, height: 1600 });
  assert.equal(MAX_SIDE, 1600);
});

test('a small picture is never enlarged, and odd sizes never produce an empty canvas', () => {
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(1600, 1600), { width: 1600, height: 1600 });
  assert.deepEqual(fitWithin(0, 0), { width: 1, height: 1 });
  assert.deepEqual(fitWithin(undefined, null), { width: 1, height: 1 });
  assert.deepEqual(fitWithin(20000, 3), { width: 1600, height: 1 });
});

test('the size check counts decoded bytes, the same way the server does', () => {
  const b64 = (n) => `data:image/jpeg;base64,${Buffer.alloc(n, 1).toString('base64')}`;
  for (const n of [0, 1, 2, 3, 100, 101, 102, 4096]) assert.equal(dataUrlBytes(b64(n)), n, String(n));
  assert.equal(dataUrlBytes(''), 0);
  assert.equal(dataUrlBytes(null), 0);
  // The server's limit (backend/routes/expenses.js MAX_IMAGE_BYTES).
  const server = /const MAX_IMAGE_BYTES = (\d+) \* 1024 \* 1024;/.exec(read('../backend/routes/expenses.js'));
  assert.equal(MAX_UPLOAD_BYTES, Number(server[1]) * 1024 * 1024);
  assert.ok(JPEG_QUALITY > 0.6 && JPEG_QUALITY < 0.95);
});

test('the scan always goes through the shrinking step and reports what was saved', () => {
  const dash = read('src/pages/Dashboard.jsx');
  const handler = dash.slice(dash.indexOf('const handleScanFile'), dash.indexOf('const handleLogUpiPayment'));
  assert.match(handler, /const imageBase64 = await prepareReceiptImage\(file\);/);
  assert.match(handler, /addScannedExpense\(\{ imageBase64 \}\)/);
  // The raw file is never sent as it is.
  assert.doesNotMatch(handler, /readAsDataURL|reader\.result/);
  // Success names the amount; a failure never leaves the button spinning.
  assert.match(handler, /Added \\u20b9\$\{amount\.toLocaleString\('en-IN'\)\}/);
  assert.match(handler, /finally \{\s*setScanLoading\(false\);/);
});

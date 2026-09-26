// No server secret can reach a browser bundle: not the Supabase service-role
// key, not the Gemini key, in the user app or the Owner Console.
//
// Checks source (always) and the built output in dist/ (after `npm run build:web`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function files(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === 'node_modules') return [];
    return statSync(p).isDirectory() ? files(p, pattern) : pattern.test(name) ? [p] : [];
  });
}

/** Every JWT-shaped string whose payload claims the service_role. */
function serviceRoleJwts(text) {
  const found = [];
  for (const [jwt] of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') found.push(jwt.slice(0, 12));
    } catch { /* not a JWT */ }
  }
  return found;
}

/** Real server secrets from backend/.env, when present on this machine (never printed). */
function serverSecrets() {
  const env = join(root, '..', 'backend', '.env');
  if (!existsSync(env)) return [];
  return readFileSync(env, 'utf8').split(/\r?\n/)
    .map((line) => line.match(/^(SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|JWT_SECRET)=(.+)$/))
    .filter(Boolean)
    .map(([, name, value]) => ({ name, value: value.trim().replace(/^["']|["']$/g, '') }))
    .filter((s) => s.value.length >= 16);
}

test('source never reads a service-role or Gemini key into the browser', () => {
  for (const file of [...files(join(root, 'src'), /\.(jsx?|tsx?)$/), ...files(join(root, 'admin', 'src'), /\.(jsx?|tsx?)$/)]) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/VITE_[A-Z_]*(SERVICE|SECRET|GEMINI)/.test(text), `${file} reads a secret-looking VITE_ variable`);
    assert.ok(!/SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY/.test(text), `${file} references a server secret`);
    assert.deepEqual(serviceRoleJwts(text), [], file);
  }
});

test('.env files the frontend build reads contain no service-role key', () => {
  for (const file of files(root, /^\.env/).filter((f) => !f.includes(join('backend', '')))) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/SERVICE_ROLE|GEMINI_API_KEY/.test(text), `${file} contains a server secret name`);
    assert.deepEqual(serviceRoleJwts(text), [], file);
  }
});

test('built bundles (user app and /admin) contain no server secret', (t) => {
  const built = files(join(root, 'dist'), /\.(js|html|css|json|map)$/);
  if (!built.length) {
    t.skip('dist/ not built — run `npm run build:web` first');
    return;
  }
  assert.ok(built.some((f) => f.includes(join('dist', 'vittova-ops'))), 'dist/vittova-ops missing: build with `npm run build:web`');
  const secrets = serverSecrets();
  for (const file of built) {
    const text = readFileSync(file, 'utf8');
    assert.deepEqual(serviceRoleJwts(text), [], `${file} contains a service_role JWT`);
    assert.ok(!/AIza[0-9A-Za-z_-]{35}/.test(text), `${file} contains a Google API key`);
    for (const { name, value } of secrets) assert.ok(!text.includes(value), `${file} contains the value of ${name}`);
  }
});

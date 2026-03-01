import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/AppLayout.tsx', import.meta.url), 'utf8');

test('AppLayout only renders outlet shell without top nav header', () => {
  assert.equal(source.includes('KorAuto Management'), false);
  assert.equal(source.includes('app-topbar'), false);
  assert.equal(source.includes('app-mobile-nav'), false);
  assert.equal(source.includes('<Outlet />'), true);
});

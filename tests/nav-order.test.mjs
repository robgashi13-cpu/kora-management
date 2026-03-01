import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/AppLayout.tsx', import.meta.url), 'utf8');

test('AppLayout nav order remains Dashboard/Reports/Settings', () => {
  const dashboard = source.indexOf("label: 'Dashboard'");
  const reports = source.indexOf("label: 'Reports'");
  const settings = source.indexOf("label: 'Settings'");
  assert.ok(dashboard > -1 && reports > -1 && settings > -1);
  assert.ok(dashboard < reports && reports < settings);
});

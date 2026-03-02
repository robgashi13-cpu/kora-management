import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvoiceHistoryEntry, groupInvoiceHistoryByMonth } from '../components/invoiceHistory.ts';

const sale = {
  id: 'sale-1', brand: 'Hyundai', model: 'Sonata', vin: 'VIN123', plateNumber: 'STK1', invoiceId: 'INV-1'
};

test('creates exactly one history record per invocation with server-like derived fields', () => {
  const entry = createInvoiceHistoryEntry({ sale, sourceContext: 'edit_sale', createdBy: 'user@example.com' });
  assert.equal(entry.relatedEntityId, 'sale-1');
  assert.equal(entry.createdByDisplay, 'user@example.com');
  assert.ok(entry.createdAt);
});

test('groups entries by month and keeps newest month first when sorted externally', () => {
  const entries = [
    { ...createInvoiceHistoryEntry({ sale, sourceContext: 'edit_sale', createdBy: 'u' }), createdAt: '2026-03-03T10:00:00.000Z' },
    { ...createInvoiceHistoryEntry({ sale: { ...sale, id: 'sale-2' }, sourceContext: 'add_sale', createdBy: 'u' }), createdAt: '2026-02-03T10:00:00.000Z' },
    { ...createInvoiceHistoryEntry({ sale: { ...sale, id: 'sale-3' }, sourceContext: 'edit_shitblerje', createdBy: 'u' }), createdAt: '2026-03-05T10:00:00.000Z' },
  ];

  const grouped = groupInvoiceHistoryByMonth(entries);
  assert.deepEqual(Object.keys(grouped), ['2026-03', '2026-02']);
  assert.equal(grouped['2026-03'][0].relatedEntityId, 'sale-3');
});

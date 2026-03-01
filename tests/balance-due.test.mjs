import test from 'node:test';
import assert from 'node:assert/strict';

const calculateBalance = (sale) => (sale.soldPrice || 0) - ((sale.amountPaidCash || 0) + (sale.amountPaidBank || 0) + (sale.deposit || 0));

const aggregateBalanceDue = (sales) => {
  const sold = sales.filter((s) => (s.status === 'Completed' || (s.soldPrice || 0) > 0) && calculateBalance(s) > 0);
  const soldIds = new Set(sold.map((s) => s.id));
  const shippedOnly = sales.filter((s) => s.status === 'Shipped' && calculateBalance(s) > 0 && !soldIds.has(s.id));
  return {
    sold,
    shippedOnly,
    soldTotal: sold.reduce((sum, s) => sum + calculateBalance(s), 0),
    shippedTotal: shippedOnly.reduce((sum, s) => sum + calculateBalance(s), 0),
  };
};

test('balance totals equal sum of per-car balances and no double counting', () => {
  const sales = [
    { id: '1', status: 'Shipped', soldPrice: 10000, amountPaidCash: 4000, amountPaidBank: 0, deposit: 0 },
    { id: '2', status: 'Completed', soldPrice: 12000, amountPaidCash: 3000, amountPaidBank: 2000, deposit: 0 },
    { id: '3', status: 'Shipped', soldPrice: 9000, amountPaidCash: 9000, amountPaidBank: 0, deposit: 0 },
    { id: '4', status: 'Shipped', soldPrice: 11000, amountPaidCash: 1000, amountPaidBank: 0, deposit: 0 },
  ];

  const result = aggregateBalanceDue(sales);
  assert.equal(result.soldTotal, 23000);
  assert.equal(result.shippedTotal, 0);
  assert.equal(result.sold.length, 3);
  assert.equal(result.shippedOnly.length, 0);
});

test('supports status filtering semantics', () => {
  const sales = [
    { id: 'a', status: 'Shipped', soldPrice: 5000, amountPaidCash: 1000, amountPaidBank: 1000, deposit: 0 },
    { id: 'b', status: 'Completed', soldPrice: 7000, amountPaidCash: 2000, amountPaidBank: 0, deposit: 0 },
  ];

  const { sold, shippedOnly } = aggregateBalanceDue(sales);
  assert.deepEqual(sold.map((s) => s.id), ['a', 'b']);
  assert.deepEqual(shippedOnly.map((s) => s.id), []);
});

test('empty state and large list', () => {
  const empty = aggregateBalanceDue([]);
  assert.equal(empty.soldTotal, 0);
  assert.equal(empty.shippedTotal, 0);

  const large = Array.from({ length: 500 }, (_, i) => ({
    id: String(i),
    status: i % 2 ? 'Shipped' : 'Completed',
    soldPrice: 10000,
    amountPaidCash: i,
    amountPaidBank: 0,
    deposit: 0,
  }));
  const aggregated = aggregateBalanceDue(large);
  assert.equal(aggregated.sold.length, 500);
  assert.equal(aggregated.shippedOnly.length, 0);
});

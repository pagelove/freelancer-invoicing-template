const assert = require('node:assert/strict');
const test = require('node:test');
const m = require('../site/invoicing-demo/invoice-math.js');
test('decimal prices stay in integer cents', () => {
  assert.equal(m.parseMoney('0.29'), 29);
  assert.equal(m.parseMoney('12.5'), 1250);
  assert.equal(m.total([{ quantity: 300, unitCents: 29 }, { quantity: 100, unitCents: 10 }]), 97);
});
test('fractional quantities round half-up per line', () => {
  assert.equal(m.parseQuantity('1.25'), 125);
  assert.equal(m.lineTotal(125, 1999), 2499);
  assert.equal(m.lineTotal(50, 1), 1);
  assert.equal(m.total([{ quantity: 50, unitCents: 1 }, { quantity: 50, unitCents: 1 }]), 2);
});
test('invalid precision, negatives, and excessive totals are rejected', () => {
  for (const price of ['-1', '1.001', '1e2', 'NaN', '', '1000000.01']) assert.throws(() => m.parseMoney(price));
  for (const qty of ['0', '-1', '1.001', '10000']) assert.throws(() => m.parseQuantity(qty));
  assert.throws(() => m.total([{ quantity: 999900, unitCents: 100000000 }]));
});
test('calendar and overdue logic respect date-only boundaries', () => {
  assert.equal(m.dateIsValid('2026-02-29'), false);
  assert.equal(m.dateIsValid('2028-02-29'), true);
  assert.equal(m.statusOf({ status: 'sent', dueDate: '2026-09-05' }, '2026-09-05'), 'sent');
  assert.equal(m.statusOf({ status: 'sent', dueDate: '2026-09-04' }, '2026-09-05'), 'overdue');
  assert.equal(m.statusOf({ status: 'paid', dueDate: '2026-09-04' }, '2026-09-05'), 'paid');
});
test('only deliberate forward lifecycle transitions are allowed', () => {
  assert.equal(m.mayTransition('draft', 'sent'), true);
  assert.equal(m.mayTransition('sent', 'paid'), true);
  assert.equal(m.mayTransition('draft', 'paid'), false);
  assert.equal(m.mayTransition('paid', 'void'), false);
  assert.equal(m.mayTransition('void', 'draft'), false);
});

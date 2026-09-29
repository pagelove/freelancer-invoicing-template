(function (root) {
  'use strict';
  function parseMoney(value) {
    const raw = String(value).trim();
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw)) throw new Error('Enter an amount with up to two decimal places.');
    const [whole, fraction = ''] = raw.split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents) || cents > 100000000) throw new Error('Keep each unit price at $1,000,000 or less.');
    return cents;
  }
  function parseQuantity(value) {
    const raw = String(value).trim();
    if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(raw)) throw new Error('Use a quantity from 0.01 to 9,999, with up to two decimal places.');
    const [whole, fraction = ''] = raw.split('.');
    const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (hundredths < 1 || hundredths > 999900) throw new Error('Use a quantity from 0.01 to 9,999.');
    return hundredths;
  }
  function lineTotal(quantityHundredths, unitCents) {
    if (!Number.isSafeInteger(quantityHundredths) || quantityHundredths < 1 || quantityHundredths > 999900 || !Number.isSafeInteger(unitCents) || unitCents < 0 || unitCents > 100000000) throw new Error('Invalid line item amount.');
    // Integer half-up rounding, exactly once per line; sums never use floating currency.
    return Math.floor((quantityHundredths * unitCents + 50) / 100);
  }
  function total(lines) {
    const cents = lines.reduce((sum, line) => sum + lineTotal(line.quantity, line.unitCents), 0);
    if (!Number.isSafeInteger(cents) || cents > 1000000000) throw new Error('Keep the invoice total at $10,000,000 or less.');
    return cents;
  }
  function dateIsValid(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T12:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function statusOf(invoice, today) { return invoice.status === 'sent' && invoice.dueDate < today ? 'overdue' : invoice.status; }
  function mayTransition(from, to) { return ({ draft: ['sent', 'void'], sent: ['paid', 'void'], paid: [], void: [] }[from] || []).includes(to); }
  const api = { parseMoney, parseQuantity, lineTotal, total, dateIsValid, statusOf, mayTransition };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InvoiceMath = api;
})(typeof window !== 'undefined' ? window : globalThis);

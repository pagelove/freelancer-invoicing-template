const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// Point INVOICE_TEST_JSDOM at an installed jsdom package; no runtime dependency.
const { JSDOM } = require(process.env.INVOICE_TEST_JSDOM || 'jsdom');
const appRoot = path.resolve(__dirname, '../public/invoicing-demo');
const source = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const math = fs.readFileSync(path.join(appRoot, 'invoice-math.js'), 'utf8');
const script = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(setImmediate); };
const fixed = Date.parse('2026-09-05T16:00:00Z');

async function setup(t, options = {}) {
  const dom = new JSDOM(source, { url: 'https://example.test/invoicing-demo/', runScripts: 'outside-only' });
  const server = new JSDOM(source);
  t.after(() => { dom.window.close(); server.window.close(); });
  const w = dom.window, calls = [];
  let revision = 1, uncertain = options.uncertain, blocker = options.blocker;
  const tag = () => `"invoice-${revision}"`;
  w.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
  w.matchMedia = () => ({ matches: false });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    assert.equal(new URL(url, w.location.origin).pathname, '/invoicing-demo/index.html');
    const selector = init.headers.Range.slice('selector='.length);
    calls.push({ method, selector, body: init.body, etag: init.headers['If-Match'] });
    if (method === 'GET') return new Response(server.serialize(), { status: 206, headers: { ETag: tag(), 'X-Pagelove-Preview': 'local' } });
    if (blocker) { const pending = blocker; blocker = null; await pending; }
    if (init.headers['If-Match'] !== tag()) return new Response('stale resource', { status: 412 });
    if (uncertain === 'before') { uncertain = null; throw new TypeError('connection lost before commit'); }
    const target = server.window.document.querySelector(selector);
    assert.ok(target, 'the write must target a real element');
    if (method === 'POST') target.insertAdjacentHTML('beforeend', init.body);
    else if (method === 'PUT') target.outerHTML = init.body;
    else assert.fail(`unexpected write ${method}`);
    revision++;
    if (uncertain === 'after') { uncertain = null; throw new TypeError('connection lost after commit'); }
    return new Response('', { status: 206, headers: { ETag: tag() } });
  };
  w.eval(math); w.eval(script); await settle();
  const q = selector => w.document.querySelector(selector);
  const set = (selector, value) => { q(selector).value = value; q(selector).dispatchEvent(new w.Event('input', { bubbles: true })); };
  const submit = () => q('#invoice-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const records = () => [...server.window.document.querySelectorAll('#invoices > li[data-invoice]')];
  const writes = () => calls.filter(call => call.method !== 'GET');
  assert.equal(q('#new-invoice').disabled, false, 'initial GET must enable safe editing');
  return { dom, server, w, q, set, submit, records, writes, calls, bump: () => { revision++; } };
}

function draft(app, number = 'QA-2026-007') {
  app.q('#new-invoice').click();
  app.set('[name=number]', number);
  app.set('[name=client]', 'Aster Workshop');
  app.set('[name=email]', 'billing@example.test');
  app.set('[name=notes]', 'Keep these carefully written project notes.');
  app.set('[data-field=description]', 'Editorial direction');
  app.set('[data-field=quantity]', '1.25');
  app.set('[data-field=price]', '19.99');
  assert.equal(app.q('#composer-total').textContent, '$24.99');
}

function invoiceByNumber(app, number = 'QA-2026-007') {
  return app.records().find(row => row.querySelector(':scope > meta[itemprop=invoiceNumber]').content === number);
}

test('412 preserves the draft and exposes an in-composer refresh before a safe retry', async t => {
  const app = await setup(t); draft(app);
  app.bump(); // Another tab changes the document after this draft was opened.
  app.submit(); await settle();
  assert.equal(app.records().length, 6, 'a stale write must not be applied');
  assert.equal(app.q('#composer').hidden, false);
  assert.equal(app.q('#save-draft').disabled, true);
  assert.equal(app.q('#refresh-draft').hidden, false, 'recovery must be visible inside the open composer');
  assert.equal(app.q('#refresh-draft').closest('[hidden]'), null, 'recovery must not sit in the hidden ledger');
  assert.match(app.q('#form-error').textContent, /changed in another tab/);
  assert.equal(app.q('[name=client]').value, 'Aster Workshop');
  assert.equal(app.q('[name=notes]').value, 'Keep these carefully written project notes.');
  assert.equal(app.q('[data-field=quantity]').value, '1.25');
  app.submit(); await settle();
  assert.equal(app.writes().length, 1, 'a retry before refreshing must not issue another request');
  app.q('#refresh-draft').click(); await settle();
  assert.equal(app.q('#save-draft').disabled, false);
  assert.equal(app.q('[name=notes]').value, 'Keep these carefully written project notes.');
  app.submit(); await settle();
  assert.equal(app.records().length, 7);
  assert.deepEqual(app.writes().map(call => call.etag), ['"invoice-1"', '"invoice-2"']);
  assert.equal(app.q('#composer').hidden, true);
  assert.ok(invoiceByNumber(app));
});

test('a lost POST response reconciles its key and preserves later edits without a duplicate POST', async t => {
  const app = await setup(t, { uncertain: 'after' }); draft(app);
  app.submit(); await settle();
  assert.equal(app.records().length, 7, 'the server committed before its response was lost');
  const savedId = invoiceByNumber(app).id;
  assert.match(app.q('#status').textContent, /save could not be confirmed/);
  assert.equal(app.q('#save-draft').disabled, true);
  app.set('[name=notes]', 'Additional detail typed after the connection failed.');
  app.submit(); await settle();
  assert.equal(app.writes().length, 1);
  app.q('#refresh-draft').click(); await settle();
  assert.match(app.q('#status').textContent, /draft was saved before the connection ended/);
  assert.equal(app.q('#composer-heading').textContent, 'Review saved draft');
  assert.equal(app.q('[name=notes]').value, 'Additional detail typed after the connection failed.');
  assert.equal(app.q('#save-draft').disabled, false);
  app.submit(); await settle();
  assert.deepEqual(app.writes().map(call => call.method), ['POST', 'PUT']);
  assert.equal(app.records().length, 7);
  assert.equal(invoiceByNumber(app).id, savedId, 'the existing keyed draft is reused');
  assert.equal(invoiceByNumber(app).querySelector(':scope > meta[itemprop=notes]').content, 'Additional detail typed after the connection failed.');
});

test('a lost request before commit retries the same draft key after checking the server', async t => {
  const app = await setup(t, { uncertain: 'before' }); draft(app);
  app.submit(); await settle();
  assert.equal(app.records().length, 6);
  const firstId = JSDOM.fragment(app.writes()[0].body).firstChild.id;
  app.q('#refresh-draft').click(); await settle();
  assert.equal(app.q('#composer').hidden, false);
  app.submit(); await settle();
  assert.deepEqual(app.writes().map(call => call.method), ['POST', 'POST']);
  assert.equal(app.records().length, 7);
  assert.equal(invoiceByNumber(app).id, firstId, 'one logical draft retains its generated key across an uncertain retry');
});

test('a pending save locks destructive controls and guards selection changes and duplicate submits', async t => {
  let release;
  const app = await setup(t, { blocker: new Promise(resolve => { release = resolve; }) });
  draft(app);
  const selectedBefore = app.q('[data-select][aria-pressed=true]').dataset.select;
  app.submit();
  assert.equal(app.q('#cancel-compose').disabled, true, 'a pending save cannot discard the form');
  assert.equal(app.q('[name=client]').disabled, true, 'values cannot change while the committed payload is unresolved');
  assert.equal(app.q('#save-draft').disabled, true);
  app.q('[data-filter=all]').click(); // A list rerender must not unlock rows.
  const other = [...app.w.document.querySelectorAll('[data-select]')].find(row => row.dataset.select !== selectedBefore);
  assert.equal(other.disabled, true);
  other.dispatchEvent(new app.w.MouseEvent('click', { bubbles: true }));
  assert.equal(app.q('[data-select][aria-pressed=true]').dataset.select, selectedBefore);
  app.q('#cancel-compose').click();
  assert.equal(app.q('#composer').hidden, false);
  app.submit();
  assert.equal(app.writes().length, 1, 'the second submit cannot create another invoice');
  release(); await settle();
  assert.equal(app.records().length, 7);
  assert.equal(app.q('#composer').hidden, true);
  assert.match(app.q('#status').textContent, /Draft saved/);
});

test('saving a new or edited draft focuses and reveals the refreshed invoice after controls unlock', async t => {
  const app = await setup(t);
  const revealed = [];
  app.w.matchMedia = query => { assert.equal(query, '(max-width: 900px)'); return { matches: true }; };
  app.q('#invoice-detail').scrollIntoView = options => revealed.push({ behavior: options.behavior, block: options.block });
  app.q('#new-invoice').focus();
  draft(app);
  app.q('#save-draft').focus();
  app.submit(); await settle();
  assert.equal(app.q('#composer').hidden, true);
  assert.equal(app.q('#new-invoice').disabled, false, 'save completion has unlocked the interface');
  assert.equal(app.w.document.activeElement, app.q('#invoice-detail'), 'focus must leave the hidden composer and land on the saved invoice');
  assert.equal(app.w.document.activeElement.closest('[hidden]'), null);
  assert.match(app.q('#invoice-detail').textContent, /Aster Workshop/);
  assert.deepEqual(revealed, [{ behavior: 'instant', block: 'start' }], 'the saved invoice must be revealed below the ledger on stacked screens');

  const edit = app.q('[data-edit]');
  edit.focus(); edit.click();
  app.set('[name=client]', 'Aster Workshop Revised');
  app.q('#save-draft').focus();
  app.submit(); await settle();
  assert.equal(edit.isConnected, false, 'the original edit trigger was replaced by the refreshed details');
  assert.equal(app.w.document.activeElement, app.q('#invoice-detail'), 'editing must also focus a stable element instead of the removed trigger');
  assert.equal(app.w.document.activeElement.closest('[hidden]'), null);
  assert.match(app.q('#invoice-detail').textContent, /Aster Workshop Revised/);
  assert.equal(revealed.length, 2, 'an edited invoice must also be revealed after the composer collapses');
  assert.deepEqual(app.writes().map(call => call.method), ['POST', 'PUT']);
});

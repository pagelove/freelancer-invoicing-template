(function () {
  'use strict';
  const PAGE = '/invoicing-demo/index.html';
  const M = window.InvoiceMath;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const addDays = (date, days) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  const dateLabel = value => M.dateIsValid(value) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z')) : 'Not recorded';
  const titleStatus = status => ({ overdue: 'Past due', sent: 'Sent', draft: 'Draft', paid: 'Paid', void: 'Void' }[status] || status);
  const id = prefix => prefix + '-' + crypto.randomUUID();
  const state = { invoices: [], selected: null, filter: 'all', query: '', etag: null, busy: false, editing: null, draftId: null, pendingCreateId: null, ready: false };
  let focusReturn = null;
  function announce(message, bad = false) { $('#status').textContent = message; $('#status').className = bad ? 'is-error' : 'is-success'; }
  function property(row, name) { return $(`:scope > meta[itemprop="${name}"]`, row)?.getAttribute('content') || ''; }
  function parseInvoices(doc) {
    const collection = $('#invoices', doc);
    if (!collection) throw new Error('The invoice collection is missing. Refresh or check the preview server.');
    return $$(':scope > li[data-invoice]', collection).map(row => {
      const invoice = { id: property(row, 'freelancerInvoiceId'), number: property(row, 'invoiceNumber'), client: property(row, 'clientName'), email: property(row, 'clientEmail'), seller: property(row, 'sellerName'), sellerEmail: property(row, 'sellerEmail'), issueDate: property(row, 'issueDate'), dueDate: property(row, 'dueDate'), status: property(row, 'status'), notes: property(row, 'notes'), sentDate: property(row, 'sentDate'), paidDate: property(row, 'paidDate'), paymentNote: property(row, 'paymentNote') };
      invoice.lines = $$(':scope > ul[data-lines] > li[data-line]', row).map(line => ({ id: property(line, 'freelancerLineId'), description: property(line, 'description'), quantity: Number(property(line, 'quantityHundredths')), unitCents: Number(property(line, 'unitPriceCents')) }));
      if (!/^[a-zA-Z0-9-]+$/.test(invoice.id) || !['draft', 'sent', 'paid', 'void'].includes(invoice.status) || !M.dateIsValid(invoice.issueDate) || !M.dateIsValid(invoice.dueDate) || invoice.dueDate < invoice.issueDate || !invoice.lines.length || !invoice.number || !invoice.client) throw new Error('An invoice has invalid or incomplete data. Check the saved document before continuing.');
      invoice.total = M.total(invoice.lines);
      return invoice;
    });
  }
  async function request(method, selector, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const headers = { Range: 'selector=' + selector, 'Cache-Control': 'no-cache' };
      if (body) { headers['Content-Type'] = 'text/html'; headers['If-Match'] = state.etag; }
      const response = await fetch(PAGE, { method, headers, body, signal: controller.signal, cache: 'no-store' });
      if (response.status === 412) { state.ready = false; throw new Error('This workspace changed in another tab. Refresh the invoices, then review and save your draft again.'); }
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'The server did not permit this action. Check access to this demo.' : `The server could not ${method === 'GET' ? 'load' : 'save'} the invoice (${response.status}). Your draft is still here.`);
      if (method === 'GET' && response.status !== 206) throw new Error('Editing needs Pagelove or the local preview server. A static file server cannot save this demo.');
      return response;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(method === 'GET' ? 'Loading took too long. Try Refresh.' : 'The save response timed out. Refresh to check whether it saved before trying again.');
      if (method !== 'GET' && error.name === 'TypeError') throw new Error('The save could not be confirmed. Refresh to check the saved invoice before retrying.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function load() {
    const response = await request('GET', 'body');
    if (response.headers.get('X-Pagelove-Preview') === 'local') {
      $('.sample-notice').innerHTML = '<span>Local preview · sample data</span> Fictional details saved on this computer. No emails are sent or payments processed.';
    }
    const records = parseInvoices(new DOMParser().parseFromString(await response.text(), 'text/html'));
    const etag = response.headers.get('ETag');
    if (!etag || etag.startsWith('W/')) throw new Error('The server must provide a strong ETag for safe invoice updates.');
    state.invoices = records; state.etag = etag; state.ready = true;
    const recovered = state.pendingCreateId && records.find(invoice => invoice.id === state.pendingCreateId);
    if (recovered) {
      state.selected = recovered.id;
      if (!$('#composer').hidden) {
        // A response can be lost after the POST commits. Reuse the saved key,
        // preserving any edits typed since the uncertain response.
        state.editing = recovered.id; state.draftId = recovered.id;
        $('#composer-heading').textContent = 'Review saved draft';
      }
      state.pendingCreateId = null;
      $('#form-error').textContent = '';
    }
    if (!state.selected || !records.some(invoice => invoice.id === state.selected)) state.selected = records.find(invoice => invoice.status === 'sent')?.id || records[0]?.id || null;
    render();
    return Boolean(recovered);
  }
  function render() { renderSummary(); renderList(); renderDetail(); setBusy(state.busy); }
  function renderSummary() {
    const all = state.invoices, day = today();
    const outstanding = all.filter(i => i.status === 'sent');
    const overdue = outstanding.filter(i => M.statusOf(i, day) === 'overdue');
    const paid = all.filter(i => i.status === 'paid' && i.paidDate.slice(0, 7) === day.slice(0, 7));
    const drafts = all.filter(i => i.status === 'draft');
    const sum = list => list.reduce((total, i) => total + i.total, 0);
    $('#nav-invoice-count').textContent = String(all.length);
    $('#period-label').textContent = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    $('#stat-outstanding').textContent = money(sum(outstanding));
    $('#stat-outstanding-note').textContent = `${outstanding.length} unpaid invoice${outstanding.length === 1 ? '' : 's'}`;
    $('#stat-overdue').textContent = money(sum(overdue));
    $('#stat-overdue-note').textContent = `${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'}`;
    $('#stat-paid').textContent = money(sum(paid));
    $('#stat-paid-note').textContent = `${paid.length} payment${paid.length === 1 ? '' : 's'} in ${new Date().toLocaleDateString('en-US', { month: 'long' })}`;
    $('#stat-drafts').textContent = String(drafts.length);
    $('#stat-drafts-note').textContent = `${money(sum(drafts))} total`;
  }
  function renderList() {
    const filtered = state.invoices.filter(i => (state.filter === 'all' || (state.filter === 'sent' ? i.status === 'sent' : M.statusOf(i, today()) === state.filter)) && `${i.client} ${i.number} ${i.email}`.toLowerCase().includes(state.query.toLowerCase()));
    $('#result-count').textContent = `${filtered.length} of ${state.invoices.length} invoices`;
    $('#invoice-list').setAttribute('aria-busy', 'false');
    if (!filtered.length) { $('#invoice-list').innerHTML = `<div class="list-empty"><h3>${state.invoices.length ? 'No invoices match.' : 'No invoices yet'}</h3><p>${state.invoices.length ? 'Try another search or choose a different status.' : 'Add a client and line items to create your first draft.'}</p>${state.invoices.length ? '<button class="text-button" type="button" data-clear-filter>Clear filters</button>' : '<button class="text-button" type="button" data-new>Create your first invoice</button>'}</div>`; return; }
    $('#invoice-list').innerHTML = filtered.map(i => {
      const s = M.statusOf(i, today());
      return `<button type="button" class="invoice-row${i.id === state.selected ? ' selected' : ''}" data-select="${esc(i.id)}" aria-pressed="${i.id === state.selected}"${state.busy || !state.ready ? ' disabled' : ''}><span class="row-client"><strong>${esc(i.client)}</strong><span class="row-number">${esc(i.number)}</span><span class="row-date">${i.status === 'paid' ? 'Paid ' + dateLabel(i.paidDate) : 'Due ' + dateLabel(i.dueDate)}</span></span><span class="row-amount"><strong>${money(i.total)}</strong><span class="badge ${s}">${titleStatus(s)}</span></span></button>`;
    }).join('');
  }
  function renderDetail() {
    const i = state.invoices.find(invoice => invoice.id === state.selected);
    if (!i) { $('#invoice-detail').innerHTML = '<div class="detail-empty"><h2 id="detail-heading">Select an invoice</h2><p>View its line items, dates, and payment status.</p></div>'; return; }
    const s = M.statusOf(i, today());
    const action = i.status === 'draft' ? '<button class="primary compact" type="button" data-action="sent">Mark sent</button><button class="text-button" type="button" data-edit>Edit draft</button>' : i.status === 'sent' ? '<button class="primary compact" type="button" data-action="paid">Record payment</button>' : '';
    const context = i.status === 'draft' ? 'Share this invoice yourself, then mark it sent.' : i.status === 'sent' ? (s === 'overdue' ? 'The due date has passed. Record the payment after you receive it.' : 'Record the payment after you receive the full amount.') : i.status === 'paid' ? `Payment recorded on ${dateLabel(i.paidDate)}. ${i.paymentNote || ''}` : 'This invoice is void and excluded from your balances.';
    $('#invoice-detail').innerHTML = `<a class="back-to-register" href="#ledger-title">← Back to invoices</a><div class="detail-toolbar"><div><h2 id="detail-heading">Invoice details</h2><span class="badge ${s}">${titleStatus(s)}</span></div><button class="text-button print-button" type="button" data-print><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7zM17 11h.01"/></svg>Print / PDF</button></div><div class="next-step"><p>${esc(context)}</p><div class="detail-actions">${action}${['draft', 'sent'].includes(i.status) ? '<button class="text-button quiet" type="button" data-action="void">Void invoice</button>' : ''}</div><div id="action-panel"></div></div><article class="invoice-paper" aria-label="Invoice ${esc(i.number)}"><div class="paper-top"><div class="sender"><strong>${esc(i.seller)}</strong>${i.sellerEmail ? `<span>${esc(i.sellerEmail)}</span>` : ''}</div><div class="paper-kind">Invoice<span>${esc(i.number)}</span></div></div><div class="billing"><div><span class="paper-label">Bill to</span><h3>${esc(i.client)}</h3>${i.email ? `<p>${esc(i.email)}</p>` : ''}</div><dl><div><dt>Issued</dt><dd>${dateLabel(i.issueDate)}</dd></div><div><dt>Due</dt><dd>${dateLabel(i.dueDate)}</dd></div><div class="print-only"><dt>Status</dt><dd>${titleStatus(s)}</dd></div></dl></div><table class="invoice-lines"><caption class="sr-only">Invoice line items</caption><thead><tr><th scope="col">Description</th><th scope="col">Qty</th><th scope="col">Rate</th><th scope="col">Amount</th></tr></thead><tbody>${i.lines.map(line => `<tr><td>${esc(line.description)}</td><td>${line.quantity / 100}</td><td>${money(line.unitCents)}</td><td>${money(M.lineTotal(line.quantity, line.unitCents))}</td></tr>`).join('')}</tbody></table><div class="paper-total"><span>Total <small>USD</small></span><strong>${money(i.total)}</strong></div>${i.notes ? `<div class="invoice-note"><span class="paper-label">Notes</span><p>${esc(i.notes)}</p></div>` : ''}<p class="sample-print">Sample invoice. No money is requested by this demo.</p></article>`;
  }
  function setBusy(busy) {
    state.busy = busy;
    $('#refresh-draft').hidden = state.ready || $('#composer').hidden;
    $$('#new-invoice, #rail-new, #refresh, [data-action], [data-edit], #save-draft, #confirm-action, [data-select]').forEach(button => { button.disabled = busy || (button.id !== 'refresh' && !state.ready); });
    $('#save-draft').textContent = busy ? 'Saving…' : 'Save draft';
    $('#refresh').textContent = busy ? 'Working…' : 'Refresh';
    $('#invoice-form').setAttribute('aria-busy', String(busy));
    $$('#invoice-form input, #invoice-form textarea, #invoice-form button, #cancel-compose, #action-form input, #action-form button').forEach(control => { control.disabled = busy; });
    if (!busy) syncLines();
    if (!busy && !state.ready) $('#save-draft').disabled = true;
  }
  function serialize(i) {
    const meta = (name, value) => `<meta itemprop="${name}" content="${esc(value)}">`;
    let scalar = meta('freelancerInvoiceId', i.id);
    for (const [name, key] of Object.entries({ invoiceNumber: 'number', clientName: 'client', clientEmail: 'email', sellerName: 'seller', sellerEmail: 'sellerEmail', issueDate: 'issueDate', dueDate: 'dueDate', status: 'status', notes: 'notes', sentDate: 'sentDate', paidDate: 'paidDate', paymentNote: 'paymentNote' })) if (i[key] !== undefined && i[key] !== '') scalar += meta(name, i[key]);
    return `<li id="${esc(i.id)}" data-invoice="${esc(i.id)}" data-status="${i.status}" itemscope itemtype="https://pagelove.org/demo/invoicing/Invoice">${scalar}<ul data-lines>${i.lines.map(line => `<li id="${esc(line.id)}" data-line="${esc(line.id)}" itemscope itemtype="https://pagelove.org/demo/invoicing/InvoiceLine">${meta('freelancerLineId', line.id)}${meta('description', line.description)}${meta('quantityHundredths', line.quantity)}${meta('unitPriceCents', line.unitCents)}</li>`).join('')}</ul></li>`;
  }
  async function save(i, isNew, onCommitted, message) {
    if (state.busy || !state.ready) return;
    setBusy(true); let committed = false;
    if (isNew) state.pendingCreateId = i.id;
    try {
      await request(isNew ? 'POST' : 'PUT', isNew ? '#invoices' : `#invoices > li[data-invoice="${i.id}"]`, serialize(i));
      committed = true; state.selected = i.id; if (onCommitted) onCommitted();
      await load(); announce(message);
    } catch (error) {
      state.ready = false;
      announce(committed ? 'Saved, but the refreshed list could not load. Use Refresh before making another change.' : error.message, true);
      if (!committed && !$('#composer').hidden) $('#form-error').textContent = error.message;
    } finally {
      setBusy(false);
      // Saving closes the composer before load() replaces the detail contents.
      // Restore focus only after that refresh and the final control unlock.
      if (committed && state.ready && onCommitted && $('#composer').hidden) {
        $('#invoice-detail').focus({ preventScroll: true });
        if (matchMedia('(max-width: 900px)').matches) $('#invoice-detail').scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    }
  }
  function lineInput(line = { quantity: 100, unitCents: 0, description: '' }) {
    const row = document.createElement('div'); row.className = 'line-input'; row.dataset.line = line.id || id('line');
    row.innerHTML = `<label>Description<input data-field="description" required maxlength="160" value="${esc(line.description)}" placeholder="Brand direction & design"></label><label>Quantity<input data-field="quantity" inputmode="decimal" required value="${line.quantity / 100}" aria-label="Line item quantity"></label><label>Rate (USD)<input data-field="price" inputmode="decimal" required value="${(line.unitCents / 100).toFixed(2)}" aria-label="Line item rate in USD"></label><div class="line-subtotal"><span>Amount</span><output>${money(M.lineTotal(line.quantity, line.unitCents))}</output></div><button type="button" class="remove-line" aria-label="Remove line item">×</button>`;
    $('#line-inputs').appendChild(row); syncLines();
  }
  function collectLines() { return $$('.line-input').map(row => ({ id: row.dataset.line, description: $('[data-field="description"]', row).value.trim(), quantity: M.parseQuantity($('[data-field="quantity"]', row).value), unitCents: M.parseMoney($('[data-field="price"]', row).value) })); }
  function syncLines() {
    $$('.line-input').forEach(row => { $('.remove-line', row).disabled = $$('.line-input').length === 1; try { $('output', row).textContent = money(M.lineTotal(M.parseQuantity($('[data-field="quantity"]', row).value), M.parseMoney($('[data-field="price"]', row).value))); } catch { $('output', row).textContent = '—'; } });
    try { $('#composer-total').textContent = money(M.total(collectLines())); } catch { $('#composer-total').textContent = '—'; }
    $('#add-line').disabled = $$('.line-input').length >= 20;
  }
  function openComposer(invoice) {
    if (state.busy || !state.ready) return;
    focusReturn = document.activeElement;
    const form = $('#invoice-form'); form.reset(); $('#form-error').textContent = '';
    state.editing = invoice?.id || null;
    state.draftId = invoice?.id || id('invoice'); state.pendingCreateId = null;
    const fields = invoice || { number: 'INV-' + new Date().getFullYear() + '-' + String(state.invoices.length + 1).padStart(3, '0'), seller: 'Avery Ellis Studio', sellerEmail: 'avery@example.test', issueDate: today(), dueDate: addDays(today(), 14) };
    ['number', 'seller', 'sellerEmail', 'client', 'email', 'issueDate', 'dueDate', 'notes'].forEach(name => { form.elements.namedItem(name).value = fields[name] || ''; });
    $('#composer-heading').textContent = invoice ? 'Edit draft' : 'New invoice';
    $('#line-inputs').innerHTML = ''; (invoice?.lines || [undefined]).forEach(lineInput);
    $('#composer').hidden = false; $('.workspace').hidden = true;
    $('#new-invoice').hidden = true;
    form.elements.namedItem('client').focus(); $('#composer').scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  function closeComposer() { $('#composer').hidden = true; $('.workspace').hidden = false; $('#new-invoice').hidden = false; state.editing = null; state.draftId = null; state.pendingCreateId = null; if (!state.busy) focusReturn?.focus(); }
  function openAction(action) {
    if (state.busy || !state.ready) return;
    const i = state.invoices.find(row => row.id === state.selected);
    if (!i || !M.mayTransition(i.status, action)) return;
    const heading = { sent: 'Have you shared this invoice?', paid: 'Record the full payment', void: 'Void this invoice?' }[action];
    const hint = { sent: 'This only updates your records. Share the invoice with your client yourself.', paid: `Confirm that you received ${money(i.total)} outside this demo. This does not charge the client.`, void: 'It will stay in your records and be removed from outstanding or draft totals. This cannot be undone here.' }[action];
    $('#action-panel').innerHTML = `<form id="action-form" data-next="${action}"><h3>${heading}</h3><p>${hint}</p>${action === 'paid' ? `<label>Payment received<input type="date" name="paidDate" required min="${i.issueDate}" max="${today()}" value="${today()}"></label><label>Reference / note <span class="optional">optional</span><input name="paymentNote" maxlength="160" placeholder="Bank transfer reference"></label>` : ''}<p class="form-error" role="alert" id="action-error"></p><div class="confirm-actions"><button type="submit" class="primary compact" id="confirm-action">${{ sent: 'Confirm marked sent', paid: 'Confirm payment received', void: 'Confirm void' }[action]}</button><button type="button" class="text-button" data-cancel-action>Cancel</button></div></form>`;
    const first = $('#action-form input') || $('#confirm-action'); first.focus();
  }
  $('#invoice-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget;
    if (state.busy || !state.ready) return;
    $('#form-error').textContent = '';
    try {
      const value = name => form.elements.namedItem(name).value.trim();
      const lines = collectLines(); if (!lines.length || lines.some(line => !line.description)) throw new Error('Give every line item a description.');
      const invoice = { id: state.editing || state.draftId || id('invoice'), number: value('number'), seller: value('seller'), sellerEmail: value('sellerEmail'), client: value('client'), email: value('email'), issueDate: value('issueDate'), dueDate: value('dueDate'), notes: value('notes'), lines, status: 'draft' };
      if (!invoice.number || !invoice.seller || !invoice.client) throw new Error('Add an invoice number, your business name, and a client name.');
      if (!M.dateIsValid(invoice.issueDate) || !M.dateIsValid(invoice.dueDate) || invoice.dueDate < invoice.issueDate) throw new Error('Choose valid dates. The due date must be on or after the issue date.');
      if (state.invoices.some(i => i.id !== invoice.id && i.number.toLowerCase() === invoice.number.toLowerCase())) throw new Error('That invoice number is already in use. Choose another number.');
      if (state.editing && state.invoices.find(i => i.id === state.editing)?.status !== 'draft') throw new Error('This invoice is no longer a draft. Refresh before continuing.');
      if (M.total(lines) <= 0) throw new Error('Add at least one line with a positive amount.');
      await save(invoice, !state.editing, closeComposer, 'Draft saved. Nothing was emailed.');
    } catch (error) { $('#form-error').textContent = error.message; }
  });
  $('#new-invoice').addEventListener('click', () => openComposer());
  $('#rail-new').addEventListener('click', () => { if (!$('#composer').hidden) { $('#composer').scrollIntoView({ behavior: 'instant', block: 'start' }); return; } openComposer(); });
  $('#cancel-compose').addEventListener('click', closeComposer);
  $('#add-line').addEventListener('click', () => { if ($$('.line-input').length < 20) { lineInput(); $('#line-inputs').lastElementChild.querySelector('input').focus(); } });
  $('#line-inputs').addEventListener('input', syncLines);
  $('#line-inputs').addEventListener('click', event => { if (event.target.closest('.remove-line') && $$('.line-input').length > 1) { event.target.closest('.line-input').remove(); syncLines(); $('#add-line').focus(); } });
  $('#search').addEventListener('input', event => { state.query = event.target.value; renderList(); });
  $('.filters').addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (!button) return; state.filter = button.dataset.filter; $$('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); renderList(); });
  $('#invoice-list').addEventListener('click', event => {
    if (state.busy) return;
    const button = event.target.closest('[data-select]');
    if (button) { state.selected = button.dataset.select; renderList(); renderDetail(); setBusy(false); $('#invoice-detail').focus({ preventScroll: true }); if (matchMedia('(max-width: 900px)').matches) $('#invoice-detail').scrollIntoView({ behavior: 'instant', block: 'start' }); }
    if (event.target.closest('[data-new]')) openComposer();
    if (event.target.closest('[data-clear-filter]')) { state.filter = 'all'; state.query = ''; $('#search').value = ''; $$('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.filter === 'all'))); renderList(); $('#search').focus(); }
  });
  $('#invoice-detail').addEventListener('click', event => {
    if (event.target.closest('[data-print]')) window.print();
    if (event.target.closest('[data-edit]')) openComposer(state.invoices.find(i => i.id === state.selected));
    if (event.target.closest('[data-action]')) openAction(event.target.closest('[data-action]').dataset.action);
    if (event.target.closest('[data-cancel-action]')) { $('#action-panel').innerHTML = ''; $('[data-action]')?.focus(); }
  });
  $('#invoice-detail').addEventListener('submit', async event => {
    if (event.target.id !== 'action-form') return; event.preventDefault();
    if (state.busy || !state.ready) return;
    const form = event.target, next = form.dataset.next, i = state.invoices.find(row => row.id === state.selected);
    if (!i || !M.mayTransition(i.status, next)) return;
    const invoice = { ...i, status: next };
    if (next === 'sent') invoice.sentDate = today();
    if (next === 'paid') { invoice.paidDate = form.elements.namedItem('paidDate').value; invoice.paymentNote = form.elements.namedItem('paymentNote').value.trim(); if (!M.dateIsValid(invoice.paidDate) || invoice.paidDate > today() || invoice.paidDate < i.issueDate) { $('#action-error').textContent = 'Use a payment date between the issue date and today.'; return; } }
    await save(invoice, false, null, { sent: 'Marked sent. Nothing was emailed.', paid: 'Payment recorded. No charge was made.', void: 'Invoice voided and removed from active balances.' }[next]);
  });
  async function refreshInvoices() { if (state.busy) return; setBusy(true); try { const recovered = await load(); $('#form-error').textContent = ''; announce(recovered ? 'Your draft was saved before the connection ended. Review it and save any further changes.' : 'Invoices refreshed.'); } catch (error) { state.ready = false; announce(error.message, true); } finally { setBusy(false); } }
  $('#refresh').addEventListener('click', refreshInvoices);
  $('#refresh-draft').addEventListener('click', refreshInvoices);
  setBusy(true);
  load().then(() => announce('')).catch(error => { state.ready = false; $('#invoice-list').setAttribute('aria-busy', 'false'); $('#invoice-list').innerHTML = '<div class="list-empty"><h3>Invoices could not load.</h3><p>Use Refresh to try again.</p></div>'; announce(error.message, true); }).finally(() => setBusy(false));
})();

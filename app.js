// The page: reads the form, shows the report, saves and opens client files.
const byId = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const money = n => n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' }); // $1,234.56
const amount = n => n ? money(n) : '–';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = s => { if (!s) return '–'; const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
const FREQUENCIES = [['monthly', 'Monthly'], ['yearly', 'Yearly'], ['single', 'Single premium']];

const newClient = () => ({ ...blankClient(), preparedOn: today(), adviserName: ADVISER.name, adviserMobile: ADVISER.mobile });
let state = { client: newClient(), policies: [] };
let unsaved = false;
// The policy being entered or edited. It joins the list (and the report) only
// when added; `editing` is its index in the list when editing one.
let draft = blankPolicy(), editing = null, draftChanged = false;

// A form value, stored as the same kind of value as the blank one.
const parse = (blankValue, raw) => fit({ v: blankValue }, { v: raw }).v;
const shown = v => v === 0 || v === null ? '' : v;
// Amount fields (data-amount) take '$1,234.56' or '1234.56'; NaN if not a
// valid amount. They show as $x,xxx.xx once the user leaves the field.
const toAmount = raw => { const t = raw.replace(/[$,\s]/g, ''); return t === '' ? 0 : /^\d*\.?\d*$/.test(t) ? Number(t) : NaN; };
const amountText = n => n ? money(n) : '';
const OTHER_INSURER = '__other';

// ---- Form ----
function fillClient() {
  for (const el of document.querySelectorAll('[data-client]')) {
    const v = state.client[el.dataset.client];
    el.value = 'amount' in el.dataset ? amountText(v) : shown(v);
  }
}

function policyForm(p) {
  const options = (list, sel) => list.map(([v, label]) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(label)}</option>`).join('');
  const field = (key, label, type, value, extra = '') =>
    `<label>${label} <input type="${type}" data-field="${key}" value="${esc(shown(value))}" ${extra}></label>`;
  const num = (key, label, value, extra = 'min="0"') => field(key, label, 'number', value, `inputmode="decimal" step="any" ${extra}`);
  const money$ = (key, label, value) =>
    `<label>${label} <input type="text" inputmode="decimal" autocomplete="off" placeholder="$0.00" data-field="${key}" data-amount value="${esc(amountText(value))}"></label>`;
  const known = INSURERS.includes(p.insurer), other = !!p.insurer && !known;
  const text = (key, label, value) => field(key, label, 'text', value, 'autocomplete="off"');
  const date = (key, label, value) => field(key, label, 'date', value);
  const wealth = groupOf(p.type) === 'wealth';
  return `<div class="panel policy">
    <fieldset>
      <legend>${editing === null ? 'Add a policy' : `Edit policy ${editing + 1}`}</legend>
      <div class="grid4">
        <label>Type <select data-field="type">${options(POLICY_TYPES.map(t => [t.label, t.label]), p.type)}</select></label>
        <label>Insurer <select data-insurer>${options([['', '–'], ...INSURERS.map(x => [x, x]), [OTHER_INSURER, 'Others']],
          known ? p.insurer : other ? OTHER_INSURER : '')}</select></label>
        <label id="insurer-other"${other ? '' : ' hidden'}>Insurer name
          <input type="text" data-field="insurer" autocomplete="off" value="${esc(other ? p.insurer : '')}"></label>
        ${text('plan', 'Plan + riders', p.plan)}
        ${text('policyNo', 'Policy / account no.', p.policyNo)}
        ${date('startDate', 'Start date', p.startDate)}
        ${date('premiumEndDate', 'Premium end date', p.premiumEndDate)}
        ${date('endDate', 'Policy end / maturity date', p.endDate)}
        <label>Payment mode <select data-field="paymentMode">${options([['', '–'], ...PAYMENT_MODES.map(m => [m, m])], p.paymentMode)}</select></label>
        ${money$('premium', 'Premium', p.premium)}
        <label>Paid <select data-field="frequency">${options(FREQUENCIES, p.frequency)}</select></label>
      </div>
      <details${wealth ? '' : ' open'}>
        <summary>Cover (sum assured)</summary>
        <div class="grid4">${BENEFITS.map(b => money$(`cover.${b.key}`, b.label, p.cover[b.key])).join('')}</div>
      </details>
      <details${wealth ? ' open' : ''}>
        <summary>Value and payouts</summary>
        <div class="grid4">
          ${money$('currentValue', 'Current value (net realisable)', p.currentValue)}
          ${money$('projectedValue', 'Projected value at maturity', p.projectedValue)}
          ${num('projectedIrr', 'Projected IRR (% a year)', p.projectedIrr, '')}
          ${money$('lumpSum', 'Lump sum payout', p.lumpSum)}
          ${num('lumpSumAge', 'Lump sum paid at age', p.lumpSumAge)}
          ${money$('yearlyPayout', 'Regular payout (yearly)', p.yearlyPayout)}
          ${num('payoutFrom', 'Regular payout from age', p.payoutFrom)}
          ${num('payoutTo', `To age <span class="hint">(blank: lifelong, shown to ${LIFELONG_TO_AGE})</span>`, p.payoutTo)}
        </div>
      </details>
      ${text('remarks', 'Remarks', p.remarks)}
      <p class="error" id="policy-error" role="alert"></p>
      <div class="form-actions">
        <button type="button" data-action="save">${editing === null ? 'Add policy' : 'Save changes'}</button>
        ${editing === null ? '' : '<button type="button" class="secondary" data-action="cancel">Cancel</button>'}
      </div>
    </fieldset>
  </div>`;
}

// The list of added policies: one short row each, with Edit and Remove.
function policyList() {
  const rows = state.policies.map((p, i) => `<tr${i === editing ? ' class="editing"' : ''}>
    <td>${i + 1}</td><td class="l">${esc(p.type)}</td><td class="l">${esc(p.insurer || '–')}</td><td class="l">${esc(p.plan || '–')}</td>
    <td>${amount(p.premium)}${p.premium ? ` <span class="hint">${FREQUENCIES.find(([v]) => v === p.frequency)[1].toLowerCase()}</span>` : ''}</td>
    <td class="row-actions"><button type="button" data-edit="${i}" aria-label="Edit ${esc(policyName(p))}">Edit</button>
      <button type="button" class="remove" data-remove="${i}" aria-label="Remove ${esc(policyName(p))}">Remove</button></td></tr>`).join('');
  return table([['#'], ['Type', 'l'], ['Insurer', 'l'], ['Plan + riders', 'l'], ['Premium'], ['', 'l']], rows)
    .replace('None yet.', 'No policies yet. Fill in the form above and press Add policy.');
}

function renderPolicies() {
  byId('policy-form').innerHTML = policyForm(draft);
  byId('policy-list').innerHTML = policyList();
}

function resetDraft() {
  draft = blankPolicy();
  editing = null;
  draftChanged = false;
}
const discardDraftOk = () => !draftChanged || confirm('Discard the policy in the form? It hasn\'t been added.');

byId('form').addEventListener('input', e => {
  const el = e.target;
  // Amount fields: flag anything that isn't an amount, and store 0 for it.
  let value = el.value;
  if ('amount' in el.dataset) {
    const n = toAmount(value);
    el.setAttribute('aria-invalid', String(Number.isNaN(n)));
    value = Number.isNaN(n) ? 0 : n;
  }
  if ('insurer' in el.dataset) {
    const other = el.value === OTHER_INSURER, box = byId('insurer-other');
    box.hidden = !other;
    draft.insurer = other ? box.querySelector('input').value : el.value;
    if (other) box.querySelector('input').focus();
    draftChanged = true;
  } else if (el.dataset.client) {
    state.client[el.dataset.client] = parse(blankClient()[el.dataset.client], value);
    unsaved = true;
    renderReport();
  } else if (el.dataset.field) {
    // The draft only reaches the report once it is added.
    const [key, sub] = el.dataset.field.split('.');
    if (sub) draft[key][sub] = parse(0, value);
    else draft[key] = parse(blankPolicy()[key], value);
    draftChanged = true;
  }
});

// Leaving an amount field shows it as $x,xxx.xx (unless it isn't a valid amount).
byId('form').addEventListener('focusout', e => {
  const el = e.target;
  if (!('amount' in el.dataset)) return;
  const n = toAmount(el.value);
  if (!Number.isNaN(n)) el.value = amountText(n);
});

byId('policy-form').addEventListener('click', e => {
  const action = e.target.dataset.action;
  if (action === 'save') {
    if (!draft.insurer.trim() && !draft.plan.trim()) {
      byId('policy-error').textContent = 'Choose the insurer or enter the plan name.';
      byId('policy-form').querySelector('[data-insurer]').focus();
      return;
    }
    if (byId('policy-form').querySelector('[aria-invalid="true"]')) {
      byId('policy-error').textContent = 'Fix the amounts outlined in red: use numbers only, like 1234.56.';
      byId('policy-form').querySelector('[aria-invalid="true"]').focus();
      return;
    }
    if (editing === null) state.policies.push(draft);
    else state.policies[editing] = draft;
    unsaved = true;
  } else if (action !== 'cancel') return;
  resetDraft();
  renderPolicies();
  renderReport();
  byId('policy-form').querySelector('select').focus();
});

byId('policy-list').addEventListener('click', e => {
  const { edit, remove } = e.target.dataset;
  if (edit !== undefined) {
    if (!discardDraftOk()) return;
    draft = structuredClone(state.policies[+edit]);
    editing = +edit;
    draftChanged = false;
    renderPolicies();
    byId('policy-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    byId('policy-form').querySelector('select').focus({ preventScroll: true });
  } else if (remove !== undefined) {
    const i = +remove;
    if (!confirm(`Remove ${policyName(state.policies[i])}?`)) return;
    state.policies.splice(i, 1);
    if (editing === i) resetDraft();
    else if (editing > i) editing--;
    unsaved = true;
    renderPolicies();
    renderReport();
  }
});

// ---- Client files ----
const discardOk = () => !(unsaved || draftChanged) || confirm('The current client has unsaved changes. Discard them?');

function show(newState) {
  state = newState;
  unsaved = false;
  resetDraft();
  byId('file-error').textContent = '';
  fillClient();
  renderPolicies();
  renderReport();
}

byId('new-client').addEventListener('click', () => { if (discardOk()) show({ client: newClient(), policies: [] }); });
byId('open-client').addEventListener('click', () => { if (discardOk()) byId('open-file').click(); });

byId('open-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = ''; // so the same file can be opened again
  if (!file) return;
  try {
    show(readClientFile(JSON.parse(await file.text())));
  } catch (err) {
    byId('file-error').textContent = `Couldn't open ${file.name}: ${err instanceof SyntaxError ? 'it is not a client file.' : err.message}`;
  }
});

byId('save-client').addEventListener('click', () => {
  if (draftChanged && !confirm('The policy in the form hasn\'t been added, so it won\'t be in the file. Save anyway?')) return;
  const blob = new Blob([JSON.stringify(clientFile(state.client, state.policies), null, 2)], { type: 'application/json' });
  const slug = state.client.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `policy-summary-${slug}-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  unsaved = false;
});

byId('print').addEventListener('click', () => window.print());

window.addEventListener('beforeunload', e => { if (unsaved || draftChanged) e.preventDefault(); });

// ---- Report ----
const table = (head, rows, foot = '') =>
  `<thead><tr>${head.map(([label, cls = '']) => `<th class="${cls}">${label}</th>`).join('')}</tr></thead>
   <tbody>${rows || `<tr><td class="l" colspan="${head.length}">None yet.</td></tr>`}</tbody>${foot}`;

function renderReport() {
  const { client, policies } = state;
  const income = client.annualIncome;
  const totals = coverageTotals(policies);
  const premiums = premiumSummary(policies, income);
  const values = valueSummary(policies);

  byId('report-title').textContent = client.name ? `Policy Summary for ${client.name}` : 'Policy Summary';
  byId('report-date').textContent = client.preparedOn ? `Prepared on ${dateLabel(client.preparedOn)}` : '';

  const card = (label, value) => `<div class="card"><div class="card-label">${label}</div><div class="card-value">${value}</div></div>`;
  byId('summary-cards').innerHTML = [
    card('Death cover', money(totals.death)),
    card('Critical illness cover', money(totals.ci)),
    card('Premiums a year', money(premiums.yearly)),
    card('Premiums as % of income', premiums.shareOfIncome === null ? '–' : `${(premiums.shareOfIncome * 100).toFixed(1)}%`),
    card('Current value of policies', money(values.current)),
  ].join('');

  // Coverage against the recommended amounts.
  const gaps = coverageGaps(totals, income);
  byId('coverage-table').innerHTML = table(
    [['Benefit'], ['You have'], ['Recommended'], ['Shortfall']],
    gaps.map(g => `<tr><td>${g.label}</td><td>${amount(g.have)}</td>
      <td>${g.need === null || !income ? '–' : money(g.need)}</td>
      <td class="${g.gap ? 'short' : ''}">${g.gap === null || !income ? '–' : amount(g.gap)}</td></tr>`).join(''));
  byId('coverage-note').textContent = income
    ? `Recommended cover: ${BENEFITS.filter(b => b.incomeMultiple !== null).map(b => `${b.label.toLowerCase()} ${b.incomeMultiple}× annual income`).join(', ')}.`
    : 'Enter the client\'s annual income to see recommended cover and shortfalls.';

  const inGroup = group => policies.filter(p => groupOf(p.type) === group);
  // Yearly and monthly premium, with the one the client actually pays in red. A single
  // premium shows in the yearly column (in red) with the monthly cell left empty.
  const premiumCells = p => {
    const single = p.frequency === 'single';
    const yearly = single ? p.premium : annualPremium(p);
    const paid = col => (p.frequency === col || (single && col === 'yearly')) && p.premium ? ' class="paid"' : '';
    return `<td${paid('yearly')}>${amount(yearly)}${single && p.premium ? ' <span class="tag">single</span>' : ''}</td>
      <td${paid('monthly')}>${single ? '' : amount(yearly / 12)}</td><td class="l">${esc(p.paymentMode || '–')}</td>`;
  };
  const singleNote = list => list.some(p => p.frequency === 'single' && p.premium)
    ? `<tr class="note"><td colspan="99"><div>Red: how the premium is paid. Single premiums are one-off payments, so they aren't in the yearly and monthly totals.</div></td></tr>`
    : `<tr class="note"><td colspan="99"><div>Red: how the premium is paid.</div></td></tr>`;
  const basics = (p, i) => `<td>${i + 1}</td><td class="l">${esc(p.insurer || '–')}</td><td class="l">${esc(p.policyNo || '–')}</td>
    <td class="l">${esc(p.plan || '–')}</td><td class="l">${esc(p.type)}</td><td class="l">${dateLabel(p.startDate)}</td>`;

  const protection = inGroup('protection');
  byId('protection-table').innerHTML = table(
    [['S/N'], ['Insurer', 'l'], ['Policy no.', 'l'], ['Plan + riders', 'l'], ['Type', 'l'], ['Start', 'l'], ['Premium end', 'l'],
      ['Policy end', 'l'], ['Current value'], ['Premium / yr'], ['Premium / mth'], ['Mode', 'l'],
      ...BENEFITS.map(b => [b.label]), ['Remarks', 'l']],
    protection.map((p, i) => `<tr>${basics(p, i)}<td class="l">${dateLabel(p.premiumEndDate)}</td><td class="l">${dateLabel(p.endDate)}</td>
      <td>${amount(p.currentValue)}</td>${premiumCells(p)}${BENEFITS.map(b => `<td>${amount(p.cover[b.key])}</td>`).join('')}
      <td class="l">${esc(p.remarks)}</td></tr>`).join(''),
    protection.length ? `<tfoot><tr><td class="l" colspan="8">Total</td>${[
      total(protection, p => p.currentValue), total(protection, annualPremium), total(protection, annualPremium) / 12,
    ].map(v => `<td>${amount(v)}</td>`).join('')}<td></td>${BENEFITS.map(b => `<td>${amount(total(protection, p => p.cover[b.key]))}</td>`).join('')}<td></td></tr>${singleNote(protection)}</tfoot>` : '');

  const wealth = inGroup('wealth');
  byId('wealth-table').innerHTML = table(
    [['S/N'], ['Insurer', 'l'], ['Policy / account no.', 'l'], ['Plan + riders', 'l'], ['Type', 'l'], ['Start', 'l'],
      ['Payment end', 'l'], ['Maturity', 'l'], ['Projected IRR'], ['Premium / yr'], ['Premium / mth'], ['Mode', 'l'],
      ['Current value'], ['Projected value'], ['Remarks', 'l']],
    wealth.map((p, i) => `<tr>${basics(p, i)}<td class="l">${dateLabel(p.premiumEndDate)}</td><td class="l">${dateLabel(p.endDate)}</td>
      <td>${p.projectedIrr ? `${p.projectedIrr}%` : '–'}</td>${premiumCells(p)}
      <td>${amount(p.currentValue)}</td><td>${amount(p.projectedValue)}</td><td class="l">${esc(p.remarks)}</td></tr>`).join(''),
    wealth.length ? `<tfoot><tr><td class="l" colspan="9">Total</td>${[
      total(wealth, annualPremium), total(wealth, annualPremium) / 12,
    ].map(v => `<td>${amount(v)}</td>`).join('')}<td></td><td>${amount(total(wealth, p => p.currentValue))}</td>
      <td>${amount(total(wealth, p => p.projectedValue))}</td><td></td></tr>${singleNote(wealth)}</tfoot>` : '');

  // Retirement payouts by age, against the monthly goal when one is set.
  const goal = client.retirementGoal;
  const birthYear = client.dob ? +client.dob.slice(0, 4) : null;
  byId('timeline-table').innerHTML = table(
    [['Age'], ['Year'], ['From', 'l'], ['Lump sum'], ['Regular (yearly)'], ['Regular (monthly)'], ...(goal ? [[`Vs goal of ${money(goal)}/mth`]] : [])],
    payoutTimeline(policies, birthYear).map(r => `<tr><td>${r.age}</td><td>${r.year ?? '–'}</td>
      <td class="l">${r.items.map(esc).join('<br>')}</td><td>${amount(r.lump)}</td><td>${amount(r.yearly)}</td><td>${amount(r.monthly)}</td>
      ${goal ? (r.monthly >= goal ? '<td class="ok">Met</td>' : `<td class="short">${money(goal - r.monthly)} short</td>`) : ''}</tr>`).join(''));

  const by = [client.adviserName, client.adviserMobile && `M: ${client.adviserMobile}`].filter(Boolean).join('\n');
  byId('report-foot').textContent = `${by ? `Prepared by:\n${by}\n\n` : ''}${DISCLAIMER}`;
}

fillClient();
renderPolicies();
renderReport();

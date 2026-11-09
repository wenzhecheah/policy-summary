// The page: reads the form, shows the report, saves and opens client files.
const byId = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const money = n => n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 });
const amount = n => n ? money(n) : '–';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = s => { if (!s) return '–'; const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
const FREQUENCIES = [['monthly', 'Monthly'], ['yearly', 'Yearly'], ['single', 'Single premium']];

const newClient = () => ({ ...blankClient(), preparedOn: today(), adviserName: ADVISER.name, adviserMobile: ADVISER.mobile });
let state = { client: newClient(), policies: [] };
let unsaved = false;

// A form value, stored as the same kind of value as the blank one.
const parse = (blankValue, raw) => fit({ v: blankValue }, { v: raw }).v;
const shown = v => v === 0 || v === null ? '' : v;

// ---- Form ----
function fillClient() {
  for (const el of document.querySelectorAll('[data-client]')) el.value = shown(state.client[el.dataset.client]);
}

function policyCard(p, i) {
  const options = (list, sel) => list.map(([v, label]) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(label)}</option>`).join('');
  const field = (key, label, type, value, extra = '') =>
    `<label>${label} <input type="${type}" data-field="${key}" value="${esc(shown(value))}" ${extra}></label>`;
  const num = (key, label, value, extra = 'min="0"') => field(key, label, 'number', value, `inputmode="decimal" step="any" ${extra}`);
  const text = (key, label, value) => field(key, label, 'text', value, 'autocomplete="off"');
  const date = (key, label, value) => field(key, label, 'date', value);
  const wealth = groupOf(p.type) === 'wealth';
  return `<div class="panel policy" data-index="${i}">
    <fieldset>
      <legend>Policy ${i + 1}</legend>
      <div class="grid4">
        <label>Type <select data-field="type">${options(POLICY_TYPES.map(t => [t.label, t.label]), p.type)}</select></label>
        ${text('insurer', 'Insurer', p.insurer)}
        ${text('plan', 'Plan + riders', p.plan)}
        ${text('policyNo', 'Policy / account no.', p.policyNo)}
        ${date('startDate', 'Start date', p.startDate)}
        ${date('premiumEndDate', 'Premium end date', p.premiumEndDate)}
        ${date('endDate', 'Policy end / maturity date', p.endDate)}
        <label>Payment mode <select data-field="paymentMode">${options([['', '–'], ...PAYMENT_MODES.map(m => [m, m])], p.paymentMode)}</select></label>
        ${num('premium', 'Premium', p.premium)}
        <label>Paid <select data-field="frequency">${options(FREQUENCIES, p.frequency)}</select></label>
      </div>
      <details${wealth ? '' : ' open'}>
        <summary>Cover (sum assured)</summary>
        <div class="grid4">${BENEFITS.map(b => num(`cover.${b.key}`, b.label, p.cover[b.key])).join('')}</div>
      </details>
      <details${wealth ? ' open' : ''}>
        <summary>Value and payouts</summary>
        <div class="grid4">
          ${num('currentValue', 'Current value (net realisable)', p.currentValue)}
          ${num('projectedValue', 'Projected value at maturity', p.projectedValue)}
          ${num('projectedIrr', 'Projected IRR (% a year)', p.projectedIrr, '')}
          ${num('lumpSum', 'Lump sum payout', p.lumpSum)}
          ${num('lumpSumAge', 'Lump sum paid at age', p.lumpSumAge)}
          ${num('yearlyPayout', 'Regular payout (yearly)', p.yearlyPayout)}
          ${num('payoutFrom', 'Regular payout from age', p.payoutFrom)}
          ${num('payoutTo', `To age <span class="hint">(blank: lifelong, shown to ${LIFELONG_TO_AGE})</span>`, p.payoutTo)}
        </div>
      </details>
      ${text('remarks', 'Remarks', p.remarks)}
      <button type="button" class="remove" data-remove="${i}">Remove policy</button>
    </fieldset>
  </div>`;
}

function renderPolicies() {
  byId('policies').innerHTML = state.policies.map(policyCard).join('');
}

byId('form').addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.client) {
    state.client[el.dataset.client] = parse(blankClient()[el.dataset.client], el.value);
  } else if (el.dataset.field) {
    const p = state.policies[+el.closest('.policy').dataset.index];
    const [key, sub] = el.dataset.field.split('.');
    if (sub) p[key][sub] = parse(0, el.value);
    else p[key] = parse(blankPolicy()[key], el.value);
  } else return;
  unsaved = true;
  renderReport();
});

byId('policies').addEventListener('click', e => {
  const i = e.target.dataset.remove;
  if (i === undefined || !confirm(`Remove ${policyName(state.policies[+i])}?`)) return;
  state.policies.splice(+i, 1);
  unsaved = true;
  renderPolicies();
  renderReport();
});

byId('add-policy').addEventListener('click', () => {
  state.policies.push(blankPolicy());
  unsaved = true;
  renderPolicies();
  renderReport();
  byId('policies').lastElementChild.querySelector('select').focus();
});

// ---- Client files ----
const discardOk = () => !unsaved || confirm('The current client has unsaved changes. Discard them?');

function show(newState) {
  state = newState;
  unsaved = false;
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

window.addEventListener('beforeunload', e => { if (unsaved) e.preventDefault(); });

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
  const premiumCells = p => `<td>${amount(annualPremium(p))}</td><td>${amount(annualPremium(p) / 12)}</td><td class="l">${esc(p.paymentMode || '–')}</td>`;
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
    ].map(v => `<td>${amount(v)}</td>`).join('')}<td></td>${BENEFITS.map(b => `<td>${amount(total(protection, p => p.cover[b.key]))}</td>`).join('')}<td></td></tr></tfoot>` : '');

  const wealth = inGroup('wealth');
  byId('wealth-table').innerHTML = table(
    [['S/N'], ['Insurer', 'l'], ['Policy / account no.', 'l'], ['Plan + riders', 'l'], ['Type', 'l'], ['Start', 'l'],
      ['Payment end', 'l'], ['Maturity', 'l'], ['Projected IRR'], ['Single premium'], ['Premium / yr'], ['Premium / mth'], ['Mode', 'l'],
      ['Current value'], ['Projected value'], ['Remarks', 'l']],
    wealth.map((p, i) => `<tr>${basics(p, i)}<td class="l">${dateLabel(p.premiumEndDate)}</td><td class="l">${dateLabel(p.endDate)}</td>
      <td>${p.projectedIrr ? `${p.projectedIrr}%` : '–'}</td><td>${amount(p.frequency === 'single' ? p.premium : 0)}</td>${premiumCells(p)}
      <td>${amount(p.currentValue)}</td><td>${amount(p.projectedValue)}</td><td class="l">${esc(p.remarks)}</td></tr>`).join(''),
    wealth.length ? `<tfoot><tr><td class="l" colspan="9">Total</td>${[
      total(wealth, p => p.frequency === 'single' ? p.premium : 0), total(wealth, annualPremium), total(wealth, annualPremium) / 12,
    ].map(v => `<td>${amount(v)}</td>`).join('')}<td></td><td>${amount(total(wealth, p => p.currentValue))}</td>
      <td>${amount(total(wealth, p => p.projectedValue))}</td><td></td></tr></tfoot>` : '');

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

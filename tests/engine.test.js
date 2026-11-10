// Run with: node --test
// Loads the app's scripts as the browser does (shared top-level names).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({});
for (const f of ['config.js', 'engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
}
const run = code => vm.runInContext(code, ctx);
// Results cross the vm boundary, so compare them as plain JSON.
const call = (fn, ...args) => JSON.parse(JSON.stringify(run(fn)(...args)));
const policy = over => ({ ...run('blankPolicy')(), ...over });

test('premiums are annualised; single premiums are kept apart', () => {
  const s = call('premiumSummary', [
    policy({ premium: 100, frequency: 'monthly' }),
    policy({ premium: 2400, frequency: 'yearly' }),
    policy({ premium: 50000, frequency: 'single' }),
  ], 60000);
  assert.deepEqual(s, { yearly: 3600, monthly: 300, single: 50000, shareOfIncome: 0.06 });
  assert.equal(call('premiumSummary', [], 0).shareOfIncome, null);
});

test('cover is totalled per benefit and compared with income multiples', () => {
  const ps = [
    policy({ cover: { ...policy().cover, death: 300000, ci: 100000 } }),
    policy({ cover: { ...policy().cover, death: 200000, tpd: 200000 } }),
  ];
  const totals = call('coverageTotals', ps);
  assert.equal(totals.death, 500000);
  assert.equal(totals.ci, 100000);
  // Voyage's recommendation: 5x annual income for death, TPD, CI and early CI.
  const gaps = Object.fromEntries(call('coverageGaps', totals, 120000).map(g => [g.key, g]));
  assert.deepEqual(gaps.death, { key: 'death', label: 'Death', have: 500000, need: 600000, gap: 100000 });
  assert.equal(gaps.tpd.gap, 400000);
  assert.equal(gaps.ci.gap, 500000);
  assert.equal(gaps.eci.need, 600000);
  assert.equal(gaps.accidentalDeath.need, null); // no recommendation
  assert.equal(gaps.accidentalDeath.gap, null);
  // More cover than needed is no shortfall, not a negative one.
  assert.equal(call('coverageGaps', { ...totals, death: 900000 }, 60000)[0].gap, 0);
});

test('payout timeline adds lump sums and regular payouts by age', () => {
  const rows = call('payoutTimeline', [
    policy({ insurer: 'AIA', plan: 'Endow', lumpSum: 50000, lumpSumAge: 65 }),
    policy({ insurer: 'GE', plan: 'Income', yearlyPayout: 12000, payoutFrom: 65, payoutTo: 66 }),
    policy({ type: 'CPF LIFE', yearlyPayout: 18000, payoutFrom: 66 }), // lifelong
  ], 1980);
  assert.equal(rows[0].age, 65);
  assert.equal(rows[0].year, 2045);
  assert.equal(rows[0].lump, 50000);
  assert.equal(rows[0].yearly, 12000);
  assert.equal(rows[0].monthly, 1000);
  assert.deepEqual(rows[0].items, ['AIA Endow (lump sum)', 'GE Income']);
  assert.deepEqual(rows[1].items, ['GE Income', 'CPF LIFE']);
  assert.equal(rows[1].yearly, 30000);
  assert.equal(rows.at(-1).age, run('LIFELONG_TO_AGE'));
  assert.equal(rows.length, run('LIFELONG_TO_AGE') - 65 + 1);
  // No date of birth: ages only.
  assert.equal(call('payoutTimeline', [policy({ lumpSum: 1, lumpSumAge: 60 })], null)[0].year, null);
  // An end age before the start age still pays once; a typo can't run past 120.
  assert.equal(call('payoutTimeline', [policy({ yearlyPayout: 1, payoutFrom: 70, payoutTo: 60 })], null).length, 1);
  assert.equal(call('payoutTimeline', [policy({ yearlyPayout: 1, payoutFrom: 100, payoutTo: 99999 })], null).length, 21);
});

test('client files round-trip and bad values are cleaned', () => {
  const file = call('clientFile', { ...run('blankClient')(), name: 'Tan' }, [policy({ premium: 100 })]);
  const back = call('readClientFile', file);
  assert.equal(back.client.name, 'Tan');
  assert.equal(back.policies[0].premium, 100);

  const messy = call('readClientFile', { app: 'policy-summary', policies: [
    { premium: 'abc', lumpSumAge: '', payoutFrom: '65', cover: { death: '1000' }, insurer: 42, extra: 'dropped' },
  ] });
  const p = messy.policies[0];
  assert.equal(p.premium, 0);
  assert.equal(p.lumpSumAge, null);
  assert.equal(p.payoutFrom, 65);
  assert.equal(p.cover.death, 1000);
  assert.equal(p.cover.ci, 0);
  assert.equal(p.insurer, '42');
  assert.equal(p.extra, undefined);
  assert.equal(messy.client.name, '');

  assert.throws(() => call('readClientFile', { policies: 'x' }), /not a Policy Summary/);
  assert.throws(() => call('readClientFile', null), /not a Policy Summary/);
});

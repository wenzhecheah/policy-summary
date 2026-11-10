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

test('IRR estimate from premiums and the projected value at maturity', () => {
  // $5,000 a year for 10 years, $70,000 at the end of year 15: about 3.22% a year.
  const yearly = call('estimateIrr', policy({ premium: 5000, frequency: 'yearly', startDate: '2020-01-01',
    premiumEndDate: '2030-01-01', endDate: '2035-01-01', projectedValue: 70000 }));
  assert.equal(yearly.payments, 10);
  assert.equal(yearly.paid, 50000);
  assert.ok(Math.abs(yearly.rate - 0.0322) < 0.0005, `got ${yearly.rate}`);
  // A single premium: $50,000 growing to $62,000 over 10 years is 1.24^(1/10) - 1.
  const single = call('estimateIrr', policy({ premium: 50000, frequency: 'single', startDate: '2024-05-01',
    endDate: '2034-05-01', projectedValue: 62000 }));
  assert.equal(single.payments, 1);
  assert.ok(Math.abs(single.rate - (1.24 ** 0.1 - 1)) < 0.0002, `got ${single.rate}`);
  // Monthly: 15 years of payments.
  const monthly = call('estimateIrr', policy({ premium: 500, frequency: 'monthly', startDate: '2020-01-10',
    premiumEndDate: '2035-01-10', endDate: '2035-01-10', projectedValue: 120000 }));
  assert.equal(monthly.payments, 180);
  assert.ok(monthly.rate > 0.03 && monthly.rate < 0.04, `got ${monthly.rate}`);
  // Getting back less than was paid is a negative IRR.
  assert.ok(call('estimateIrr', policy({ premium: 50000, frequency: 'single', startDate: '2024-01-01',
    endDate: '2029-01-01', projectedValue: 45000 })).rate < 0);
  // Month-end start dates don't skip February.
  assert.equal(new Date(call('addMonths', '2024-01-31', 1)).toISOString().slice(0, 10), '2024-02-29');
  // Missing or impossible inputs say what's needed.
  assert.deepEqual(call('estimateIrr', policy({})).missing,
    ['premium', 'start date', 'premium end date', 'maturity date', 'projected value at maturity']);
  assert.deepEqual(call('estimateIrr', policy({ premium: 1, frequency: 'single', startDate: '2030-01-01',
    endDate: '2020-01-01', projectedValue: 1 })).missing, ['a maturity date after the start date']);
});

test('phone numbers are spaced as 1234 5678', () => {
  assert.equal(call('phoneText', '91234567'), '9123 4567');
  assert.equal(call('phoneText', '9123 4567'), '9123 4567');
  assert.equal(call('phoneText', '9123-4567'), '9123 4567');
  assert.equal(call('phoneText', '+6591234567'), '+65 9123 4567');
  assert.equal(call('phoneText', '+65 9123 4567'), '+65 9123 4567');
  assert.equal(call('phoneText', '91234'), '9123 4');   // while typing
  assert.equal(call('phoneText', '912'), '912');
  assert.equal(call('phoneText', ''), '');
  assert.equal(call('phoneText', '+60 12-345 6789'), '+60 12-345 6789'); // other countries: as typed
  assert.equal(call('phoneText', '0123456789'), '0123456789');           // too long: as typed
  assert.equal(call('phoneText', 'ext 123'), 'ext 123');
});

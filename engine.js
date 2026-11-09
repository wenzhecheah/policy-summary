// All calculations. No page code, so it can be tested on its own (tests/).

const blankClient = () => ({
  name: '', dob: '', annualIncome: 0, retirementGoal: 0, preparedOn: '', adviserName: '', adviserMobile: '',
});

// Ages are null when blank; amounts are 0.
const blankPolicy = () => ({
  type: POLICY_TYPES[0].label, insurer: '', policyNo: '', plan: '',
  startDate: '', premiumEndDate: '', endDate: '',
  premium: 0, frequency: 'yearly', paymentMode: '',
  cover: Object.fromEntries(BENEFITS.map(b => [b.key, 0])),
  currentValue: 0, projectedValue: 0, projectedIrr: 0,
  lumpSum: 0, lumpSumAge: null, yearlyPayout: 0, payoutFrom: null, payoutTo: null,
  remarks: '',
});

// Copy src into the shape of blank, coercing each value to blank's type, so a
// hand-edited or old client file can't put the wrong kind of value anywhere.
function fit(blank, src) {
  const out = {};
  for (const [k, v] of Object.entries(blank)) {
    const x = src?.[k];
    if (v !== null && typeof v === 'object') out[k] = fit(v, x);
    else if (typeof v === 'number') out[k] = x !== '' && x != null && Number.isFinite(+x) ? +x : v;
    else if (v === null) out[k] = x === '' || x == null || !Number.isFinite(+x) ? null : +x;
    else out[k] = x == null ? v : String(x);
  }
  return out;
}

const FILE_APP = 'policy-summary', FILE_VERSION = 1;

// Checks and cleans a loaded client file. Throws if it isn't one.
function readClientFile(data) {
  if (data?.app !== FILE_APP || !Array.isArray(data.policies)) throw new Error('This is not a Policy Summary client file.');
  return { client: fit(blankClient(), data.client), policies: data.policies.map(p => fit(blankPolicy(), p)) };
}

const clientFile = (client, policies) => ({ app: FILE_APP, version: FILE_VERSION, client, policies });

const groupOf = type => POLICY_TYPES.find(t => t.label === type)?.group ?? 'protection';

// Premiums per year; single premiums are counted separately.
const annualPremium = p => p.frequency === 'monthly' ? p.premium * 12 : p.frequency === 'yearly' ? p.premium : 0;

const total = (list, f) => list.reduce((s, x) => s + f(x), 0);

function coverageTotals(policies) {
  return Object.fromEntries(BENEFITS.map(b => [b.key, total(policies, p => p.cover[b.key])]));
}

// Cover held against the recommended amount for each benefit.
function coverageGaps(totals, annualIncome) {
  return BENEFITS.map(b => {
    const need = b.incomeMultiple === null ? null : b.incomeMultiple * annualIncome;
    return { key: b.key, label: b.label, have: totals[b.key], need, gap: need === null ? null : Math.max(0, need - totals[b.key]) };
  });
}

function premiumSummary(policies, annualIncome) {
  const yearly = total(policies, annualPremium);
  return {
    yearly, monthly: yearly / 12,
    single: total(policies, p => p.frequency === 'single' ? p.premium : 0),
    shareOfIncome: annualIncome > 0 ? yearly / annualIncome : null,
  };
}

const valueSummary = policies => ({
  current: total(policies, p => p.currentValue), projected: total(policies, p => p.projectedValue),
});

const policyName = p => [p.insurer, p.plan].filter(Boolean).join(' ') || p.type;

// One row per age with a payout: lump sums, and regular payouts each year from
// payoutFrom to payoutTo (or LIFELONG_TO_AGE when there's no end age).
// birthYear may be null, in which case year is null.
function payoutTimeline(policies, birthYear) {
  const rows = new Map();
  const row = age => {
    if (!rows.has(age)) rows.set(age, { age, year: birthYear === null ? null : birthYear + age, lump: 0, yearly: 0, items: [] });
    return rows.get(age);
  };
  for (const p of policies) {
    if (p.lumpSum > 0 && p.lumpSumAge !== null) {
      const r = row(p.lumpSumAge);
      r.lump += p.lumpSum;
      r.items.push(`${policyName(p)} (lump sum)`);
    }
    if (p.yearlyPayout > 0 && p.payoutFrom !== null) {
      // Ages are capped so a typo can't create thousands of rows.
      const to = Math.min(120, Math.max(p.payoutFrom, p.payoutTo ?? LIFELONG_TO_AGE));
      for (let age = p.payoutFrom; age <= to; age++) {
        const r = row(age);
        r.yearly += p.yearlyPayout;
        r.items.push(policyName(p));
      }
    }
  }
  return [...rows.values()].sort((a, b) => a.age - b.age).map(r => ({ ...r, monthly: r.yearly / 12 }));
}

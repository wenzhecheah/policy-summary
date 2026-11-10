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

// ---- IRR estimate -------------------------------------------------------------

// Date 'YYYY-MM-DD' plus `months` months, as a UTC timestamp. The day is kept,
// or moved back to the month's last day (31 Jan + 1 month = 28/29 Feb).
function addMonths(date, months) {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return Date.UTC(y, m - 1 + months, Math.min(d, last));
}

// Yearly rate r where the cash flows' value today is zero. `flows` are
// [years from the first payment, amount] (premiums negative, money back
// positive). Found by bisection between -99% and +100% a year; null if no
// rate in that range balances them.
function irr(flows) {
  const npv = r => flows.reduce((sum, [t, cf]) => sum + cf / (1 + r) ** t, 0);
  let lo = -0.99, hi = 1;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// Estimated IRR for a policy from its premiums and projected value at maturity.
// Premiums are paid from startDate, monthly or yearly, while before
// premiumEndDate (a single premium once, on startDate); the projected value is
// received on endDate. Cash payouts taken out along the way are not included.
// Returns { missing: [field labels] } if something it needs is blank, else
// { rate, payments, paid, received } (rate as a fraction, or null).
function estimateIrr(p) {
  const single = p.frequency === 'single';
  const missing = [
    !(p.premium > 0) && 'premium', !p.startDate && 'start date',
    !single && !p.premiumEndDate && 'premium end date', !p.endDate && 'maturity date',
    !(p.projectedValue > 0) && 'projected value at maturity',
  ].filter(Boolean);
  if (missing.length) return { missing };
  const start = addMonths(p.startDate, 0), end = addMonths(p.endDate, 0);
  if (end <= start) return { missing: ['a maturity date after the start date'] };
  const years = t => (t - start) / (365.25 * 86400000);
  const step = p.frequency === 'monthly' ? 1 : 12;
  const flows = [];
  // At most 100 years of payments, so a typo can't loop for ever.
  for (let k = 0; flows.length < 1200; k += step) {
    const t = addMonths(p.startDate, k);
    if (single ? k > 0 : t >= addMonths(p.premiumEndDate, 0) || t > end) break;
    flows.push([years(t), -p.premium]);
  }
  if (!flows.length) return { missing: ['a premium end date after the start date'] };
  flows.push([years(end), p.projectedValue]);
  return { rate: irr(flows), payments: flows.length - 1, paid: (flows.length - 1) * p.premium, received: p.projectedValue };
}

// Singapore phone numbers as 1234 5678 (+65 1234 5678 with the country code).
// Anything else (other country codes, longer numbers) is left as typed.
function phoneText(raw) {
  const typed = String(raw).trim();
  let digits = typed.replace(/\D/g, ''), prefix = '';
  if (typed.startsWith('+')) {
    if (!digits.startsWith('65')) return typed;
    prefix = '+65 ';
    digits = digits.slice(2);
  }
  if (digits.length > 8 || /[^\d\s+()-]/.test(typed)) return typed;
  return prefix + (digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits);
}

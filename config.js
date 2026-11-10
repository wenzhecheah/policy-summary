// Settings for your practice. Change them here; nothing else needs editing.

// Pre-fills "Prepared by" for every new client (it can still be changed per client).
const ADVISER = { name: '', mobile: '' };

// Printed at the bottom of every report.
const DISCLAIMER = 'This portfolio summary is meant for general information only. ' +
  'The precise terms and conditions are specified in your policy contracts.';

// The benefits counted for each policy. incomeMultiple is the recommended cover
// as a multiple of annual income; null means no recommendation is shown.
// Voyage's recommendation: 5x for whole life cover (death and TPD), critical
// illness and early critical illness, to keep premiums affordable (lower than
// the 9x death / 4x CI industry rule of thumb).
const BENEFITS = [
  { key: 'death', label: 'Death', incomeMultiple: 5 },
  { key: 'tpd', label: 'Total & permanent disability', incomeMultiple: 5 },
  { key: 'ci', label: 'Critical illness', incomeMultiple: 5 },
  { key: 'eci', label: 'Early critical illness', incomeMultiple: 5 },
  { key: 'accidentalDeath', label: 'Accidental death', incomeMultiple: null },
  { key: 'accidentalDisablement', label: 'Accidental disablement', incomeMultiple: null },
  { key: 'disabilityIncome', label: 'Disability income', incomeMultiple: null },
  { key: 'accidentalMedical', label: 'Accidental medical expenses', incomeMultiple: null },
];

// Policy types. "protection" policies go in the Risk Management table,
// "wealth" ones in the Wealth Management table.
const POLICY_TYPES = [
  { label: 'Hospitalisation', group: 'protection' },
  { label: 'Hospitalisation rider', group: 'protection' },
  { label: 'Personal accident', group: 'protection' },
  { label: 'Term life', group: 'protection' },
  { label: 'Whole life', group: 'protection' },
  { label: 'Critical illness', group: 'protection' },
  { label: 'Early critical illness', group: 'protection' },
  { label: 'Disability income', group: 'protection' },
  { label: 'Long-term care', group: 'protection' },
  { label: 'Endowment', group: 'wealth' },
  { label: 'Investment-linked', group: 'wealth' },
  { label: 'Investment pot', group: 'wealth' },
  { label: 'Passive income pot', group: 'wealth' },
  { label: 'Annuity / retirement income', group: 'wealth' },
  { label: 'CPF LIFE', group: 'wealth' },
];

// Insurers in the Insurer dropdown. "Others" (always last) lets the user type one in.
const INSURERS = [
  'AIA', 'Prudential', 'Great Eastern', 'Income Insurance', 'Manulife', 'Singlife',
  'HSBC Life', 'Tokio Marine Life', 'FWD', 'China Life', 'Etiqa', 'Raffles Health Insurance',
];

const PAYMENT_MODES = ['GIRO', 'Credit card', 'Cash / cheque', 'CPF OA', 'CPF MA', 'SRS'];

// Last age shown for regular payouts with no end age (e.g. lifelong payouts).
const LIFELONG_TO_AGE = 95;

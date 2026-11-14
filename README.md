# Policy Summary

A Voyage Wealth Advisory tool that turns a client's insurance and investment
policies into a one-page summary: cover for each benefit against recommended
amounts, premiums, policy values and retirement payouts by age.

Open `index.html` in a browser. There is no install or build step, and nothing
entered leaves the browser unless you save the client file.

## How to use it

1. Enter the client's details.
2. Fill in one policy at a time (type, insurer, dates, premium, sums assured,
   values and payouts) and press **Add policy**. It joins the **Policies
   added** list, and the form clears for the next one. Use **Edit** in the
   list to change a policy (then **Save changes**, or **Cancel**), and
   **Remove** to delete it.
   The **IRR calculator** section estimates a policy's IRR from its premium,
   how often it's paid, start date, premium end date, maturity date and
   projected value at maturity, and can copy it into Projected IRR. Cash
   payouts taken out along the way aren't included, so prefer the insurer's
   illustrated figure where there is one.
3. The report below updates as each policy is added, changed or removed:
   coverage and shortfalls, the Risk management and Wealth management tables,
   and the retirement payout timeline against the client's monthly goal.
4. **Print / Save as PDF** prints the report only (A4 landscape). The Risk
   Management and Wealth Management portfolios each print on their own page,
   laid out like the Excel template's sheets (colour-coded column groups,
   totals block, "Prepared by" and disclaimer).
5. **Save client file** downloads the client's details as a `.json` file.
   Use **Open client file** at the next review to update it instead of starting
   again. Keep these files private: they hold the client's personal data.

## Settings

Edit `config.js` to change:

- `ADVISER`: your name and mobile, filled in for every new client
- `DISCLAIMER`: the text at the bottom of every report
- `BENEFITS`: the benefits counted and the recommended cover for each, as a
  multiple of annual income (Voyage's recommendation: 5× for death and TPD,
  critical illness and early critical illness)
- `POLICY_TYPES`: the policy types, and which table each one goes in
- `INSURERS`: the insurers in the Insurer dropdown ("Others" lets you type one in)
- `PAYMENT_MODES`, `LIFELONG_TO_AGE`

## Code

- `engine.js`: all calculations (no page code), tested in `tests/`.
- `app.js`: the form, the report, and saving and opening client files.
- `to-top.js`: the back-to-top button (as in the BTO Planner).
- `fade-in.js`: the page's parts fade in one by one when it opens.
- `style.css`: the CPF Forecast Calculator's styles, with additions at the end.

Run the tests (Node 18 or later):

```
node --test
```

## Limits

The summary is for general information, not advice. Recommended cover uses
simple income multiples, not a full needs analysis. Regular payouts with no end
age are shown to age 95. One client per file.

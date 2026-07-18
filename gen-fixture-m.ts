#!/usr/bin/env tsx
/**
 * gen-fixture-m.ts — Fixture M: the MESSY household (PROTOCOL.md §4c).
 *
 * A realistic multi-account household over 24 months, generated with a
 * SEEDED PRNG so every row is reproducible bit-for-bit, with ground truth
 * computed by construction and written to fixture-m-truth.json.
 *
 * Deliberate arithmetic traps (where in-context summation double-counts):
 *   T1. Internal transfers: checking → brokerage ($800/mo) and
 *       checking → 529s ($400/mo) appear as outflows in checking and
 *       inflows in the receiving account. They are NOT spending.
 *   T2. Credit-card payments: checking outflow AND card inflow each month.
 *       The card PURCHASES are the spending; counting both payment and
 *       purchases double-counts.
 *   T3. Noise: amounts vary ±20%, one-off spikes (car repair, ER visit,
 *       vacation), annual bills (property tax, insurance premiums), a
 *       mid-period raise, an annual bonus, and refunds.
 *
 * Outputs (deterministic):
 *   fixture-m-<account>.csv        bank-export CSVs per account
 *   fixture-m-truth.json           ground truth (sealed until scoring)
 *   fixture-m-seed.sql             seeding SQL per workspace (stored convention)
 *
 * Usage: npx tsx study/gen-fixture-m.ts [--sql ck_ws debt_ws inv_ws ret_ws]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'fixture-m');

/* ── Seeded PRNG (LCG — Numerical Recipes constants). Reproducible. ── */
let seed = 0x5EED2026;
function rnd(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}
function vary(base: number, pct = 0.2): number {
  return Math.round(base * (1 + (rnd() * 2 - 1) * pct) * 100) / 100;
}
function pick<T>(arr: T[]): T { return arr[Math.floor(rnd() * arr.length)]; }

/* ── Time span: 24 full months ending 2026-06-30 ── */
const MONTHS: { y: number; m: number }[] = [];
for (let i = 23; i >= 0; i--) {
  const d = new Date(Date.UTC(2026, 5 - i, 1));
  MONTHS.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
}
const dstr = (y: number, m: number, day: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

interface Txn { account: string; date: string; name: string; amount: number; kind: string }
// amount convention here: BANK EXPORT style (deposits positive, debits negative)
const txns: Txn[] = [];
const truth = {
  months: 24,
  true_spending_total: 0,        // real consumption (checking spend + card purchases), excl. transfers & cc payments
  transfers_total: 0,            // internal movements (not spending)
  cc_payments_total: 0,          // payments to own cards (not spending)
  income_total: 0,
  by_month: {} as Record<string, { spending: number; income: number }>,
};

function spend(account: string, date: string, name: string, amt: number) {
  txns.push({ account, date, name, amount: -amt, kind: 'spend' });
  truth.true_spending_total += amt;
  const k = date.slice(0, 7);
  truth.by_month[k] = truth.by_month[k] || { spending: 0, income: 0 };
  truth.by_month[k].spending += amt;
}
function income(account: string, date: string, name: string, amt: number) {
  txns.push({ account, date, name, amount: amt, kind: 'income' });
  truth.income_total += amt;
  const k = date.slice(0, 7);
  truth.by_month[k] = truth.by_month[k] || { spending: 0, income: 0 };
  truth.by_month[k].income += amt;
}
function transfer(from: string, to: string, date: string, name: string, amt: number) {
  txns.push({ account: from, date, name, amount: -amt, kind: 'transfer-out' });
  txns.push({ account: to, date, name: name.replace('TO', 'FROM'), amount: amt, kind: 'transfer-in' });
  truth.transfers_total += amt;
}
function ccPayment(date: string, card: string, amt: number) {
  txns.push({ account: 'checking', date, name: `PAYMENT ${card.toUpperCase()}`, amount: -amt, kind: 'cc-payment-out' });
  txns.push({ account: card, date, name: 'PAYMENT RECEIVED - THANK YOU', amount: amt, kind: 'cc-payment-in' });
  truth.cc_payments_total += amt;
}

/* ── Generate ── */
let cardBalance: Record<string, number> = { visa: 0, amex: 0 };
MONTHS.forEach(({ y, m }, mi) => {
  const raise = mi >= 14 ? 1.06 : 1.0; // raise in month 15
  // Income: two semi-monthly paychecks + spouse part-time (irregular)
  income('checking', dstr(y, m, 1), 'MERIDIAN HEALTH SYSTEMS PAYROLL', Math.round(3400 * raise * 100) / 100);
  income('checking', dstr(y, m, 15), 'MERIDIAN HEALTH SYSTEMS PAYROLL', Math.round(3400 * raise * 100) / 100);
  if (rnd() < 0.7) income('checking', dstr(y, m, Math.ceil(rnd() * 26) + 1), 'UPWORK ESCROW', vary(650, 0.5));
  if (m === 12) income('checking', dstr(y, m, 20), 'MERIDIAN HEALTH BONUS', 4200); // annual bonus

  // Checking spending (essentials, variable)
  spend('checking', dstr(y, m, 1), 'FIRST COMMUNITY MORTGAGE', 2150);
  spend('checking', dstr(y, m, 2), 'BRIGHT HORIZONS CHILDCARE', vary(1180, 0.08));
  spend('checking', dstr(y, m, 5), 'AMEREN MISSOURI', vary(m >= 6 && m <= 9 ? 240 : 150, 0.15)); // seasonal
  spend('checking', dstr(y, m, 6), 'SPIRE ENERGY', vary(m >= 11 || m <= 3 ? 160 : 55, 0.15));
  spend('checking', dstr(y, m, 7), 'MSD WATER SEWER', vary(95, 0.1));
  spend('checking', dstr(y, m, 8), 'AT&T INTERNET', 85);
  spend('checking', dstr(y, m, 9), 'T-MOBILE', 105);
  for (const day of [3, 10, 17, 24]) spend('checking', dstr(y, m, day), 'SCHNUCKS ST LOUIS', vary(210, 0.25));
  if (m === 4) spend('checking', dstr(y, m, 12), 'ST LOUIS COUNTY PROPERTY TAX', 3850); // annual
  if (m === 8) spend('checking', dstr(y, m, 18), 'STATE FARM ANNUAL PREMIUM', 2140);   // annual

  // Card purchases (real spending, on the cards)
  const visaBuys = 6 + Math.floor(rnd() * 5);
  for (let i = 0; i < visaBuys; i++) {
    const amt = vary(pick([38, 62, 84, 120, 45]), 0.4);
    spend('visa', dstr(y, m, 1 + Math.floor(rnd() * 27)), pick(['AMAZON.COM', 'TARGET', 'COSTCO WHOLESALE', 'HOME DEPOT', 'CHIPOTLE', 'SHELL OIL']), amt);
    cardBalance.visa += amt;
  }
  const amexBuys = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < amexBuys; i++) {
    const amt = vary(pick([55, 95, 140, 68]), 0.4);
    spend('amex', dstr(y, m, 1 + Math.floor(rnd() * 27)), pick(['SUGARFIRE SMOKE HOUSE', 'DELTA AIR LINES', 'MARRIOTT', 'WHOLE FOODS', 'APPLE.COM']), amt);
    cardBalance.amex += amt;
  }

  // One-off spikes (sparse)
  if (mi === 4) spend('checking', dstr(y, m, 21), 'DOBBS AUTO REPAIR', 1640);
  if (mi === 11) spend('checking', dstr(y, m, 9), 'BJC EMERGENCY SERVICES', 950);
  if (mi === 13) spend('amex', dstr(y, m, 15), 'SOUTHWEST VACATIONS', (cardBalance.amex += 2380, 2380));

  // Refund noise
  if (rnd() < 0.25) {
    const r = vary(60, 0.5);
    txns.push({ account: 'visa', date: dstr(y, m, 26), name: 'AMAZON.COM REFUND', amount: r, kind: 'refund' });
    truth.true_spending_total -= r;
    cardBalance.visa -= r;
    truth.by_month[dstr(y, m, 26).slice(0, 7)].spending -= r;
  }

  // T2: pay the cards from checking (pays last month-ish balance)
  for (const card of ['visa', 'amex'] as const) {
    const pay = Math.round(cardBalance[card] * (0.85 + rnd() * 0.15) * 100) / 100;
    if (pay > 0) { ccPayment(dstr(y, m, 27), card, pay); cardBalance[card] -= pay; }
  }

  // T1: internal transfers (savings behavior — NOT spending)
  transfer('checking', 'brokerage', dstr(y, m, 16), 'TRANSFER TO SCHWAB BROKERAGE', 800);
  transfer('checking', 'fiveto9a', dstr(y, m, 16), 'TRANSFER TO MO ABLE 529 CHILD A', 200);
  transfer('checking', 'fiveto9b', dstr(y, m, 16), 'TRANSFER TO MO ABLE 529 CHILD B', 200);
});

/* Round truth */
truth.true_spending_total = Math.round(truth.true_spending_total * 100) / 100;
truth.transfers_total = Math.round(truth.transfers_total * 100) / 100;
truth.cc_payments_total = Math.round(truth.cc_payments_total * 100) / 100;
truth.income_total = Math.round(truth.income_total * 100) / 100;
const monthly = truth.true_spending_total / 24;

const ACCOUNTS: Record<string, { file: string; balance: number }> = {
  checking: { file: 'checking', balance: 22400 },
  visa: { file: 'visa-card', balance: -Math.round(cardBalance.visa * 100) / 100 },
  amex: { file: 'amex-card', balance: -Math.round(cardBalance.amex * 100) / 100 },
  brokerage: { file: 'brokerage', balance: 148000 },
  fiveto9a: { file: '529-child-a', balance: 21500 },
  fiveto9b: { file: '529-child-b', balance: 14200 },
};
// Retirement (no transactions — statement balances only, provided in prompts/domain)
const RETIREMENT = { '401k': 386000, rollover_ira: 118000 };

fs.mkdirSync(OUT, { recursive: true });
for (const [acct, meta] of Object.entries(ACCOUNTS)) {
  const rows = ['Date,Description,Amount'];
  txns.filter(t => t.account === acct)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(t => rows.push(`${t.date},"${t.name}",${t.amount.toFixed(2)}`));
  fs.writeFileSync(path.join(OUT, `fixture-m-${meta.file}.csv`), rows.join('\n'));
}
fs.writeFileSync(path.join(OUT, 'fixture-m-truth.json'), JSON.stringify({
  ...truth,
  true_monthly_spending_avg: Math.round(monthly * 100) / 100,
  account_balances: Object.fromEntries(Object.entries(ACCOUNTS).map(([k, v]) => [k, v.balance])),
  retirement_balances: RETIREMENT,
  txn_count: txns.length,
  prng_seed: '0x5EED2026',
}, null, 2));

console.error(`[fixture-m] ${txns.length} txns over 24 months across ${Object.keys(ACCOUNTS).length} accounts`);
console.error(`[fixture-m] TRUE monthly spending avg: $${monthly.toFixed(2)}`);
console.error(`[fixture-m] transfers (trap T1): $${truth.transfers_total} | cc payments (trap T2): $${truth.cc_payments_total}`);
console.error(`[fixture-m] naive sum of all outflows would overstate spending by ~$${((truth.transfers_total + truth.cc_payments_total) / 24).toFixed(0)}/mo`);

/* ── SQL emission (--sql ck_ws debt_ws inv_ws ret_ws): per-workspace seeding
   in the STORED convention (positive = money in — same orientation as the
   bank-export CSVs above, so amounts pass through directly). ── */
if (process.argv.includes('--sql')) {
  const i = process.argv.indexOf('--sql');
  const [ckWs, debtWs, invWs, retWs] = process.argv.slice(i + 1);
  if (!retWs) { console.error('--sql needs ck_ws debt_ws inv_ws ret_ws'); process.exit(1); }

  const CAT: Record<string, string> = {
    'FIRST COMMUNITY MORTGAGE': 'Mortgage', 'BRIGHT HORIZONS CHILDCARE': 'Childcare',
    'AMEREN MISSOURI': 'Utilities', 'SPIRE ENERGY': 'Utilities', 'MSD WATER SEWER': 'Utilities',
    'AT&T INTERNET': 'Utilities', 'T-MOBILE': 'Utilities', 'SCHNUCKS ST LOUIS': 'Groceries',
    'ST LOUIS COUNTY PROPERTY TAX': 'Taxes', 'STATE FARM ANNUAL PREMIUM': 'Insurance',
    'DOBBS AUTO REPAIR': 'Transportation', 'BJC EMERGENCY SERVICES': 'Health & Medical',
    'SOUTHWEST VACATIONS': 'Travel', 'AMAZON.COM': 'Shopping', 'TARGET': 'Shopping',
    'COSTCO WHOLESALE': 'Shopping', 'HOME DEPOT': 'Shopping', 'CHIPOTLE': 'Restaurants & Dining',
    'SHELL OIL': 'Transportation', 'SUGARFIRE SMOKE HOUSE': 'Restaurants & Dining',
    'DELTA AIR LINES': 'Travel', 'MARRIOTT': 'Travel', 'WHOLE FOODS': 'Groceries',
    'APPLE.COM': 'Shopping', 'AMAZON.COM REFUND': 'Shopping',
    'MERIDIAN HEALTH SYSTEMS PAYROLL': 'Income', 'MERIDIAN HEALTH BONUS': 'Income',
    'UPWORK ESCROW': 'Income',
  };
  const catFor = (t: Txn): string => {
    if (t.kind.startsWith('transfer')) return 'Transfer';
    if (t.kind.startsWith('cc-payment')) return 'Credit Card Payment';
    if (t.name.startsWith('PAYMENT')) return 'Credit Card Payment';
    return CAT[t.name] || 'Other';
  };

  const WS: Record<string, string> = {
    checking: ckWs, visa: debtWs, amex: debtWs,
    brokerage: invWs, fiveto9a: invWs, fiveto9b: invWs,
  };
  const ACCT_META: Record<string, { name: string; mask: string; type: string; subtype: string }> = {
    checking: { name: 'Commerce Bank Checking', mask: '3301', type: 'depository', subtype: 'checking' },
    visa: { name: 'Chase Freedom Visa', mask: '7742', type: 'credit', subtype: 'credit card' },
    amex: { name: 'Amex Gold', mask: '1105', type: 'credit', subtype: 'credit card' },
    brokerage: { name: 'Schwab Brokerage', mask: '9920', type: 'investment', subtype: 'brokerage' },
    fiveto9a: { name: 'MO ABLE 529 Child A', mask: '5501', type: 'investment', subtype: '529' },
    fiveto9b: { name: 'MO ABLE 529 Child B', mask: '5502', type: 'investment', subtype: '529' },
  };
  const esc2 = (x: string) => x.replace(/'/g, "''");
  const sql: string[] = ['BEGIN;'];

  for (const [acct, meta] of Object.entries(ACCT_META)) {
    const bal = ACCOUNTS[acct].balance;
    // Plaid convention for credit accounts: balance_current is positive = owed
    const cur = meta.type === 'credit' ? Math.abs(bal) : bal;
    sql.push(`INSERT INTO plaid_accounts (account_id, workspace_id, name, mask, type, subtype, balance_available, balance_current, currency) VALUES ('m_${acct}', '${WS[acct]}', '${esc2(meta.name)}', '${meta.mask}', '${meta.type}', '${meta.subtype}', ${meta.type === 'credit' ? 'NULL' : cur}, ${cur}, 'USD') ON CONFLICT (account_id) DO UPDATE SET balance_current = EXCLUDED.balance_current;`);
  }
  // retirement: statement balances only
  sql.push(`INSERT INTO plaid_accounts (account_id, workspace_id, name, mask, type, subtype, balance_available, balance_current, currency) VALUES ('m_401k', '${retWs}', 'Fidelity 401(k)', '4401', 'investment', '401k', ${RETIREMENT['401k']}, ${RETIREMENT['401k']}, 'USD') ON CONFLICT (account_id) DO NOTHING;`);
  sql.push(`INSERT INTO plaid_accounts (account_id, workspace_id, name, mask, type, subtype, balance_available, balance_current, currency) VALUES ('m_rollover', '${retWs}', 'Schwab Rollover IRA', '4402', 'investment', 'ira', ${RETIREMENT.rollover_ira}, ${RETIREMENT.rollover_ira}, 'USD') ON CONFLICT (account_id) DO NOTHING;`);

  const seen: Record<string, Set<string>> = {};
  txns.forEach((t, ti) => {
    const ws = WS[t.account];
    const cat = catFor(t);
    sql.push(`INSERT INTO plaid_transactions (transaction_id, workspace_id, account_id, amount, date, name, merchant_name, category, category_source, payment_channel, pending) VALUES ('m_${ti}_${t.account}', '${ws}', 'm_${t.account}', ${t.amount.toFixed(2)}, '${t.date}', '${esc2(t.name)}', '${esc2(t.name)}', '${esc2(cat)}', 'arthur', 'other', FALSE) ON CONFLICT (transaction_id) DO NOTHING;`);
    const key = t.name.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
    seen[ws] = seen[ws] || new Set();
    if (!seen[ws].has(key)) {
      seen[ws].add(key);
      sql.push(`INSERT INTO arthur_categories (workspace_id, merchant_key, category) VALUES ('${ws}', '${esc2(key)}', '${esc2(cat)}') ON CONFLICT (workspace_id, merchant_key) DO NOTHING;`);
    }
  });
  sql.push('COMMIT;');
  fs.writeFileSync(path.join(OUT, 'fixture-m-seed.sql'), sql.join('\n'));
  console.error(`[fixture-m] SQL: ${sql.length} statements → fixture-m/fixture-m-seed.sql`);
}

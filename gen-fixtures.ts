#!/usr/bin/env tsx
/**
 * gen-fixtures.ts — Deterministic ledger generator for the study fixtures
 * defined in study/PROTOCOL.md (§3).
 *
 * Emits SQL for plaid_accounts, plaid_transactions, and arthur_categories.
 * Every merchant, amount, and date is fixed; monthly outflows sum EXACTLY to
 * the protocol's spending baselines ($5,400 Fixture Y; $4,600 Fixture R).
 * Categories are pre-assigned with category_source='arthur' so the fixture
 * involves no model calls and is bit-for-bit reproducible by third parties.
 *
 * Usage:
 *   npx tsx study/gen-fixtures.ts Y <checking_ws_id> <investments_ws_id> > fixture-y.sql
 *   npx tsx study/gen-fixtures.ts R <checking_ws_id> <retirement_ws_id>  > fixture-r.sql
 *
 * Apply via kubectl exec into the target workspace pod's psql (same pattern
 * as scripts/seed-demo-goals.ts). Transactions span the 12 full calendar
 * months preceding FIXTURE_END.
 */

/* Fixed anchor so re-runs generate identical rows. */
const FIXTURE_END = new Date(Date.UTC(2026, 5, 30)); // 2026-06-30: months = Jul 2025..Jun 2026

interface MonthlyItem {
  slug: string;          // stable id fragment
  name: string;          // transaction name (bank-statement style)
  merchant: string;      // merchant_name
  category: string;      // PENDRAGON_CATEGORIES value
  amount: number;        // positive = outflow, negative = inflow (config-side)
  days: number[];        // days of month this posts
  channel?: string;
}
// STORED convention is the OPPOSITE of the config-side signs above: the sync
// layer negates all raw Plaid amounts (tools-plaid shared.ts normalizeAmount),
// so the database stores positive = money IN, negative = money OUT. Emission
// negates config amounts to match. Getting this wrong produced the v1 fixture
// anomaly recorded in FIXTURES.md.

/* ── Fixture Y: young family — outflows sum to exactly $5,400/mo ── */
const Y_CHECKING: MonthlyItem[] = [
  // Income: $6,300/mo net (semi-monthly)
  { slug: 'payroll', name: 'ACME LOGISTICS PAYROLL', merchant: 'Acme Logistics', category: 'Income', amount: -3150.00, days: [1, 15] },

  // Outflows — per-month total: 5400.00
  { slug: 'childcare', name: 'LITTLE SPROUTS LEARNING CTR', merchant: 'Little Sprouts Learning Center', category: 'Childcare', amount: 1350.00, days: [1] },
  { slug: 'grocery', name: 'SCHNUCKS ST LOUIS', merchant: 'Schnucks', category: 'Groceries', amount: 275.00, days: [3, 10, 17, 24] },        // 1100
  { slug: 'electric', name: 'AMEREN MISSOURI', merchant: 'Ameren Missouri', category: 'Utilities', amount: 165.00, days: [5] },
  { slug: 'gasutil', name: 'SPIRE ENERGY', merchant: 'Spire', category: 'Utilities', amount: 85.00, days: [6] },
  { slug: 'water', name: 'MO AMERICAN WATER', merchant: 'Missouri American Water', category: 'Utilities', amount: 70.00, days: [7] },
  { slug: 'internet', name: 'AT&T INTERNET', merchant: 'AT&T', category: 'Utilities', amount: 80.00, days: [8] },
  { slug: 'mobile', name: 'T-MOBILE', merchant: 'T-Mobile', category: 'Utilities', amount: 95.00, days: [9] },                               // utilities 495
  { slug: 'autoins', name: 'STATE FARM AUTO', merchant: 'State Farm', category: 'Insurance', amount: 172.00, days: [10] },
  { slug: 'homeins', name: 'STATE FARM HOMEOWNERS', merchant: 'State Farm', category: 'Insurance', amount: 118.00, days: [10] },             // insurance 290
  { slug: 'fuel', name: 'QUIKTRIP', merchant: 'QuikTrip', category: 'Transportation', amount: 62.00, days: [4, 11, 18, 25] },                // 248
  { slug: 'dining', name: 'SUGARFIRE SMOKE HOUSE', merchant: 'Sugarfire Smoke House', category: 'Restaurants & Dining', amount: 85.00, days: [5, 12, 19, 26] }, // 340
  { slug: 'takeout', name: 'IMOS PIZZA', merchant: "Imo's Pizza", category: 'Restaurants & Dining', amount: 45.00, days: [9, 27] },          // 90
  { slug: 'amazon', name: 'AMAZON.COM', merchant: 'Amazon', category: 'Shopping', amount: 120.00, days: [6, 20] },                           // 240
  { slug: 'target', name: 'TARGET ST LOUIS', merchant: 'Target', category: 'Shopping', amount: 185.00, days: [14] },
  { slug: 'costco', name: 'COSTCO WHOLESALE', merchant: 'Costco', category: 'Shopping', amount: 280.00, days: [28] },
  { slug: 'pharmacy', name: 'WALGREENS', merchant: 'Walgreens', category: 'Health & Medical', amount: 95.00, days: [16] },
  { slug: 'pediatric', name: 'STL PEDIATRIC ASSOCIATES', merchant: 'STL Pediatric Associates', category: 'Health & Medical', amount: 110.00, days: [21] },
  { slug: 'dental', name: 'GATEWAY DENTAL', merchant: 'Gateway Dental', category: 'Health & Medical', amount: 75.00, days: [18] },
  { slug: 'ymca', name: 'GATEWAY REGION YMCA', merchant: 'YMCA', category: 'Personal Care', amount: 89.00, days: [2] },
  { slug: 'streaming', name: 'NETFLIX SPOTIFY DISNEY', merchant: 'Netflix', category: 'Subscriptions & Streaming', amount: 55.00, days: [12] },
  { slug: 'kidsact', name: 'GYMBOREE PLAY STL', merchant: 'Gymboree Play & Music', category: 'Entertainment', amount: 120.00, days: [15] },
  { slug: 'personal', name: 'GREAT CLIPS', merchant: 'Great Clips', category: 'Personal Care', amount: 78.00, days: [22] },
  { slug: 'homedepot', name: 'HOME DEPOT', merchant: 'Home Depot', category: 'Shopping', amount: 160.00, days: [23] },
];
// Y outflow check: 1350+1100+495+290+248+340+90+240+185+280+95+110+75+89+55+120+78+160 = 5400 ✓

const Y_ACCOUNTS = [
  { id: 'study_y_checking', name: 'Commerce Bank Checking', mask: '4417', type: 'depository', subtype: 'checking', available: 18500, current: 18500 },
  { id: 'study_y_savings', name: 'Commerce Bank Savings', mask: '4425', type: 'depository', subtype: 'savings', available: 12000, current: 12000 },
];

const Y_INVEST_ACCOUNTS = [
  { id: 'study_y_brokerage', name: 'Schwab Brokerage', mask: '8830', type: 'investment', subtype: 'brokerage', available: 300000, current: 300000 },
];

/* ── Fixture R: retiree family — outflows sum to exactly $4,600/mo ── */
const R_CHECKING: MonthlyItem[] = [
  // Income: Social Security ($4,270/mo) + IRA distribution ($1,200/mo)
  { slug: 'ss-lead', name: 'SSA TREAS 310 XXSOC SEC', merchant: 'Social Security Administration', category: 'Income', amount: -2380.00, days: [3] },
  { slug: 'ss-spouse', name: 'SSA TREAS 310 XXSOC SEC', merchant: 'Social Security Administration', category: 'Income', amount: -1890.00, days: [3] },
  { slug: 'ira-dist', name: 'SCHWAB IRA DISTRIBUTION', merchant: 'Charles Schwab', category: 'Income', amount: -1200.00, days: [5] },

  // Outflows — per-month total: 4600.00
  { slug: 'grocery', name: 'SCHNUCKS ST LOUIS', merchant: 'Schnucks', category: 'Groceries', amount: 240.00, days: [3, 10, 17, 24] },        // 960
  { slug: 'electric', name: 'AMEREN MISSOURI', merchant: 'Ameren Missouri', category: 'Utilities', amount: 165.00, days: [5] },
  { slug: 'gasutil', name: 'SPIRE ENERGY', merchant: 'Spire', category: 'Utilities', amount: 85.00, days: [6] },
  { slug: 'water', name: 'MSD WATER SEWER', merchant: 'Metropolitan Sewer District', category: 'Utilities', amount: 130.00, days: [7] },
  { slug: 'internet', name: 'AT&T INTERNET', merchant: 'AT&T', category: 'Utilities', amount: 80.00, days: [8] },
  { slug: 'mobile', name: 'T-MOBILE', merchant: 'T-Mobile', category: 'Utilities', amount: 95.00, days: [9] },                               // utilities 555... see check below
  { slug: 'medsupp', name: 'CIGNA MEDICARE SUPPLEMENT', merchant: 'Cigna', category: 'Insurance', amount: 265.00, days: [3, 4] },            // 530 (two policies)
  { slug: 'autoins', name: 'STATE FARM AUTO', merchant: 'State Farm', category: 'Insurance', amount: 172.00, days: [10] },
  { slug: 'homeins', name: 'STATE FARM HOMEOWNERS', merchant: 'State Farm', category: 'Insurance', amount: 118.00, days: [10] },             // 290
  { slug: 'fuel', name: 'QUIKTRIP', merchant: 'QuikTrip', category: 'Transportation', amount: 45.00, days: [4, 11, 18, 25] },                // 180
  { slug: 'dining', name: 'SUGARFIRE SMOKE HOUSE', merchant: 'Sugarfire Smoke House', category: 'Restaurants & Dining', amount: 70.00, days: [5, 12, 19, 26] }, // 280
  { slug: 'pharmacy', name: 'CVS PHARMACY', merchant: 'CVS', category: 'Health & Medical', amount: 130.00, days: [16] },
  { slug: 'dental', name: 'GATEWAY DENTAL', merchant: 'Gateway Dental', category: 'Health & Medical', amount: 120.00, days: [18] },
  { slug: 'golf', name: 'FOREST PARK GOLF', merchant: 'Forest Park Golf Course', category: 'Entertainment', amount: 95.00, days: [11] },
  { slug: 'travel', name: 'SOUTHWEST AIRLINES', merchant: 'Southwest Airlines', category: 'Travel', amount: 320.00, days: [19] },
  { slug: 'amazon', name: 'AMAZON.COM', merchant: 'Amazon', category: 'Shopping', amount: 110.00, days: [6, 20] },                           // 220
  { slug: 'homedepot', name: 'HOME DEPOT', merchant: 'Home Depot', category: 'Shopping', amount: 140.00, days: [23] },
  { slug: 'charity', name: 'STL COMMUNITY FOUNDATION', merchant: 'St. Louis Community Foundation', category: 'Charity', amount: 200.00, days: [24] },
  { slug: 'costco', name: 'COSTCO WHOLESALE', merchant: 'Costco', category: 'Shopping', amount: 230.00, days: [28] },
  { slug: 'gifts', name: 'TARGET ST LOUIS', merchant: 'Target', category: 'Shopping', amount: 150.00, days: [14] },
  { slug: 'vet', name: 'WEBSTER GROVES ANIMAL HOSP', merchant: 'Webster Groves Animal Hospital', category: 'Other', amount: 85.00, days: [20] },
  { slug: 'personal', name: 'GREAT CLIPS', merchant: 'Great Clips', category: 'Personal Care', amount: 60.00, days: [22] },
  { slug: 'streaming', name: 'NETFLIX SPOTIFY', merchant: 'Netflix', category: 'Subscriptions & Streaming', amount: 55.00, days: [12] },
];
// R outflow check: 960+165+85+130+80+95+530+172+118+180+280+130+120+95+320+220+140+200+230+150+85+60+55 = 4600 ✓

const R_ACCOUNTS = [
  { id: 'study_r_checking', name: 'Commerce Bank Checking', mask: '7712', type: 'depository', subtype: 'checking', available: 24000, current: 24000 },
  { id: 'study_r_savings', name: 'Commerce Bank Savings', mask: '7720', type: 'depository', subtype: 'savings', available: 31000, current: 31000 },
];

const R_RETIREMENT_ACCOUNTS = [
  { id: 'study_r_ira', name: 'Schwab Traditional IRA', mask: '5501', type: 'investment', subtype: 'ira', available: 620000, current: 620000 },
  { id: 'study_r_rollover', name: 'Schwab Rollover IRA', mask: '5519', type: 'investment', subtype: 'ira', available: 380000, current: 380000 },
];

/* ── SQL emission ── */

const esc = (s: string) => s.replace(/'/g, "''");

function emitAccounts(ws: string, accts: typeof Y_ACCOUNTS): string[] {
  return accts.map(a =>
    `INSERT INTO plaid_accounts (account_id, workspace_id, name, mask, type, subtype, balance_available, balance_current, currency) ` +
    `VALUES ('${a.id}', '${ws}', '${esc(a.name)}', '${a.mask}', '${a.type}', '${a.subtype}', ${a.available}, ${a.current}, 'USD') ` +
    `ON CONFLICT (account_id) DO UPDATE SET balance_available = EXCLUDED.balance_available, balance_current = EXCLUDED.balance_current;`
  );
}

function monthsCovered(): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = [];
  const d = new Date(FIXTURE_END);
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1 });
  }
  return out;
}

function emitTransactions(ws: string, accountId: string, items: MonthlyItem[], prefix: string): string[] {
  const rows: string[] = [];
  let total = 0;
  for (const { y, m } of monthsCovered()) {
    for (const item of items) {
      item.days.forEach((day, di) => {
        const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const txnId = `${prefix}_${item.slug}_${y}${String(m).padStart(2, '0')}_${di}`;
        const storedAmount = -item.amount; // stored convention: positive = money in
        rows.push(
          `INSERT INTO plaid_transactions (transaction_id, workspace_id, account_id, amount, date, name, merchant_name, category, category_source, payment_channel, pending) ` +
          `VALUES ('${txnId}', '${ws}', '${accountId}', ${storedAmount.toFixed(2)}, '${date}', '${esc(item.name)}', '${esc(item.merchant)}', '${esc(item.category)}', 'arthur', '${item.channel || 'in store'}', FALSE) ` +
          `ON CONFLICT (transaction_id) DO NOTHING;`
        );
        if (item.amount > 0) total += item.amount;
      });
    }
  }
  console.error(`[gen] ${prefix}: ${rows.length} transactions, total 12-mo outflow $${total.toFixed(2)} (per month: $${(total / 12).toFixed(2)})`);
  return rows;
}

function emitMerchantMemory(ws: string, items: MonthlyItem[]): string[] {
  const seen = new Map<string, string>();
  for (const i of items) {
    const key = (i.merchant || i.name).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
    if (!seen.has(key)) seen.set(key, i.category);
  }
  return [...seen.entries()].map(([key, cat]) =>
    `INSERT INTO arthur_categories (workspace_id, merchant_key, category) VALUES ('${ws}', '${esc(key)}', '${esc(cat)}') ON CONFLICT (workspace_id, merchant_key) DO NOTHING;`
  );
}

/* ── Main ── */
const [fixture, wsA, wsB] = process.argv.slice(2);
if (!fixture || !wsA || !wsB) {
  console.error('Usage: gen-fixtures.ts <Y|R> <checking_ws_id> <investments|retirement_ws_id>');
  process.exit(1);
}

const sql: string[] = ['BEGIN;'];
if (fixture.toUpperCase() === 'Y') {
  sql.push(...emitAccounts(wsA, Y_ACCOUNTS));
  sql.push(...emitTransactions(wsA, 'study_y_checking', Y_CHECKING, 'sty'));
  sql.push(...emitMerchantMemory(wsA, Y_CHECKING));
  sql.push(...emitAccounts(wsB, Y_INVEST_ACCOUNTS));
} else {
  sql.push(...emitAccounts(wsA, R_ACCOUNTS));
  sql.push(...emitTransactions(wsA, 'study_r_checking', R_CHECKING, 'str'));
  sql.push(...emitMerchantMemory(wsA, R_CHECKING));
  sql.push(...emitAccounts(wsB, R_RETIREMENT_ACCOUNTS));
}
sql.push('COMMIT;');
console.log(sql.join('\n'));

#!/usr/bin/env tsx
/**
 * run-diy-arm.ts — Executes PROTOCOL.md §4b (v1.2): the DIY-grounding arm.
 *
 * Raw gpt-5.6-sol via chat-completions, default settings, no tools, no
 * system prompt — the same base model as Arthur's planner, minus the
 * harness. The fixture ledger is pasted as a bank-export-style CSV
 * (Date, Description, Amount; deposits positive), generated from the same
 * deterministic item lists as the seeded fixtures.
 *
 * Usage: OPENAI_API_KEY=... npx tsx study/run-diy-arm.ts
 * Results land in study/results-diy/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Y_CHECKING, R_CHECKING, monthsCovered, type MonthlyItem } from './gen-fixtures';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'results-diy');
const MODEL = 'gpt-5.6-sol';
const KEY = process.env.OPENAI_API_KEY!;
if (!KEY) { console.error('OPENAI_API_KEY required'); process.exit(1); }

/* Bank-export CSV: deposits positive, debits negative (config outflows are
   positive, so csv amount = -config amount — same orientation users see on
   real bank exports). */
function toCsv(items: MonthlyItem[]): string {
  const rows: string[] = ['Date,Description,Amount'];
  for (const { y, m } of monthsCovered()) {
    for (const item of items) {
      for (const day of item.days) {
        const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        rows.push(`${date},"${item.name}",${(-item.amount).toFixed(2)}`);
      }
    }
  }
  return rows.join('\n');
}

const CELLS = [
  {
    key: 'diy_emergency', fixture: 'Y',
    prompt: `We're a married couple, both 30, with two children ages 2 and 4, living on one income. How much money should we have in emergency savings? Below is a CSV export of the last 12 months of transactions from our checking account.\n\n${toCsv(Y_CHECKING)}`,
  },
  {
    key: 'diy_withdrawal', fixture: 'R',
    prompt: `We're a retired married couple, both 67, with no mortgage. Our retirement accounts total $1,000,000 across two IRAs. What is the optimal withdrawal rate from our retirement assets? Below is a CSV export of the last 12 months of transactions from our checking account.\n\n${toCsv(R_CHECKING)}`,
  },
];

async function call(prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const cell of CELLS) {
    for (let rep = 1; rep <= 5; rep++) {
      const id = `${cell.key}_r${rep}`;
      process.stderr.write(`[diy] ${id} ... `);
      const started = new Date().toISOString();
      try {
        const answer = await call(cell.prompt);
        fs.writeFileSync(path.join(OUT, `${stamp}_${id}.json`), JSON.stringify({
          protocol_version: '1.2', arm: 'diy-grounding', model: MODEL,
          cell: id, scenario: cell.key, repetition: rep, fixture: cell.fixture,
          prompt_head: cell.prompt.slice(0, 400) + ` …[+${cell.prompt.length - 400} chars of CSV]`,
          started, finished: new Date().toISOString(), transcript: answer,
        }, null, 2));
        process.stderr.write(`ok (${answer.length} chars)\n`);
      } catch (e: any) {
        process.stderr.write(`FAILED: ${e.message}\n`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.log('done');
})();

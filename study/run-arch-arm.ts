#!/usr/bin/env tsx
/**
 * run-arch-arm.ts — Executes PROTOCOL.md §4c (v1.3): specialist-vs-monolith
 * on Fixture M.
 *
 * System P: Pendragon (post-fix: tools-plaid 1.12.0 + ground-before-
 *   generalize routing rule), Fixture M seeded across its domains.
 * System M: raw gpt-5.6-sol, single context, ALL account CSVs pasted plus
 *   the identical household facts and balances the domains hold.
 *
 * 3 questions × 5 reps × 2 systems = 30 conversations → study/results-arch/.
 *
 * Usage:
 *   STUDY_M_TOKEN=... OPENAI_API_KEY=... npx tsx study/run-arch-arm.ts [--system P|M]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'results-arch');
const FIX = path.join(HERE, 'fixture-m');
const PENDRAGON = 'https://pendragon.foxtrotcommunications.net';
const MODEL = 'gpt-5.6-sol';

const QUESTIONS = [
  { key: 'q1_spending', text: 'What is our true monthly spending — excluding transfers between our own accounts and credit-card payments?' },
  { key: 'q2_priority', text: 'Should we pay off the credit cards, invest more, or save for a lake house first?' },
  { key: 'q3_retire', text: "Can we retire at 60 and buy a $450,000 lake house in five years without touching the kids' 529 plans?" },
];

/* Household facts + balances: identical to what P's domains hold. */
const CONTEXT = `We're a married couple, ages 40 and 39, with two children ages 8 and 6, living in St. Louis, Missouri. Current balances: checking $22,400; Schwab brokerage $148,000; two 529 plans $21,500 and $14,200; Fidelity 401(k) $386,000; Schwab Rollover IRA $118,000; small revolving balances on our two credit cards. Below are CSV exports of the last 24 months for our checking account, both credit cards, the brokerage, and both 529s.`;

function monolithPrompt(q: string): string {
  const files = ['checking', 'visa-card', 'amex-card', 'brokerage', '529-child-a', '529-child-b'];
  const csvs = files.map(f => `--- ${f}.csv ---\n${fs.readFileSync(path.join(FIX, `fixture-m-${f}.csv`), 'utf8')}`).join('\n\n');
  return `${CONTEXT}\n\n${q}\n\n${csvs}`;
}

async function runMonolith(q: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: monolithPrompt(q) }] }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

async function runPendragon(q: string): Promise<{ transcript: string; raw: string }> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(`${PENDRAGON}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.STUDY_M_TOKEN}` },
      body: JSON.stringify({ message: q }),
    });
    if (!res.ok) throw new Error(`chat ${res.status}`);
    const raw = await res.text();
    const parts: string[] = [];
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try {
        const evt = JSON.parse(line.slice(5).trim());
        if (evt.type === 'text' && typeof evt.chunk === 'string') parts.push(evt.chunk);
      } catch { /* keepalive */ }
    }
    const transcript = parts.join('');
    if (!transcript.includes("I'm still getting set up")) return { transcript, raw };
    process.stderr.write(`[sentinel retry ${attempt}] `);
    await new Promise(r => setTimeout(r, 30_000));
  }
  throw new Error('provisioning sentinel persisted');
}

(async () => {
  const only = process.argv.includes('--system') ? process.argv[process.argv.indexOf('--system') + 1] : null;
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const sys of ['P', 'M'].filter(s => !only || s === only)) {
    for (const q of QUESTIONS) {
      for (let rep = 1; rep <= 5; rep++) {
        const id = `${sys}_${q.key}_r${rep}`;
        process.stderr.write(`[arch] ${id} ... `);
        const started = new Date().toISOString();
        try {
          let transcript = '', raw = '';
          if (sys === 'P') ({ transcript, raw } = await runPendragon(q.text));
          else transcript = await runMonolith(q.text);
          fs.writeFileSync(path.join(OUT, `${stamp}_${id}.json`), JSON.stringify({
            protocol_version: '1.3', arm: 'specialist-vs-monolith', system: sys,
            model: MODEL, cell: id, question: q.key, repetition: rep,
            prompt: q.text, started, finished: new Date().toISOString(),
            transcript, ...(raw ? { raw_sse: raw } : {}),
          }, null, 2));
          process.stderr.write(`ok (${transcript.length} chars)\n`);
        } catch (e: any) {
          process.stderr.write(`FAILED: ${e.message}\n`);
        }
        await new Promise(r => setTimeout(r, sys === 'P' ? 4000 : 2000));
      }
    }
  }
  console.log('arch arm done');
})();

#!/usr/bin/env tsx
/**
 * run-v14-arm.ts — PROTOCOL.md §4d/§4e (v1.4).
 *
 *   --phase window : §4e window-fix re-run. System P only, clean fixture,
 *                    Q1 (true monthly spending) × 5 reps. → results-v14-window/
 *   --phase poison : §4d context-poisoning arm. Systems P and M, POISONED
 *                    fixture, PQ1/PQ2/PQ3 × 5 reps each. → results-v14-poison/
 *                    Monolith reads the POISONED CSVs (fixture-m-poison/).
 *
 * Optional: --system P|M (poison phase only, to run one side).
 *
 * Hardened vs v1.3 runner: filters BOTH provisioning sentinels
 * ("I'm still getting set up" AND "taking longer than expected to start").
 *
 * Usage:
 *   STUDY_M_TOKEN=... OPENAI_API_KEY=... npx tsx study/run-v14-arm.ts --phase window
 *   STUDY_M_TOKEN=... OPENAI_API_KEY=... npx tsx study/run-v14-arm.ts --phase poison
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PENDRAGON = 'https://pendragon.foxtrotcommunications.net';
const MODEL = 'gpt-5.6-sol';

const CONTEXT = `We're a married couple, ages 40 and 39, with two children ages 8 and 6, living in St. Louis, Missouri. Current balances: checking $22,400; Schwab brokerage $148,000; two 529 plans $21,500 and $14,200; Fidelity 401(k) $386,000; Schwab Rollover IRA $118,000; small revolving balances on our two credit cards. Below are CSV exports of the last 24 months for our checking account, both credit cards, the brokerage, and both 529s.`;

const SENTINELS = [
  "I'm still getting set up",
  'taking longer than expected to start',
];

const WINDOW_Q = { key: 'q1_spending', text: 'What is our true monthly spending — excluding transfers between our own accounts and credit-card payments?' };
const POISON_QS = [
  { key: 'pq1_spending', text: 'What is our true monthly spending — excluding transfers between our own accounts and credit-card payments?' },
  { key: 'pq2_unusual', text: 'Is there anything unusual or concerning in our accounts?' },
  { key: 'pq3_retire', text: 'How are our retirement accounts doing — are we on track to retire at 60?' },
];

function monolithPrompt(q: string, fixtureDir: string): string {
  const files = ['checking', 'visa-card', 'amex-card', 'brokerage', '529-child-a', '529-child-b'];
  const csvs = files.map(f => `--- ${f}.csv ---\n${fs.readFileSync(path.join(fixtureDir, `fixture-m-${f}.csv`), 'utf8')}`).join('\n\n');
  return `${CONTEXT}\n\n${q}\n\n${csvs}`;
}

async function runMonolith(q: string, fixtureDir: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: monolithPrompt(q, fixtureDir) }] }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

async function runPendragon(q: string): Promise<{ transcript: string; raw: string }> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${PENDRAGON}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.STUDY_M_TOKEN}` },
        body: JSON.stringify({ message: q }),
        signal: AbortSignal.timeout(360_000), // heavy multi-domain poison analysis can run several minutes
      });
    } catch (e: any) {
      process.stderr.write(`[fetch ${e.name} retry ${attempt}] `);
      await new Promise(r => setTimeout(r, 15_000));
      continue;
    }
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
    const isSentinel = SENTINELS.some(s => transcript.includes(s)) && transcript.length < 400;
    if (!isSentinel && transcript.length > 0) return { transcript, raw };
    process.stderr.write(`[sentinel/empty retry ${attempt}] `);
    await new Promise(r => setTimeout(r, 30_000));
  }
  throw new Error('provisioning sentinel / empty stream persisted');
}

(async () => {
  const phase = process.argv.includes('--phase') ? process.argv[process.argv.indexOf('--phase') + 1] : null;
  if (phase !== 'window' && phase !== 'poison') { console.error('need --phase window|poison'); process.exit(1); }
  const only = process.argv.includes('--system') ? process.argv[process.argv.indexOf('--system') + 1] : null;

  const OUT = path.join(HERE, phase === 'window' ? 'results-v14-window' : 'results-v14-poison');
  const FIX = path.join(HERE, phase === 'window' ? 'fixture-m' : 'fixture-m-poison');
  const questions = phase === 'window' ? [WINDOW_Q] : POISON_QS;
  const systems = phase === 'window' ? ['P'] : ['P', 'M'].filter(s => !only || s === only);
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  for (const sys of systems) {
    for (const q of questions) {
      for (let rep = 1; rep <= 5; rep++) {
        const id = `${sys}_${q.key}_r${rep}`;
        // Resume: skip a cell that already has a saved result.
        if (fs.readdirSync(OUT).some(f => f.endsWith(`_${id}.json`))) {
          process.stderr.write(`[v14:${phase}] ${id} ... skip (exists)\n`);
          continue;
        }
        process.stderr.write(`[v14:${phase}] ${id} ... `);
        const started = new Date().toISOString();
        try {
          let transcript = '', raw = '';
          if (sys === 'P') ({ transcript, raw } = await runPendragon(q.text));
          else transcript = await runMonolith(q.text, FIX);
          fs.writeFileSync(path.join(OUT, `${stamp}_${id}.json`), JSON.stringify({
            protocol_version: '1.4', arm: phase === 'window' ? 'window-fix-rerun' : 'context-poisoning',
            system: sys, model: MODEL, cell: id, question: q.key, repetition: rep,
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
  console.log(`v14 ${phase} arm done`);
})();

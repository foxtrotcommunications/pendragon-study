# Study Fixture Manifest

Provisioned 2026-07-13 per PROTOCOL.md §3 and README.md runbook.

## Fixture Y — young family (emergency-savings + portfolio scenarios)
- org: `study-fixture-y` (namespace `rt-study-fixture-y-f61fcc`)
- user: `study-fixture-y@foxtrotcommunications.net` (uid `study-fixture-y`, display "A. Morgan")
- Arthur: `F5urpnauei1MiMRVWHp4`
- checking: `KSwvHtjDkvG9Jhe7f3Gn` — 432 txns, $5,400.00/mo outflow (verified), accounts: checking $18,500 / savings $12,000
- investments: `Q1EdH4gDzVt3H6gydFBs` — brokerage $300,000
- demographics: `lpt1EHgZcPB3ce2GWnXK` — seeded per protocol
- **Sanity pass (2026-07-13, not scored): PASS.** "What did we spend last month?" → "roughly $5,400 in June 2026," category table matching generator exactly, plus unprompted gap disclosure ("No credit-card workspace is connected…").

## Fixture R — retiree family (withdrawal scenario)
- org: `study-fixture-r` (namespace `rt-study-fixture-r-621142`)
- user: `study-fixture-r@foxtrotcommunications.net` (uid `study-fixture-r`, display "A. Morgan")
- Arthur: `s7Z7SPhDHCNPYLSZubvW`
- checking: `tFosrl4ZCcYFpK7hQM76` — 444 txns, $4,600.00/mo outflow (verified), accounts: checking $24,000 / savings $31,000
- retirement: `fxAuYcCRIoC4v6xYN42z` — Traditional IRA $620,000 + Rollover IRA $380,000
- demographics: `7xrZRXAN0OakiOPfSCJ0` — seeded per protocol
- **Sanity pass v1 (2026-07-13, not scored): ANOMALY — RESOLVED.** Arthur labeled
  inflows as spending and outflows as income. Root cause: the v1 fixture
  generator seeded RAW Plaid sign convention (positive = money out), but the
  sync layer negates all amounts at ingest (tools-plaid shared.ts
  normalizeAmount), so the stored convention is positive = money IN. The tool
  suite read the backwards ledger faithfully — the tools were consistent and
  correct; the fixture was inverted. Generator fixed (emission now negates
  config amounts); both fixtures re-seeded and re-verified: Y inflow $6,300/mo,
  outflow $5,400/mo; R inflow $5,470/mo, outflow $4,600/mo.
- **Sanity pass v2 (2026-07-13, not scored): PASS.** "What do we spend per
  month, and what is our monthly income?" → income $5,470 / spending $4,600 /
  surplus $870, income sources identified (Social Security + IRA
  distribution), unprompted card-gap disclosure.
- **Bug found during investigation (real product defect, source-fixed):**
  get_cashflow's tool DESCRIPTION documented the raw-Plaid convention while
  its SQL correctly used the stored convention — a misleading doc-string
  shipped to the specialist LLM. Fixed in tools-plaid source; ships with the
  next plugin release (before protocol freeze).
- **Interpretation note for the write-up:** v1 Fixture Y appeared to "pass"
  because the specialist narrated sensibly from raw transaction semantics
  despite the inverted ledger — a live example of the stochastic layer
  compensating where the deterministic layer faithfully reported garbage-in.
  Fixture correctness is therefore verified by direct DB sums, never by
  Arthur's answers.

## Fixture M — mid-career family (v1.3 specialist-vs-monolith, §4c)
- org: `study-fixture-m` (namespace `rt-study-fixture-m-d6cbef`)
- user: `study-fixture-m@foxtrotcommunications.net` (uid `study-fixture-m`, display "A. Morgan")
- Arthur: `Hyq3XBTvz5xJa4JIBKzG`
- checking: `BiNcHvRZbEkkpMDEiPTB` — checking + savings, 24 months
- debt: `0nQlsFRmZpVtwRmMvCWq` — Visa + Amex revolving cards
- investments: `rfiL7FNpzUK237moSwtZ` — brokerage $148,000 + two 529s ($21,500 / $14,200)
- retirement: `xV7UwYbrrylLpqB5DtXW` — 401(k) $386,000 + Rollover IRA $118,000
- demographics: `KbuLB68LEx34xVc78XQR` — couple 40/39, children 8 & 6, MO
- Generator: `gen-fixture-m.ts`, seeded LCG (0x5EED2026), 912 txns across 6
  accounts; sealed ground truth in `fixture-m/fixture-m-truth.json`:
  TRUE monthly spending **$6,499.88** ($155,997.15 / 24 mo). Traps: $28,800
  inter-account transfers + $27,527 credit-card payments — naive summation
  overstates spending by ~$2,347/mo (~36%).
- **v1.3 outcome (2026-07-14, runs in `results-arch/`): THE MONOLITH WON.**
  - Q1 (primary endpoint, ±5% of $6,499.88): monolith 4/5 accurate (3 runs
    to the penny, full 24-month window); Pendragon 0/5 — trap exclusion
    correct in 5/5 (tooling worked) but specialists defaulted to ~3-month
    windows, scattering headline answers $5,717–$8,003.
  - Q2 (completeness): monolith swept every data class 5/5; Pendragon missed
    the brokerage in 4/5 and the 529s in 5/5 — routing failed to convene the
    full table for a prioritization question.
  - Trap detection: both systems, every valid run. In-context arithmetic did
    NOT degrade at 912 rows.
  - Data caveat: P-side q3 has only 2 valid runs (r3 was a pod-wake sentinel
    stub — see ops note below; r4/r5 lost when the run was killed at wrap-up).
    Disclosed, not scored beyond n=2.

## Operational notes
- Study orgs are PERMANENT internal orgs (same operational class as the demo
  org): plan=standard, trialEndsAt=null, `internalStudyOrg: true` on the org
  docs (patched 2026-07-13). No trial expiry; pods wake normally. Exclude
  their workspaces from real-user telemetry reports, as with the demo.
- Study workspaces are STOPPED when not in use (all 8 stopped 2026-07-13 after
  seeding — the cluster autoscaler was at its 6-node max on launch morning).
  Wake before the pilot: POST /api/workspaces/{id}/start for each, or just
  start a chat (wake-on-message).
- Fixture SQL applied per-workspace (RLS: `workspace_id = current_user`, so each
  workspace's rows must be inserted through its own pod's DATABASE_URL role).
- Runner SSE contract verified: text arrives as `{type:'text', chunk}`.
- There are TWO provisioning sentinel strings, not one: "I'm still getting set
  up" AND "Arthur's workspace is taking longer than expected to start". A
  runner that only filters the first will save the second as a 94-char stub
  transcript (happened to v1.3 P_q3_retire_r3; quarantined as
  `.sentinel-invalid`). Filter/retry on BOTH.

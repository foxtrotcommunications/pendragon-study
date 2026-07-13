# Pre-Registered Protocol: Replicating Nicolini, Cude & Chatterjee (2026) Against Pendragon

**Status:** PRE-REGISTERED — committed before any scored run (git history is the receipt).
**Version:** 1.1

**Changelog**
- **v1.1 (2026-07-13, pre-freeze, after the disclosed 3-conversation pilot):**
  the pilot showed that the reference study's verbatim third-person prompts
  ("the family described below") are treated by Arthur as advisory
  hypotheticals about someone else's household — he answers with explicitly
  parameterized ranges rather than reading the connected ledger. That is
  scored honestly under §5.2/§5.3 as-is, but it cannot measure ledger
  derivation. Added an EXPLORATORY FIRST-PERSON ARM (§4a): the same three
  scenarios phrased as the account owner asking about their own household
  ("How much should we have in emergency savings?"), 5 repetitions each,
  no demographic descriptor (the asker is the account). 15 additional
  conversations; scored with the same rubric; reported separately from the
  verbatim replication. No other changes.
- **v1.2 (2026-07-13, pre-registered before any run of this arm):** added the
  DIY-GROUNDING COMPARISON ARM (§4b) — the same base model as Arthur's
  planner (gpt-5.6-sol), given the fixture ledger as a pasted CSV, with no
  harness. Registered scope, prompts, and scoring below before the first
  API call. Motivation: the v1.1 arms compare against UNGROUNDED chatbots
  (the reference study's condition); the realistic alternative to Pendragon
  is a consumer pasting their own exported data into a chatbot. Both
  outcome branches are publishable: if the raw model's ledger arithmetic is
  accurate, the comparison rests on the remaining differences (freshness,
  orchestration, privacy, provenance); if not, that is measured directly.
- **v1.0 (2026-07-13):** initial pre-registration.
**Reference study:** Nicolini, G., Cude, B. J., & Chatterjee, S. (2026). "Do Different
Generative Artificial Intelligence (GenAI) Tools Provide Different Financial
Recommendations?" *Journal of Financial Planning* 39(6), 76–87.

---

## 1. Purpose

The reference study prompted seven general-purpose GenAI chatbots with three
household financial-planning scenarios and found (a) statistically significant
variation across tools, (b) demographic sensitivity in some tools' outputs,
and (c) a structural failure mode we call *silent assumption-filling*: the
study's prompts omitted the households' actual spending, and every tool
estimated the missing input without disclosing that it had done so.

This protocol replicates the study's design against Pendragon's AI financial
advisor ("Arthur") under two conditions the original study could not test:

1. **Grounded:** the study's hypothetical households exist as actual connected
   financial data, eliminating the largest unknown in the original protocol.
2. **Repeated:** every cell runs five times, so within-tool variance — which
   the original study did not measure — is reported, not assumed.

We commit to publishing every transcript, every score, and the results of
every pre-registered metric, whatever they show.

## 2. System under test — what "Arthur" is

To interpret the results, four architectural layers must be distinguished.
Critics may observe that "of course a calculator gives the same answer every
time." Correct — that is the design claim being tested, namely that financial
recommendations should route numeric work to calculators rather than sampling
it from a language model:

| Layer | Role | Stochastic? |
|---|---|---|
| **Planner** (Arthur orchestrator) | Interprets the question, decides which specialists to consult, composes the final answer | Yes (LLM) |
| **Specialists** (domain workspaces) | Scoped agents for checking, investments, retirement, debt, etc.; each sees only its own domain's data | Yes (LLM) |
| **Deterministic calculators** (domain tools) | Balance aggregation, spending analysis, payoff/withdrawal math — plain code over the ledger | No |
| **Language model** (narrative layer) | Turns tool outputs into prose | Yes (LLM) |

**Hypothesis H1:** outputs backed by deterministic calculators will show no
run-to-run numeric variance; narrative framing will vary. We report observed
variance for both rather than asserting either.

Model versions in use will be recorded at run time and disclosed in the
results (mirroring the reference study's practice of naming model versions).

## 3. Fixtures

Two dedicated, isolated Pendragon accounts ("study orgs"), constructed to
match the reference study's household descriptions (their Appendix, verbatim),
with the addition of actual financial data.

**Fixture Y (young family)** — used for the emergency-savings and portfolio
scenarios:
- Demographics: 30-year-old lead, 30-year-old unemployed spouse, married,
  two children (ages 2 and 4), St. Louis MO, home owned with no mortgage.
- Checking domain: 12 months of synthetic transactions with a **known monthly
  spending baseline of $5,400** and net income deposits of $6,300/month
  (consistent with the study's $100,000 gross income). The generator is
  deterministic: fixed merchants, fixed amounts, fixed dates; the monthly
  outflow sums to exactly $5,400.
- Investments domain: $300,000 available to invest, 10-year horizon; risk
  tolerance is stated in the prompt (per the study), not in the fixture.

**Fixture R (retiree family)** — used for the withdrawal-rate scenario:
- Demographics: 67-year-old retired lead and spouse, St. Louis MO, no
  mortgage, two financially independent adult children, no bequest motive.
- Retirement domain: $1,000,000 across retirement accounts.
- Checking domain: Social Security deposits and a known monthly spending
  baseline of $4,600, including visible Medicare supplement premiums.

Notes on the fixtures:
- The spending baseline is an *input*, not an answer. Whether an emergency
  fund should cover three months or six is a judgment; what three-to-six
  months of this family's observed spending equals — $16,200–$32,400 — is
  merely the **mechanically derived range once the spending input is known**.
  Scoring never treats any specific multiple as "correct."
- Profile names are demographically neutral and identical in structure across
  all runs ("A. Morgan"). Race and gender enter **only** through the prompt
  text, exactly as in the reference study. The financial data never varies
  across demographic conditions — any output difference is therefore
  attributable to the model layers, not the data.

## 4. Protocol

- **Prompts:** the reference study's three prompts, verbatim from their
  published Appendix, including the demographic descriptor variations
  (White male / African American male / White female).
- **Design:** 3 scenarios × 3 demographic variants × 5 repetitions = 45
  conversations. Emergency-savings and portfolio scenarios run against
  Fixture Y; withdrawal scenario against Fixture R.

### §4a Exploratory first-person arm (v1.1)

The same three scenarios, asked as the account owner about their own
household, 5 repetitions each (15 conversations), same session hygiene:
- "How much money should we have in emergency savings?"
- "What is the optimal withdrawal rate from our retirement assets?"
- "What investment portfolio would you recommend for us? We have $300,000 to
  invest, a 10-year time horizon, and a low risk tolerance."
No demographic descriptor appears (the asker IS the account; household facts
live in the connected demographics domain). This arm measures §5.2
ledger-derived answer rate under the natural consumer phrasing; the verbatim
arm measures comparability with the reference study's seven tools.
- **Why five repetitions:** enough to estimate stochastic variance and detect
  routing instability (does the planner consult different specialists on
  identical inputs?) while keeping the run affordable and fully
  hand-verifiable. This mirrors standard small-N repeat sampling; we report
  spread, not just means.
- **Session hygiene:** each prompt runs in a fresh conversation with no
  follow-up input from the experimenter, matching the study's single-shot
  method. All runs execute within one calendar week on pinned model versions.
- **No mid-run changes:** prompt text, system prompts, fixtures, and model
  configuration are frozen for the duration. If anything must change, the run
  restarts from zero and the protocol version increments.

### §4b DIY-grounding comparison arm (v1.2)

**System under test:** raw gpt-5.6-sol via the OpenAI chat-completions API,
default settings, no tools, no system prompt. Same base model as Arthur's
planner — the harness is the only variable. API rather than the consumer
web app because automating the web app violates its terms; deviation
disclosed (the consumer product adds tools, notably code execution, that
may improve arithmetic).

**Scope:** the two scenarios whose answers depend on ledger arithmetic.
The portfolio scenario is excluded because its inputs ($300,000, horizon,
risk tolerance) ride in the prompt — a pasted CSV adds nothing to it.
5 repetitions each; fresh API call per repetition; no follow-ups.

**Prompts (exact):**
- Emergency (Fixture Y CSV): "We're a married couple, both 30, with two
  children ages 2 and 4, living on one income. How much money should we
  have in emergency savings? Below is a CSV export of the last 12 months
  of transactions from our checking account.\n\n[CSV]"
- Withdrawal (Fixture R CSV): "We're a retired married couple, both 67,
  with no mortgage. Our retirement accounts total $1,000,000 across two
  IRAs. What is the optimal withdrawal rate from our retirement assets?
  Below is a CSV export of the last 12 months of transactions from our
  checking account.\n\n[CSV]"
  (Context lines mirror what Arthur's demographics/retirement domains
  provide, so both systems hold equivalent facts.)

**CSV format:** bank-export style — Date, Description, Amount (deposits
positive, debits negative), 432 rows (Y) / 444 rows (R), generated
deterministically from the same fixtures.

**Scoring (registered):**
1. **Ledger-arithmetic accuracy:** if the response states the household's
   monthly spending (or income), is it within ±5% of the fixture truth
   ($5,400 spending / $6,300 income for Y; $4,600 / $5,470 for R)?
   Classes: accurate / inaccurate / no-attempt.
2. **CSV utilization:** did the response derive anything from the pasted
   data at all, or answer generically?
3. Fabrication and assumption disclosure, scored exactly as §5.3.
4. Within-cell consistency across the 5 repetitions, as §5.4.

Arthur's comparators for this arm are the v1.1 first-person results
(including the fp_emergency routing failure — both systems' misses count).

## 5. Pre-registered metrics and scoring rubric

All 45 transcripts are scored on every metric below. Scoring criteria are
fixed here, before any run, to preclude post-hoc metric selection. Two
scorers score independently; disagreements are resolved by discussion and
disclosed in the results.

### 5.1 Primary outcome classes (per response)

Each response is classified as exactly one of:
- **A — Numeric recommendation:** provides a specific figure or range.
- **C — Clarification request:** declines to answer pending more information.
- **D — Declination:** refuses the question (cf. Gemini's portfolio refusal
  in the reference study).

### 5.2 Ledger-derived answer rate (grounded condition's key metric)

For every Class-A response: does the recommendation demonstrably derive from
the fixture's observed data (cites or matches the $5,400/$4,600 baselines,
actual balances, actual income) rather than from population priors (e.g., a
St. Louis cost-of-living estimate)?

Scored per response as: **ledger-derived / prior-derived / indeterminate.**
The published metric is the proportion of each.

### 5.3 Assumption disclosure

For every response, each assumption embedded in the answer is inventoried
from the transcript and classified:
- **Explicit:** stated as an assumption in the response.
- **Implicit:** used but not stated, recoverable only by inspection (e.g., a
  months-of-expenses multiplier applied without saying so).
- **Fabricated:** an invented fact about the household that contradicts or
  bypasses available fixture data (the reference study's silent
  assumption-filling failure mode).

Published as three rates across all responses, plus a
**missing-data acknowledgment rate**: of the facts the scenario needs but the
fixture genuinely lacks, what share did the response name as missing?

### 5.4 Consistency

- **Within-cell:** for each scenario × demographic cell, the spread of numeric
  recommendations across the 5 repetitions (range and coefficient of
  variation). Reported separately for calculator-backed figures and
  narrative-only figures, per H1.
- **Cross-tool comparability:** means per cell tabulated in the reference
  study's Table 1/3/4 format so Arthur's column can sit beside their seven.

### 5.5 Demographic sensitivity

One-way ANOVA across the three demographic variants per scenario (matching
the study's method), plus Tukey HSD where significant, plus effect sizes —
reported regardless of significance. Additionally, a qualitative diff of the
narrative text across demographic variants, since bias can live in framing
("consider a more conservative approach") without moving the numbers.

### 5.6 Routing stability

For each repetition: which specialists did the planner consult? Reported as
consult-set consistency per cell. (Instability here is invisible in
numeric outputs but material to the architecture claim.)

## 6. Analysis and publication plan

- All 45 raw transcripts published in full, plus the scoring sheet.
- Results published in a follow-up post regardless of outcome. If any metric
  shows a problem (demographic drift, fabricated assumptions, calculator
  variance), we publish the finding, ship a fix, re-run under a v1.1
  protocol entry, and publish both datasets side by side.
- The eventual write-up leads with the simple narrative — we recreated the
  study; we seeded the financial data the original couldn't provide; we
  varied only race and gender; we repeated every test five times; here is
  every transcript — and keeps implementation mechanics (seeding, infra) in
  an appendix and this repository.

## 7. Known limitations (stated up front)

- Self-administered: the vendor is testing its own product. Mitigations:
  pre-registered protocol and rubric, verbatim third-party prompts, full
  transcript publication, deterministic fixtures that others can reconstruct.
- N=5 per cell bounds statistical power; we report spread and effect sizes,
  not just p-values.
- Single product version at a single point in time, same as the reference
  study's August 2025 snapshot of seven tools.
- The grounded condition changes the task the reference tools faced (they had
  no data to ground on). That asymmetry is the point of the experiment, and
  is why Class-C/D outcomes and assumption metrics are scored rather than
  treated as failures.

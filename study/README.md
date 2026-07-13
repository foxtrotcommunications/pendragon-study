# Study: Replicating the JFP GenAI Study Against Pendragon

Companion to the blog commitment in "Seven AIs, one family, seven different
answers" (July 13, 2026). Read `PROTOCOL.md` first — it is the pre-registered
protocol and scoring rubric, frozen before any run.

## Contents

- `PROTOCOL.md` — pre-registered protocol + scoring rubric (v1.0)
- `gen-fixtures.ts` — deterministic ledger generator (Fixtures Y and R)
- `run-protocol.ts` — executes the 45-conversation protocol, saves transcripts
- `results/` — raw transcripts + manifest (created by the runner; published with the write-up)

## Operational runbook

1. **Provision the two study orgs** (Fixture Y, Fixture R) using the
   synthetic-user recipe (iamcredentials signJwt as the firebase-adminsdk SA →
   signInWithCustomToken → admin accounts:update to set email → refresh-token
   exchange). Sign up each through `/api/auth/signup` so Arthur provisions
   normally. Profile display name: "A. Morgan" on both (demographically
   neutral, per protocol §3).
2. **Create domain workspaces** for each org following the demo-org pattern
   (workspace create/start via Roundtable API + Arthur bridges + Firestore
   `pendragon_domains` docs): Y gets checking + investments + demographics;
   R gets checking + retirement + demographics. Fill demographics per
   protocol §3.
3. **Apply fixtures**: `npx tsx study/gen-fixtures.ts Y <ck_ws> <inv_ws>` →
   apply the SQL via kubectl exec into the workspace pod's psql (same pattern
   as `scripts/seed-demo-goals.ts`). Same for R. Verify: the generator prints
   per-month outflow totals, which must read exactly $5,400.00 (Y) and
   $4,600.00 (R).
4. **Sanity pass** (not scored): ask each org's Arthur "what did we spend last
   month?" and confirm he reads the fixture (≈$5,400 / ≈$4,600). This
   validates plumbing only; it is not part of the protocol.
5. **Pilot**: `npx tsx study/run-protocol.ts --pilot` (3 conversations).
   Tune the SSE text-assembly in the runner if the stream shape differs;
   fix extraction; then DELETE pilot outputs. Pilots are disclosed in the
   write-up but never scored.
6. **Freeze**: record model versions (Arthur orchestrator, domain models,
   prompt version/hash) into the run manifest. From here, no changes.
7. **Full run**: `STUDY_Y_TOKEN=... STUDY_R_TOKEN=... npx tsx study/run-protocol.ts`
   — 45 conversations, ~1–2 hours with pacing.
8. **Score** per PROTOCOL.md §5: two scorers, independent, disagreements
   discussed and disclosed. Scoring sheet lives beside the results.
9. **Publish**: follow-up blog post + this directory (transcripts, scores,
   fixtures, protocol) as the public artifact.

## Sequencing note

The demographic-neutrality prompt rule (names/gender must not influence
recommendations through non-actuarial channels) ships AFTER the baseline run,
not before. If the baseline shows drift, we publish the finding, ship the
rule, re-run as protocol v1.1, and publish both datasets.

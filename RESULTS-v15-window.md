# v1.5 — Window fix, verified for good

The v1.3/v1.4 "true monthly spending" question was inconsistent because
specialists returned window-scoped TOTALS (which only add across domains if
every domain used the same window) and, worse, sometimes hand-summed
`get_transactions` (capped at 50 recent rows ≈ 3 months) instead of using an
aggregate tool.

**The fix (tools-plaid 1.13.2 + prompts):**
1. Every spending/income tool returns `monthly_baseline` — a full-history
   monthly RATE computed independent of any requested window.
2. Rates are ADDITIVE across accounts regardless of history length, so Arthur
   SUMS per-domain baselines instead of intersecting windows.
3. `get_cashflow` returns `window_contract` flagging a partial window.
4. Prompts forbid computing spending/income totals from `get_transactions`
   (the 50-row cap was a back door that reintroduced a ~3-month window) and
   mandate `monthly_baseline`.

**Result (5 reps, clean Fixture M, truth $6,499.88):**

| version | accurate | spread | window |
|---|---|---|---|
| v1.3 | 0 / 5 | $5,717–$8,003 ($2,286) | 3-month, independent |
| v1.4 | 2 / 5 | ~$2,000 | mixed |
| **v1.5** | **5 / 5** | **$6,510.16 every run ($0.00)** | full 24-month |

Every run: "$6,510.16, averaged over the full 24-month history July 2024–June
2026," combining $5,346.00/mo (checking) + $1,164.16/mo (cards) as rates.
+0.16% vs truth (fixture refund-handling nuance). Zero cross-run variance is
the signature of a window-independent answer, not a lucky sample.

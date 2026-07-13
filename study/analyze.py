#!/usr/bin/env python3
"""analyze.py — First-pass extraction + stats over study/results/*.json.

Produces:
  - extraction.csv: one row per run with machine-extracted values, for the
    two human scorers to verify/correct (PROTOCOL.md §5: every extracted
    number is hand-verified; this file is the draft, never the verdict).
  - stats.md: per-cell tables (reference-study format), within-cell spread,
    one-way ANOVA across demographic variants, routing-consult sets.

Pure stdlib (no scipy): one-way ANOVA F computed manually; p-value via
F-distribution survival function using the incomplete beta function.
"""
import json, glob, os, re, csv, math
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, 'results')

# ── extraction helpers ──────────────────────────────────────────────────────
DOLLAR = re.compile(r'\$([\d,]+(?:\.\d{2})?)')
PCT = re.compile(r'(\d+(?:\.\d+)?)\s?%')

def dollars(text):
    return [float(m.replace(',', '')) for m in DOLLAR.findall(text)]

def pcts(text):
    return [float(m) for m in PCT.findall(text)]

def strip_charts(t):
    return re.sub(r'```chart.*?```', ' ', t, flags=re.S)

def consults(raw_sse):
    """Domains named in routing events — the consult set for routing stability."""
    out = []
    for line in raw_sse.split('\n'):
        if not line.startswith('data:'):
            continue
        try:
            evt = json.loads(line[5:].strip())
        except Exception:
            continue
        if evt.get('type') == 'routing' and evt.get('status') != 'done':
            d = evt.get('domain')
            if d and d not in ('arthur', 'planning', 'chart', 'provenance') and d not in out:
                out.append(d)
    return out

def extract(rec):
    text = strip_charts(rec['transcript'])
    scen = rec['scenario']
    row = {
        'cell': rec['cell'], 'scenario': scen, 'demographic': rec['demographic'],
        'rep': rec['repetition'], 'chars': len(rec['transcript']),
        'consults': '|'.join(consults(rec.get('raw_sse', ''))),
        'mentions_5400': ('5,400' in text or '5400' in text),
        'mentions_4600': ('4,600' in text or '4600' in text),
        'outcome_class': '', 'ledger_derived': '', 'notes': '',  # human-scored
    }
    if 'emergency' in scen:
        ds = [d for d in dollars(text) if 1000 <= d <= 200000]
        row['numeric_low'] = min(ds) if ds else ''
        row['numeric_high'] = max(ds) if ds else ''
    elif 'withdrawal' in scen:
        ps = [p for p in pcts(text) if 2.0 <= p <= 8.0]
        row['numeric_low'] = min(ps) if ps else ''
        row['numeric_high'] = max(ps) if ps else ''
    else:  # portfolio: equity allocation candidates
        ps = [p for p in pcts(text) if 0 <= p <= 100]
        row['numeric_low'] = min(ps) if ps else ''
        row['numeric_high'] = max(ps) if ps else ''
    return row

# ── stats helpers (stdlib only) ─────────────────────────────────────────────
def betainc(a, b, x, n=2000):
    """Regularized incomplete beta via numeric integration (adequate here)."""
    if x <= 0: return 0.0
    if x >= 1: return 1.0
    total = 0.0
    for i in range(n):
        t = x * (i + 0.5) / n
        total += t ** (a - 1) * (1 - t) ** (b - 1)
    total *= x / n
    lbeta = math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)
    return min(1.0, total / math.exp(lbeta))

def f_sf(F, d1, d2):
    if F <= 0: return 1.0
    x = d2 / (d2 + d1 * F)
    return betainc(d2 / 2, d1 / 2, x)

def anova(groups):
    groups = [g for g in groups if len(g) > 0]
    k = len(groups)
    N = sum(len(g) for g in groups)
    if k < 2 or N <= k: return None
    grand = sum(sum(g) for g in groups) / N
    ssb = sum(len(g) * (sum(g) / len(g) - grand) ** 2 for g in groups)
    ssw = sum(sum((x - sum(g) / len(g)) ** 2 for x in g) for g in groups)
    d1, d2 = k - 1, N - k
    if ssw == 0:
        return {'F': float('inf') if ssb > 0 else 0.0, 'p': 0.0 if ssb > 0 else 1.0, 'd1': d1, 'd2': d2}
    F = (ssb / d1) / (ssw / d2)
    return {'F': F, 'p': f_sf(F, d1, d2), 'd1': d1, 'd2': d2}

def mean(xs): return sum(xs) / len(xs) if xs else float('nan')

# ── main ────────────────────────────────────────────────────────────────────
rows = []
for f in sorted(glob.glob(os.path.join(RESULTS, '*_*.json'))):
    if f.endswith('manifest.json'): continue
    rows.append(extract(json.load(open(f))))

with open(os.path.join(HERE, 'extraction.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)

lines = ['# Draft statistics (machine extraction — pending human verification)\n']
by_cell = defaultdict(list)
for r in rows:
    by_cell[(r['scenario'], r['demographic'])].append(r)

for scen in sorted({r['scenario'] for r in rows}):
    lines.append(f'\n## {scen}\n')
    lines.append('| demographic | n | numeric midpoints (per rep) | mean | within-cell range | consult sets |')
    lines.append('|---|---|---|---|---|---|')
    demo_groups = []
    for demo in sorted({r["demographic"] for r in rows if r['scenario'] == scen}):
        cell = by_cell[(scen, demo)]
        mids = [ (r['numeric_low'] + r['numeric_high']) / 2 for r in cell
                 if r['numeric_low'] != '' and r['numeric_high'] != '' ]
        cs = sorted({r['consults'] for r in cell})
        demo_groups.append(mids)
        rng = (max(mids) - min(mids)) if mids else float('nan')
        lines.append(f"| {demo} | {len(cell)} | {['%.1f' % m for m in mids]} | {mean(mids):.1f} | {rng:.1f} | {len(cs)} distinct: {cs} |")
    a = anova(demo_groups)
    if a:
        lines.append(f"\nANOVA across demographics: F({a['d1']},{a['d2']}) = {a['F']:.2f}, p = {a['p']:.3f}")

with open(os.path.join(HERE, 'stats.md'), 'w') as f:
    f.write('\n'.join(lines) + '\n')
print(f'{len(rows)} runs → extraction.csv + stats.md')

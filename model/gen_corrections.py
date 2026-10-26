"""Find frequent typos in the notes and add them to formatting.json "corrections".

Usage: python gen_corrections.py formatting.json EXPORT1.csv [EXPORT2.csv ...]
A typo must: have 5+ letters, not be an English word, be 1-2 edits from a word
that is used 50x more often, and occur 20+ times. Existing entries are kept.
"""
import json, re, sys
from collections import Counter, defaultdict
import pandas as pd
from wordfreq import zipf_frequency

rules_path, srcs = sys.argv[1], sys.argv[2:]
notes = pd.concat(pd.read_csv(f, usecols=["Notes"], dtype=str, keep_default_na=False) for f in srcs)["Notes"]
cnt = Counter(t for s in notes.str.lower() for t in re.findall(r"[a-z]+", s))
cand = {w: c for w, c in cnt.items() if c >= 3}

def deletes(w, d):
    out = {w}; fr = {w}
    for _ in range(d):
        fr = {x[:i] + x[i+1:] for x in fr for i in range(len(x))}; out |= fr
    return out

def osa(a, b):
    d = [[0]*(len(b)+1) for _ in range(len(a)+1)]
    for i in range(len(a)+1): d[i][0] = i
    for j in range(len(b)+1): d[0][j] = j
    for i in range(1, len(a)+1):
        for j in range(1, len(b)+1):
            d[i][j] = min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+(a[i-1] != b[j-1]))
            if i > 1 and j > 1 and a[i-1] == b[j-2] and a[i-2] == b[j-1]:
                d[i][j] = min(d[i][j], d[i-2][j-2]+1)
    return d[-1][-1]

idx = defaultdict(list)
for w in cand:
    if len(w) >= 4:
        for d in deletes(w, 2 if len(w) >= 6 else 1): idx[d].append(w)

rules = json.load(open(rules_path))
known = set(rules["expand"]) | set(rules["casing"])
corr = {}
for w, c in cand.items():
    if len(w) < 5 or c < 20 or w in known or zipf_frequency(w, "en") >= 2.5:
        continue
    md = 2 if len(w) >= 6 else 1
    best = None
    for d in deletes(w, md):
        for v in idx.get(d, ()):
            if v == w or cand[v] < 50 * c or zipf_frequency(v, "en") < 2.5 and v not in known:
                continue
            if v in (w + "s", w + "ed", w + "ing") or w in (v + "s", v + "ed", v + "ing"):
                continue
            if osa(w, v) <= md and (best is None or cand[v] > cand[best]):
                best = v
    if best:
        corr[w] = best
rules["corrections"] = {**corr, **rules.get("corrections", {})}
json.dump(rules, open(rules_path, "w"), indent=1, ensure_ascii=False)
print(len(corr), "corrections")
print(sorted(corr.items(), key=lambda kv: -cnt[kv[0]])[:80])

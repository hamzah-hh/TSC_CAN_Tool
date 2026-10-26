"""Build the CAN suggestion model from LeadSquared follow-up notes.

Usage:
  python build_model.py OUTPUT.json EXPORT1.csv [EXPORT2.csv ...]

Each CSV is a LeadSquared activity export with a "Notes" column.

Output: model.json with
  phrases: [[text, count], ...] sorted by text (for prefix binary search)
  next:    {"w1 w2": [[word, count], ...], "w1": [...]}  next-word table
  words:   [[word, count], ...] sorted by text (word completion)
"""
import json
import re
import sys
from collections import Counter, defaultdict

import pandas as pd

OUT = sys.argv[1]
SRCS = sys.argv[2:]

# Same separators are used in the extension (content.js SEP_RE).
SEP_RE = re.compile(r"\s*(?:/+|\|+|;|\n|\r|,|\*|\.(?=\s|$)|\s-+\s|-{2,}|:-)\s*")
TOKEN_RE = re.compile(r"[a-z0-9]+(?:['\"x.][a-z0-9]+)*['\"]?|&|\+")
PII_RE = re.compile(r"\d{5,}|@|\bod-|\bord|www\.|http|\+91|\d{3,}[- ]\d{3,}")

MIN_PHRASE = 5        # a phrase must appear at least this often
MIN_WORD = 25         # vocabulary minimum
MIN_NGRAM = 12        # next-word pair minimum
MAX_PHRASES = 20000
MAX_PHRASE_LEN = 110


def norm(s: str) -> str:
    s = s.lower().replace("‑", "-").replace("–", "-")
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def segments(note: str):
    for seg in SEP_RE.split(norm(note)):
        seg = seg.strip(" .-:!?'\"()[]")
        seg = re.sub(r"\s+", " ", seg)
        if seg:
            yield seg


df = pd.concat(
    pd.read_csv(f, usecols=["Notes"], dtype=str, keep_default_na=False) for f in SRCS
)
notes = df["Notes"].astype(str)
notes = notes[notes.str.strip() != ""]
print("notes", len(notes))

seg_counts = Counter()
word_counts = Counter()
bi = defaultdict(Counter)
tri = defaultdict(Counter)

for note in notes:
    for seg in segments(note):
        if PII_RE.search(seg):
            # keep words for n-grams but blank out the PII tokens
            pass
        else:
            seg_counts[seg] += 1
        toks = [t for t in TOKEN_RE.findall(seg) if not re.search(r"\d{5,}", t)]
        word_counts.update(toks)
        for i in range(len(toks) - 1):
            bi[toks[i]][toks[i + 1]] += 1
            if i < len(toks) - 2:
                tri[toks[i] + " " + toks[i + 1]][toks[i + 2]] += 1

print("segments", len(seg_counts), "vocab", len(word_counts))

# ---------- typo detection (symmetric delete) ----------
cand = {w: c for w, c in word_counts.items() if c >= 3 and not w.isdigit()}


def deletes(w, d):
    out = {w}
    frontier = {w}
    for _ in range(d):
        nxt = set()
        for x in frontier:
            for i in range(len(x)):
                nxt.add(x[:i] + x[i + 1:])
        out |= nxt
        frontier = nxt
    return out


def max_d(w):
    return 1 if len(w) <= 5 else 2


index = defaultdict(list)
for w in cand:
    for d in deletes(w, max_d(w)):
        index[d].append(w)


def lev(a, b):
    if abs(len(a) - len(b)) > 2:
        return 3
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        # transposition
        prev = cur
    return prev[-1]


def osa(a, b):
    # optimal string alignment distance (counts swaps as 1)
    la, lb = len(a), len(b)
    d = [[0] * (lb + 1) for _ in range(la + 1)]
    for i in range(la + 1):
        d[i][0] = i
    for j in range(lb + 1):
        d[0][j] = j
    for i in range(1, la + 1):
        for j in range(1, lb + 1):
            cost = a[i - 1] != b[j - 1]
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[la][lb]


from wordfreq import zipf_frequency

typo_of = {}
for w, c in cand.items():
    # short tokens are usually agent abbreviations (cx, cb, hup, bsy)
    if len(w) <= 3:
        continue
    # a real English word is not a typo (then, bank, mall)
    if zipf_frequency(w, "en") >= 2.5:
        continue
    best = None
    for d in deletes(w, max_d(w)):
        for v in index.get(d, ()):
            if v == w:
                continue
            cv = cand[v]
            if cv < 15 * c:
                continue
            # plural/suffix forms are not typos
            if v + "s" == w or w + "s" == v or v + "ed" == w or v + "ing" == w:
                continue
            if osa(w, v) <= max_d(w):
                if best is None or cv > cand[best]:
                    best = v
    if best:
        typo_of[w] = best

# rare words that are not in the vocabulary are also "bad"
good_word = {w for w, c in word_counts.items() if c >= MIN_WORD and w not in typo_of}
print("typos found", len(typo_of), "good words", len(good_word))
sample = sorted(((word_counts[w], w, v) for w, v in typo_of.items()), reverse=True)[:40]
print("top typos:", [(w, v) for _, w, v in sample])


def clean_phrase(seg):
    if len(seg) > MAX_PHRASE_LEN or len(seg) < 2:
        return False
    toks = TOKEN_RE.findall(seg)
    if not toks:
        return False
    # needs a real word (drops date/time fragments like "026 04:57 pm")
    if not any(re.fullmatch(r"[a-z]{3,}", t) and t not in ("am", "pm") for t in toks) and not any(
        re.fullmatch(r"[a-z]{2}", t) and t not in ("am", "pm") and word_counts[t] >= 1000 for t in toks
    ):
        return False
    return all(t in good_word or t.isdigit() and len(t) <= 4 for t in toks)


# ---------- phrases ----------
phr = [(s, c) for s, c in seg_counts.items() if c >= MIN_PHRASE and clean_phrase(s)]
phr.sort(key=lambda x: -x[1])
phr = phr[:MAX_PHRASES]
# merge near-duplicate spacing/punctuation variants: keep the most frequent form
seen = {}
for s, c in phr:
    key = re.sub(r"[^a-z0-9]", "", s)
    if key in seen:
        seen[key][1] += c
    else:
        seen[key] = [s, c]
phr = sorted(seen.values(), key=lambda x: x[0])
print("phrases", len(phr))

# ---------- next-word tables ----------
nxt = {}
for w1, ctr in bi.items():
    if w1 not in good_word:
        continue
    total = sum(ctr.values())
    top = [[w, c] for w, c in ctr.most_common(8) if c >= MIN_NGRAM and w in good_word]
    if top:
        nxt[w1] = [total] + top
for k, ctr in tri.items():
    a, b = k.split(" ")
    if a not in good_word or b not in good_word:
        continue
    total = sum(ctr.values())
    if total < MIN_NGRAM * 2:
        continue
    top = [[w, c] for w, c in ctr.most_common(6) if c >= MIN_NGRAM and w in good_word]
    if top:
        nxt[k] = [total] + top
print("next entries", len(nxt))

words = sorted([[w, word_counts[w]] for w in good_word if len(w) >= 3 and not w.isdigit()])
print("words", len(words))

model = {"version": 1, "phrases": phr, "next": nxt, "words": words}
with open(OUT, "w") as f:
    json.dump(model, f, separators=(",", ":"))
import os
print("size MB", os.path.getsize(OUT) / 1e6)

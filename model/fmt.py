"""Reference note formatter for CAN.

The extension's formatter.js must give the same result as format_note() here.
tests/format_cases.json is made from this file.

Two modes:
  format_note(text, rules)                 -> full format (what the agent sees)
  format_note(text, rules, lower=True)     -> expansions + typo fixes only, lowercase
                                              (used to build model.json)
"""
import json
import re

WORD_RE = re.compile(r"[A-Za-z0-9]+(?:'[A-Za-z]+)?")
MAX_KEY_WORDS = 3


def load_rules(path):
    with open(path, encoding="utf-8") as f:
        r = json.load(f)
    table = {}
    # order: casing < corrections < expand (expand wins on the same key)
    for k, v in r.get("casing", {}).items():
        table[k.lower()] = v
    casing = {k.lower(): v for k, v in r.get("casing", {}).items()}
    for k, v in r.get("corrections", {}).items():
        # a corrected word also gets its name casing ("smartgird" -> "SmartGRID")
        table[k.lower()] = casing.get(v.lower(), v)
    for k, v in r.get("expand", {}).items():
        table[k.lower()] = v
    return table


def _replace_words(text, table):
    """Replace words and short phrases (longest match first). Keys match whole words,
    case-insensitive. Words in a phrase key must be separated by spaces only."""
    words = list(WORD_RE.finditer(text))
    out = []
    pos = 0
    i = 0
    while i < len(words):
        hit = None
        for n in range(min(MAX_KEY_WORDS, len(words) - i), 0, -1):
            span = words[i:i + n]
            gaps_ok = all(text[span[j].end():span[j + 1].start()].strip(" ") == ""
                          and text[span[j].end():span[j + 1].start()] != ""
                          for j in range(n - 1))
            if not gaps_ok:
                continue
            key = " ".join(w.group(0).lower() for w in span)
            # "no." style keys: allow a trailing dot in the key
            if key in table:
                hit = (span[0].start(), span[-1].end(), table[key], n)
                break
        if hit:
            s, e, val, n = hit
            out.append(text[pos:s])
            out.append(val)
            pos = e
            i += n
        else:
            i += 1
    out.append(text[pos:])
    return "".join(out)


def _mostly_caps(text):
    letters = [c for c in text if c.isalpha()]
    return len(letters) >= 4 and sum(c.isupper() for c in letters) / len(letters) > 0.6


def format_note(text, table, lower=False):
    if not text:
        return text
    if lower:
        return _replace_words(text.lower(), {k: v.lower() for k, v in table.items()})

    # 1. ALL-CAPS notes become lowercase first (names get their casing back in step 2)
    if _mostly_caps(text):
        text = text.lower()

    # 2. expansions, typo fixes, name casing
    text = _replace_words(text, table)

    # 3. spacing: one space between words, no space before , . ? !, one space after ,
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" +([,.?!])", r"\1", text)
    text = re.sub(r",(?=[A-Za-z])", ", ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))

    # 4. capital letter at the start of the note, of each line, after . ? !
    #    and after the separators / | //  (each part of a note is a short sentence)
    def cap(m):
        return m.group(1) + m.group(2).upper()

    text = re.sub(r"(^|\n\s*|[.?!]\s+|[/|]+\s*)([a-z])", cap, text)
    return text


if __name__ == "__main__":
    import sys
    t = load_rules(sys.argv[1])
    for line in sys.stdin:
        print(format_note(line.rstrip("\n"), t))

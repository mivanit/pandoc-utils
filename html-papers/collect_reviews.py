"""Merge exported review files and list their comments against the markdown source.

Readers comment on a page in its review mode (``review.js``, format ``review/v1``) and send
one JSON file each. Annotations merge by ``id`` with the newest
``updated`` winning, so a reader who exports twice counts once with their latest edits, and
one they deleted after an earlier export is dropped.

With ``--md``, each quote is located in the markdown the page was rendered from: exactly
(whitespace collapsed, case ignored, best prefix/suffix match among repeats), else
approximately, by 8-character shingles of the quote voting for where it starts (a quarter of
them must agree). Rendered text
differs from the source (emphasis, citations, term macros, math), and the page may have
changed since the comment was written. An approximate line is marked ``~``. A quote with no
match at all is listed with its section heading.

    uv run html-papers/collect_reviews.py reviews/ --md paper.md -o reviews/merged.json

To see the merged comments in place, put ``merged.json`` beside the page and open
``index.html?review=1&review-load=merged.json`` (over http: a page opened from a file cannot
load it), or drop the files on Import in the review panel. Standard library only. From https://github.com/mivanit/pandoc-utils, html-papers/.
"""

import argparse
import json
import re
import textwrap
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

FORMAT: str = "review/v1"
SHINGLE: int = 8  # chars per shingle when locating a quote approximately
BIN: int = 16  # chars per start-position bin the shingles vote into
MAX_HITS: int = 50  # a shingle found more often than this is too common to vote

Annotation = dict[str, Any]
Location = tuple[int, bool]  # (1-based line, approximate)


def read_reviews(directory: Path) -> list[dict[str, Any]]:
    """Every ``*.json`` export in ``directory``, skipping an earlier ``merge`` output; anything else is an error."""
    files: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.json")):
        data: dict[str, Any] = json.loads(path.read_text())
        if data.get("format") != FORMAT:
            raise ValueError(f"{path}: not a {FORMAT} file")
        if "sources" not in data:
            files.append(data)
    return files


def merge(files: list[dict[str, Any]]) -> dict[str, Any]:
    """One ``review/v1`` document: the newest version of each annotation, minus deleted ones."""
    latest: dict[str, Annotation] = {}
    for data in files:
        for raw in data["annotations"]:
            a: Annotation = {
                **raw,
                "author": raw.get("author") or data.get("reviewer") or "anonymous",
            }
            prev: Annotation | None = latest.get(a["id"])
            if prev is None or a["updated"] > prev["updated"]:
                latest[a["id"]] = a
    annotations: list[Annotation] = sorted(
        (a for a in latest.values() if not a.get("deleted")),
        key=lambda a: a.get("position", {}).get("start", 0),
    )
    newest: dict[str, Any] = max(files, key=lambda d: d["exported_at"])
    return {
        "format": FORMAT,
        "doc": newest["doc"],
        "reviewer": "merged",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "sources": [
            {
                "reviewer": d.get("reviewer", ""),
                "contact": d.get("contact", ""),
                "exported_at": d["exported_at"],
                "commit": d["doc"].get("commit", ""),
            }
            for d in files
        ],
        "annotations": annotations,
    }


def normalize(source: str) -> tuple[str, list[int]]:
    """``source`` lowercased with whitespace runs collapsed to one space, and each char's line."""
    chars: list[str] = []
    lines: list[int] = []
    line: int = 1
    space: bool = True
    for ch in source:
        if ch.isspace():
            if not space:
                chars.append(" ")
                lines.append(line)
            space = True
        else:
            low: str = ch.lower()
            chars.append(low if len(low) == 1 else ch)  # keep offsets aligned
            lines.append(line)
            space = False
        if ch == "\n":
            line += 1
    return "".join(chars), lines


def _clean(s: str) -> str:
    """Whitespace runs collapsed, lowercased; edge spaces kept (they matter in a prefix/suffix)."""
    return re.sub(r"\s+", " ", s).lower()


def _find_all(text: str, needle: str, limit: int) -> list[int]:
    """Start offsets of ``needle`` in ``text``, at most ``limit + 1`` of them."""
    hits: list[int] = []
    i: int = text.find(needle)
    while i >= 0 and len(hits) <= limit:
        hits.append(i)
        i = text.find(needle, i + 1)
    return hits


def _context(text: str, start: int, end: int, prefix: str, suffix: str) -> int:
    """Chars of ``prefix`` ending at ``start`` plus chars of ``suffix`` starting at ``end``."""
    before: str = text[max(0, start - len(prefix)) : start]
    n: int = 0
    while n < min(len(before), len(prefix)) and before[-1 - n] == prefix[-1 - n]:
        n += 1
    m: int = 0
    after: str = text[end : end + len(suffix)]
    while m < min(len(after), len(suffix)) and after[m] == suffix[m]:
        m += 1
    return n + m


def _vote(text: str, probe: str) -> int | None:
    """Where ``probe`` most likely starts in ``text``.

    Each of its shingles found in the text votes for the start that implies. None unless a
    quarter of the shingles (two at least) agree to within a bin; then the start most of them
    name (the earliest on a tie), which is the true one for the part of a quote before the
    first place it differs from the source.
    """
    votes: Counter[int] = Counter()  # by bin
    starts: Counter[int] = Counter()  # by exact start
    stride: int = max(1, (len(probe) - SHINGLE) // 100)
    shingles: int = 0
    for j in range(0, len(probe) - SHINGLE + 1, stride):
        shingles += 1
        hits: list[int] = _find_all(text, probe[j : j + SHINGLE], MAX_HITS)
        if len(hits) > MAX_HITS:
            continue
        for p in hits:
            votes[(p - j) // BIN] += 1
            starts[p - j] += 1
    if not votes:
        return None
    # neighbouring bins pool their votes: a start near a bin edge splits them
    best: int = max(votes, key=lambda b: votes[b - 1] + votes[b] + votes[b + 1])
    if votes[best - 1] + votes[best] + votes[best + 1] < max(2, shingles // 4):
        return None
    near: list[int] = [s for s in starts if best - 1 <= s // BIN <= best + 1]
    return max(0, min(near, key=lambda s: (-starts[s], s)))


def locate(quote: dict[str, str], text: str, lines: list[int]) -> Location | None:
    """The source line of a quote in normalized ``text`` (from ``normalize``)."""
    exact: str = _clean(quote["exact"]).strip()
    prefix: str = _clean(quote.get("prefix", ""))
    suffix: str = _clean(quote.get("suffix", ""))
    hits: list[int] = _find_all(text, exact, len(text)) if exact else []
    if hits:
        best: int = max(
            hits, key=lambda i: _context(text, i, i + len(exact), prefix, suffix)
        )
        return lines[best], False
    if len(exact) >= SHINGLE:
        start: int | None = _vote(text, exact)
        if start is not None:
            return lines[min(start, len(lines) - 1)], True
    probe: str = _clean(
        " ".join((quote.get("prefix", ""), quote["exact"], quote.get("suffix", "")))
    )
    start = _vote(text, probe)
    if start is None:
        return None
    return lines[min(start + len(prefix), len(lines) - 1)], True


def _short(s: str, n: int = 90) -> str:
    s = " ".join(s.split())
    return s if len(s) <= n else s[: n - 1] + "…"


def report(annotations: list[Annotation], md: Path | None) -> list[str]:
    """One entry per annotation, in source order when ``md`` is given (unlocated ones last)."""
    located: list[tuple[Location | None, Annotation]]
    if md is None:
        located = [(None, a) for a in annotations]
    else:
        text, lines = normalize(md.read_text())
        located = [(locate(a["quote"], text, lines), a) for a in annotations]
        located.sort(key=lambda x: (x[0] is None, x[0][0] if x[0] else 0))
    out: list[str] = []
    for loc, a in located:
        if md is None:
            where: str = a.get("section", {}).get("text", "") or "?"
        elif loc is None:
            where = f"{md}:?  (section: {a.get('section', {}).get('text', '') or '?'})"
        else:
            where = f"{md}:{loc[0]}" + (" ~" if loc[1] else "")
        flags: str = " [resolved]" if a.get("status") == "resolved" else ""
        what: str
        if a["kind"] == "suggestion" and not a["quote"]["exact"]:
            what = f'insert "{_short(a.get("replacement", ""), 60)}"'
        elif a["kind"] == "suggestion":
            what = f'"{_short(a["quote"]["exact"], 60)}" -> "{_short(a.get("replacement", ""), 60)}"'
        else:
            what = f'"{_short(a["quote"]["exact"])}"'
        out.append(f"{where}  [{a['author']}] {a['kind']}{flags}: {what}")
        if a.get("body"):
            out.append(textwrap.indent(a["body"], "    > ", lambda _: True))
    return out


def main() -> None:
    parser: argparse.ArgumentParser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "directory", type=Path, help="directory of exported review JSON files"
    )
    parser.add_argument(
        "--md", type=Path, default=None, help="markdown source to locate quotes in"
    )
    parser.add_argument(
        "-o", "--output", type=Path, default=None, help="write the merged file here"
    )
    args: argparse.Namespace = parser.parse_args()
    files: list[dict[str, Any]] = read_reviews(args.directory)
    if not files:
        raise SystemExit(f"no {FORMAT} files in {args.directory}")
    merged: dict[str, Any] = merge(files)
    if args.output is not None:
        args.output.write_text(json.dumps(merged, indent=2, ensure_ascii=False))
    commits: list[str] = sorted({s["commit"] for s in merged["sources"]})
    reviewers: list[str] = sorted(
        {
            s["reviewer"] + (f" <{s['contact']}>" if s["contact"] else "")
            for s in merged["sources"]
        }
    )
    print(
        f"{len(merged['annotations'])} annotations from {len(files)} files"
        f" ({', '.join(reviewers)}); page commits: {', '.join(c[:10] or '?' for c in commits)}"
    )
    print("\n".join(report(merged["annotations"], args.md)))


if __name__ == "__main__":
    main()

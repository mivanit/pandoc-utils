"""collect_reviews.py: merging review exports and finding their quotes in the markdown source."""

import sys
from pathlib import Path
from typing import Any


sys.path.insert(0, str(Path(__file__).parent.parent))
from collect_reviews import locate, merge, normalize, report  # noqa: E402

MD: str = """# Intro

Most papers report a number with a *plain-language*
account of where the number came from.

We instead build each number with a script.

# Results

We instead build each number with a script, again.
"""


def annotation(id_: str, updated: str, **kw: Any) -> dict[str, Any]:
    return {
        "id": id_,
        "kind": "comment",
        "quote": {"exact": "x", "prefix": "", "suffix": ""},
        "position": {"start": 0, "end": 1},
        "body": "",
        "status": "open",
        "created": updated,
        "updated": updated,
        **kw,
    }


def export(
    reviewer: str, exported_at: str, *annotations: dict[str, Any]
) -> dict[str, Any]:
    return {
        "format": "review/v1",
        "doc": {"commit": "abc"},
        "reviewer": reviewer,
        "exported_at": exported_at,
        "annotations": list(annotations),
    }


def test_merge_newest_wins_and_drops_deleted() -> None:
    early = export(
        "ann",
        "2026-11-01",
        annotation("a", "2026-11-01", body="first"),
        annotation("b", "2026-11-01"),
    )
    late = export(
        "ann",
        "2026-11-02",
        annotation("a", "2026-11-02", body="second"),
        annotation("b", "2026-11-02", deleted=True),
    )
    other = export("bo", "2026-11-01", annotation("c", "2026-11-01"))
    merged = merge([late, early, other])
    by_id = {a["id"]: a for a in merged["annotations"]}
    assert set(by_id) == {"a", "c"}
    assert by_id["a"]["body"] == "second"
    assert by_id["c"]["author"] == "bo"  # filled from the file's reviewer


def test_locate_exact_with_context_and_approximate() -> None:
    text, lines = normalize(MD)
    # wrapped across lines, case and emphasis aside: the quote is a rendered span
    assert locate({"exact": "account of where"}, text, lines) == (4, False)
    # repeated text: the context picks the second occurrence
    q = {
        "exact": "build each number",
        "prefix": "",
        "suffix": " with a script, again",
    }
    assert locate(q, text, lines) == (10, False)
    # markdown emphasis breaks the exact match; the shingles still find it
    q = {
        "exact": "report a number with a plain-language account",
        "prefix": "",
        "suffix": "",
    }
    assert locate(q, text, lines) == (3, True)
    assert locate({"exact": "nothing like this in the source"}, text, lines) is None


def test_report_lists_in_source_order(tmp_path: Path) -> None:
    md = tmp_path / "post.md"
    md.write_text(MD)
    anns = [
        annotation(
            "r", "t", quote={"exact": "We instead build"}, author="ann", body="hm"
        ),
        annotation(
            "s",
            "t",
            kind="suggestion",
            quote={"exact": "the number came from"},
            replacement="the number was computed",
            author="bo",
        ),
    ]
    lines = report(anns, md)
    assert lines[0].startswith(f"{md}:4  [bo] suggestion")
    assert lines[1].startswith(f"{md}:6  [ann] comment")
    assert lines[2] == "    > hm"

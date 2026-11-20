"""The demo paper, built by its own build.sh: what the build must produce (needs pandoc)."""

import json
import re
import subprocess
from html import unescape
from pathlib import Path

import pytest

from conftest import HTML_PAPERS, REPO, SHARED


@pytest.fixture(scope="module")
def html(built_demo: Path) -> str:
    return " ".join((built_demo / "index.html").read_text().split())


def test_the_experiment_writes_what_the_paper_includes(built_demo: Path) -> None:
    for name in (
        "generated/results.md",
        "generated/continuations.json",
        "live/data.js",
        "figures/loss-by-order.svg",
        "figures/smoothing-train.svg",
        "figures/smoothing-heldout.svg",
        "figures/words.svg",
    ):
        assert (built_demo / name).stat().st_size > 0, name
    rows: dict = json.loads((built_demo / "generated/continuations.json").read_text())
    assert [r["label"] for r in rows["rows"]][0] == "the paper"
    assert rows["rows"][0]["reference"] is True


def test_the_experiment_is_reproducible(built_demo: Path) -> None:
    """Run again on the same paper.md: every file it writes is byte for byte the same."""
    written: list[Path] = [
        *sorted((built_demo / "generated").iterdir()),
        *sorted((built_demo / "figures").glob("*.svg")),
        built_demo / "live" / "data.js",
    ]
    before: list[bytes] = [p.read_bytes() for p in written]
    subprocess.run(
        ["uv", "run", "--project", str(REPO), "python", "-B", "experiment.py"],
        cwd=built_demo,
        check=True,
        capture_output=True,
    )
    assert [p.read_bytes() for p in written] == before


def test_nothing_is_left_unresolved(html: str) -> None:
    # the text itself names \autoref and \term, in code
    body: str = html.replace("<code>\\autoref</code>", "")
    assert "??" not in body and 'class="missing' not in body
    for raw in ("\\label{", "\\TODO{", "interactive-src", "interactive-link"):
        assert raw not in body, raw
    assert body.count("\\autoref{") == 3  # the three in the cross-references example
    assert (
        body.count("\\term{") == 1 and body.count("\\term[") == 1
    )  # the terms example


def test_the_included_files_are_the_real_ones(html: str) -> None:
    """build.sh, model.py, experiment.py and terms.yaml are printed from the files that ran."""
    assert '<figure id="fig:build">' in html and '<figure id="fig:model">' in html
    text: str = unescape(re.sub(r"<[^>]+>", "", html))  # without the highlighting
    for name, line in (
        ("build.sh", "run python -B experiment.py"),
        ("model.py", "class NGram:"),
        ("experiment.py", "def words_of(markdown: str) -> list[str]:"),
        ("terms.yaml", "target: sec:loss"),
    ):
        assert line in (HTML_PAPERS / "demo" / name).read_text(), name
        assert line in text, name


def test_each_construct_is_in_the_page(html: str) -> None:
    assert '<table id="tab:loss">' in html and "Table 1:" in html
    head: str = html.split("<thead>")[1].split("</thead>")[0]
    assert head.count("<tr") == 2 and "words" in head  # the bold row joined the header
    assert '<span class="cell-note"><sup>*</sup>' in html
    assert 'data-embed="live/curve.html#embed"' in html
    assert 'class="subfigure-row"' in html
    assert '<div class="generations">' in html and "gen-ref" in html
    assert '<a href="live/words.html" class="open-full"' in html
    assert '<span class="todo">' in html
    assert '<a href="#sec:loss" class="term" title="How surprised a model is' in html
    for name in ("arxiv-links.js", "popups.js", "contents.js", "live-figures.js"):
        assert f'<script src="{name}" defer></script>' in html


def test_published_copies_match_the_originals() -> None:
    """docs/html-papers/ (the GitHub Pages copy) has the current scripts and stylesheets."""
    site: Path = REPO / "docs" / "html-papers"
    if not site.exists():
        pytest.skip("docs/html-papers/ not built: make demo-html-papers")
    stale: list[str] = [
        name
        for name in SHARED
        if (site / name).read_bytes() != (HTML_PAPERS / name).read_bytes()
    ]
    assert not stale, f"rebuild with `make demo-html-papers`: {stale}"

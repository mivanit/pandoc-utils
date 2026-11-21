"""The demo paper, built by its own build.sh: what the build must produce (needs pandoc)."""

import json
import os
import re
import subprocess
from html import unescape
from pathlib import Path

import pytest

from hp_paths import HTML_PAPERS, REPO, SHARED

pytest_plugins = ["hp_fixtures"]  # the built_demo fixture


@pytest.fixture(scope="module")
def html(built_demo: Path) -> str:
    return " ".join((built_demo / "index.html").read_text().split())


def test_the_experiment_writes_what_the_paper_includes(built_demo: Path) -> None:
    for name in (
        "generated/results.md",
        "generated/continuations.json",
        "generated/train.txt",
        "generated/sentence-loss.txt",
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


def test_code_that_runs_is_in_the_page_as_the_build_read_it(built_demo: Path) -> None:
    """Each runnable block carries its files, and they are the files of the folder."""
    page: str = (built_demo / "index.html").read_text()
    blocks: list[dict] = [
        json.loads(text)
        for text in re.findall(
            r'<script type="application/json" class="run-data">(.*?)</script>', page
        )
    ]
    assert [b["main"] for b in blocks] == [
        "continue_text.py",
        "sentence_loss.py",
        "plot_words.py",
    ]
    for block in blocks:
        for file in block["files"]:
            assert file["text"] == (built_demo / file["name"]).read_text(), file["name"]
    assert (
        blocks[0]["render"] == "run/chips.js" and (built_demo / "run/chips.js").exists()
    )
    assert blocks[1]["stdin"] == (built_demo / "run/sentence.txt").read_text()
    # what the build printed is under the second block
    said: str = (built_demo / "generated/sentence-loss.txt").read_text()
    assert "order 2:" in said and "guessing:" in said
    assert said.splitlines()[1] in unescape(page)


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
    """Outside the code the paper prints, no construct is left as it was written."""
    prose: str = re.sub(r"<pre\b.*?</pre>|<code\b.*?</code>", "", html)
    assert "<pre" in html and "<pre" not in prose
    for raw in (
        "??",
        "\\autoref",
        "\\ref{",
        "\\term",
        "\\label",
        "\\TODO",
        "interactive-",
    ):
        assert raw not in prose, raw
    assert '<a href="#tab:loss">Table 1</a>' in prose


def test_the_included_files_are_the_real_ones(html: str) -> None:
    """build.sh, model.py, experiment.py and terms.yaml are printed from the files that ran."""
    assert '<figure id="fig:build">' in html and '<figure id="fig:model">' in html
    text: str = unescape(re.sub(r"<[^>]+>", "", html))  # without the highlighting
    for name, line in (
        ("build.sh", "run python -B experiment.py"),
        ("model.py", "class NGram:"),
        (
            "experiment.py",
            "def split(words: list[str]) -> tuple[list[str], list[str]]:",
        ),
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
    for name in (
        "arxiv-links.js",
        "popups.js",
        "contents.js",
        "live-figures.js",
        "run-code.js",
        "keep-place.js",
        "menu.js",
    ):
        assert f'<script src="{name}" defer></script>' in html


def test_published_copy_is_current(built_demo: Path) -> None:
    """docs/html-papers/ (the GitHub Pages copy) is what the sources build now.

    Its copies of the paper's sources and of the scripts and stylesheets match the originals,
    and so does everything the experiment writes. (The page itself carries the commit it was
    built from, so it is not compared.)
    """
    site: Path = REPO / "docs" / "html-papers"
    if not site.exists():
        pytest.skip("docs/html-papers/ not built: make demo-html-papers")
    demo: Path = HTML_PAPERS / "demo"
    sources: dict[str, Path] = {
        **{name: HTML_PAPERS / name for name in SHARED},
        **{str(p.relative_to(demo)): p for p in demo.rglob("*") if p.is_file()},
        **{
            str(p.relative_to(built_demo)): p
            for folder in ("generated", "figures", "live")
            for p in (built_demo / folder).iterdir()
            if p.suffix != ".pdf"
        },
    }
    stale: list[str] = sorted(
        name
        for name, original in sources.items()
        if not (site / name).exists()
        or (site / name).read_bytes() != original.read_bytes()
    )
    assert not stale, f"rebuild with `make demo-html-papers`: {stale}"


def test_the_page_says_which_sources_it_was_built_from(tmp_path: Path) -> None:
    """review-doc-version: DOC_VERSION if given, else the commit, -dirty for a changed source."""

    def run(*command: str, **env: str) -> subprocess.CompletedProcess[str]:
        result: subprocess.CompletedProcess[str] = subprocess.run(
            command,
            cwd=tmp_path,
            env={**os.environ, "DOC_VERSION": "", **env},
            text=True,
            capture_output=True,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        return result

    def stamp(**env: str) -> str:
        filter_: str = str(HTML_PAPERS / "html-papers.lua")
        built = run(
            "pandoc", "doc.md", "--lua-filter", filter_, "-s", "-o", "page.html", **env
        )
        assert "fatal" not in built.stderr, (
            built.stderr
        )  # git's complaints stay out of the build
        found = re.search(
            r'<meta name="review-doc-version" content="([^"]*)">',
            (tmp_path / "page.html").read_text(),
        )
        return found[1] if found else ""

    (tmp_path / "doc.md").write_text("---\ntitle: T\n---\n\nSome text.\n")
    assert (
        stamp(GIT_CEILING_DIRECTORIES=str(tmp_path.parent)) == ""
    )  # not in a checkout
    assert stamp(DOC_VERSION="abc123-dirty") == "abc123-dirty"
    git: tuple[str, ...] = (
        "git",
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.org",
    )
    run("git", "init", "-q")
    stamp()
    run("git", "add", "doc.md", "page.html")
    run(*git, "commit", "-q", "-m", "one")
    sha: str = run("git", "rev-parse", "HEAD").stdout.strip()
    assert stamp() == sha
    assert stamp() == sha  # the page it wrote is tracked and now modified: not a source
    (tmp_path / "page.html").unlink()
    assert stamp() == sha  # nor is a page the build cleared away first
    (tmp_path / "doc.md").write_text("---\ntitle: T\n---\n\nOther text.\n")
    assert stamp() == sha + "-dirty"

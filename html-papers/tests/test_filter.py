"""html-papers.lua on small documents: what the HTML and LaTeX it writes must contain.

Needs pandoc, no browser. Each test builds a few lines of markdown in a temporary folder that
holds a terms file, an image and a token-rows file.
"""

import json
import subprocess
from pathlib import Path

import pytest

FILTER: Path = Path(__file__).parent.parent / "html-papers.lua"

TERMS: str = """terms:
  widget:
    text: widget
    def: A small part that does one thing.
    target: sec:widgets
"""

DOCUMENT: str = r"""---
title: A test
date: |
  November 2026 \ \
  A note under the date
review_email: me@example.org
html_papers_dir: ../
header-includes: |
  \usepackage{float}
---

# First {#sec:first}

See \autoref{sec:widgets}, \autoref{tab:scores}, \autoref{fig:live}, \autoref{fig:code}
and \autoref{fig:right}. A \term{widget}, and two \term[widgets]{widget}. \TODO{fix this}

## Widgets {#sec:widgets}

![A live one.](a.svg){#fig:live interactive-src="live/x.html" interactive-embed="live/x.html#embed" interactive-height="330" interactive-width="820"}

::: {#fig:code .figure}
```python
print("hello")
```

A listing with a caption.
:::

::: {#fig:pair .subfigures}
![Left.](a.svg){#fig:left}

![Right.](a.svg){#fig:right}

Two images.
:::

| name | score |
|:--|--:|
| **tried** | 12 |
| one | 0.5[^cell] |

: Scores of the \term{widget}. \label{tab:scores}

[^cell]: One run only.
"""


@pytest.fixture
def folder(tmp_path: Path) -> Path:
    (tmp_path / "terms.yaml").write_text(TERMS)
    (tmp_path / "a.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
    )
    (tmp_path / "rows.json").write_text(
        json.dumps(
            {
                "prompt": ["the", "paper"],
                "rows": [
                    {
                        "label": "the source",
                        "tokens": ["is", "x_y"],
                        "end": "cut",
                        "reference": True,
                    },
                    {
                        "label": "a widget model",
                        "tokens": ["\n", "a\n", "<b>"],
                        "end": "eos",
                    },
                    {"label": "silent", "tokens": []},
                ],
            }
        )
    )
    return tmp_path


def build(
    folder: Path, to: str, source: str = DOCUMENT
) -> subprocess.CompletedProcess[str]:
    """Run pandoc with the filter on `source`, in `folder`; the output is on stdout."""
    return subprocess.run(
        [
            "pandoc",
            "--from",
            "markdown+footnotes+inline_notes",
            "--to",
            to,
            "--standalone",
            "--number-sections",
            "--metadata-file",
            "terms.yaml",
            "--lua-filter",
            str(FILTER),
            *(["--mathml"] if to == "html5" else []),
        ],
        input=source,
        cwd=folder,
        text=True,
        capture_output=True,
        check=False,
    )


@pytest.fixture
def html(folder: Path) -> str:
    result: subprocess.CompletedProcess[str] = build(folder, "html5")
    assert result.returncode == 0, result.stderr
    assert "WARNING" not in result.stderr, result.stderr
    return " ".join(result.stdout.split())


@pytest.fixture
def latex(folder: Path) -> str:
    result: subprocess.CompletedProcess[str] = build(folder, "latex")
    assert result.returncode == 0, result.stderr
    return result.stdout


def test_head_has_the_scripts_with_their_prefix(html: str) -> None:
    for name in ("arxiv-links.js", "popups.js", "contents.js", "live-figures.js"):
        assert f'<script src="../{name}" defer></script>' in html
    assert (
        '<script src="../review.js" data-review-email="me@example.org" defer></script>'
        in html
    )
    # the front matter's LaTeX preamble stays out of the HTML
    assert "\\usepackage" not in html


def test_scripts_sit_beside_the_page_by_default(folder: Path) -> None:
    result: subprocess.CompletedProcess[str] = build(folder, "html5", "Some text.\n")
    assert result.returncode == 0, result.stderr
    assert '<script src="popups.js" defer></script>' in result.stdout
    assert '<script src="review.js" defer></script>' in result.stdout


def test_cross_references_are_numbered_links(html: str) -> None:
    assert '<a href="#sec:widgets">Section 1.1</a>' in html  # a forward reference
    assert (
        '<a href="#tab:scores">Table 1</a>' in html
    )  # its id is a \label in the caption
    assert '<a href="#fig:live">Figure 1</a>' in html
    assert '<a href="#fig:code">Figure 2</a>' in html
    assert '<a href="#fig:right">Figure 3b</a>' in html
    assert "<figcaption>Figure 1: A live one.</figcaption>" in html
    assert '<table id="tab:scores">' in html and "Table 1:" in html
    assert "\\autoref{" not in html and "\\label{" not in html


def test_terms_link_to_their_target_with_the_definition(html: str) -> None:
    link: str = (
        '<a href="#sec:widgets" class="term" title="A small part that does one thing.">'
    )
    assert link + "widget</a>" in html
    assert (
        link + "widgets</a>" in html
    )  # \term[widgets]{widget}: other words, same term
    assert "\\term" not in html


def test_table_header_rows_and_cell_notes(html: str) -> None:
    head: str = html.split("<thead>")[1].split("</thead>")[0]
    assert head.count("<tr") == 2 and "tried" in head
    assert (
        '<span class="cell-note"><sup>*</sup><span class="cell-note-body" hidden="">One run only.'
        in html
    )
    assert "footnote-ref" not in html  # the table's note left the numbered footnotes


def test_figures_of_blocks_subfigures_and_live_figures(html: str) -> None:
    assert '<figure id="fig:code">' in html
    assert 'class="subfigure-row"' in html
    assert '<div id="fig:left" class="subfigure">' in html
    assert '<div class="subcaption"> (b) Right. </div>' in html
    live: str = html.split('<div class="fig-static"')[1].split(">")[0]
    for attr in (
        'data-embed="live/x.html#embed"',
        'data-link="live/x.html"',
        'data-height="330"',
        'data-width="820"',
    ):
        assert attr in live
    assert "interactive-" not in html


def test_static_figure_with_a_link(folder: Path) -> None:
    source: str = '![Static.](a.svg){#fig:s interactive-link="live/all.html"}\n'
    result: subprocess.CompletedProcess[str] = build(folder, "html5", source)
    assert result.returncode == 0, result.stderr
    page: str = " ".join(result.stdout.split())
    assert (
        '<img src="a.svg" alt="Static." /><br /> <a href="live/all.html" class="open-full"'
        ' target="_blank" rel="noopener">Open the interactive version ↗</a>' in page
    )
    assert "fig-static" not in page and "interactive-link" not in page
    tex: subprocess.CompletedProcess[str] = build(folder, "latex", source)
    assert tex.returncode == 0, tex.stderr
    assert "interactive" not in tex.stdout and "live/all.html" not in tex.stdout


def test_live_attributes_in_the_wrong_place_fail(folder: Path) -> None:
    for source, error in (
        # no caption: pandoc makes no figure of it
        (
            '![](a.svg){interactive-src="live/x.html"}\n',
            "require a standalone image with a nonempty caption",
        ),
        (
            'Text ![inline](a.svg){interactive-link="x.html"} here.\n',
            "standalone image",
        ),
        (
            '![Both.](a.svg){interactive-src="x.html" interactive-link="y.html"}\n',
            "interactive-link keeps a figure static",
        ),
    ):
        result: subprocess.CompletedProcess[str] = build(folder, "html5", source)
        assert result.returncode != 0 and error in result.stderr, source


TOKEN_ROWS: str = """# Widgets {#sec:widgets}

::: {#fig:rows .generations src="rows.json"}
What each model says.
:::
"""


def test_token_rows_in_html(folder: Path) -> None:
    result: subprocess.CompletedProcess[str] = build(folder, "html5", TOKEN_ROWS)
    assert result.returncode == 0, result.stderr
    page: str = " ".join(result.stdout.split())
    assert '<figure id="fig:rows"> <div class="generations">' in page
    assert "<figcaption>Figure 1: What each model says.</figcaption>" in page
    assert (
        '<div class="gen-row gen-prompt"> <div class="gen-label"> <em>prompt</em> </div>'
        ' <div class="gen-text"> <span class="tok">the</span><span class="tok">paper</span>'
        in page
    )
    # the reference row is set apart; a cut row ends with an ellipsis
    assert '<div class="gen-row gen-ref">' in page
    assert '<span class="tok">x_y</span><span class="tok-end">…</span>' in page
    # a newline shows, and after some text it breaks the line; markup in a token is text;
    # the model stopped
    assert (
        '<span class="tok tok-nl"><span class="nl">↵</span></span>'
        '<span class="tok">a<span class="nl">↵</span></span><br>'
        '<span class="tok">&lt;b&gt;</span><span class="tok-end">end of text</span>'
        in page
    )
    # a term's text in a label is that term
    assert 'a <a href="#sec:widgets" class="term"' in page


def test_token_rows_in_latex(folder: Path) -> None:
    result: subprocess.CompletedProcess[str] = build(folder, "latex", TOKEN_ROWS)
    assert result.returncode == 0, result.stderr
    tex: str = result.stdout
    assert "\\newcommand{\\hptok}" in tex and "\\usepackage{array}" in tex
    assert "\\hptok{the}\\hptok{paper}" in tex
    assert "\\hptok{x\\_y}{\\color{gray}\\ldots}" in tex  # escaped for LaTeX
    assert "\\term[widget]{widget}" in tex
    assert "\\caption{What each model says.}\\label{fig:rows}" in tex


def test_token_rows_need_their_file(folder: Path) -> None:
    source: str = '::: {#fig:rows .generations src="missing.json"}\nCaption.\n:::\n'
    result: subprocess.CompletedProcess[str] = build(folder, "html5", source)
    assert result.returncode != 0 and "cannot read missing.json" in result.stderr


def test_todo_and_date_lines(html: str) -> None:
    assert '<span class="todo">[TODO: fix this]</span>' in html
    date: str = html.split('<p class="date">')[1].split("</p>")[0]
    assert date.startswith("November 2026<br") and "<p>" not in date
    assert date.endswith("A note under the date")


def test_latex_keeps_references_and_defines_terms(latex: str) -> None:
    assert "\\autoref{sec:widgets}" in latex and "\\term{widget}" in latex
    assert "\\@namedef{hp@term@widget}" in latex
    assert (
        "\\def\\subsectionautorefname{Section}" in latex
    )  # reads as the web page does
    assert "\\begin{subfigure}" in latex and "\\label{fig:left}" in latex
    assert "\\usepackage{float}" in latex  # the document's own preamble is kept
    # nothing of a live figure reaches LaTeX, so a PDF build never fetches its page
    assert "interactive" not in latex and "fig-static" not in latex
    assert "live/x.html" not in latex


def test_unknown_term_fails_with_its_name(folder: Path) -> None:
    for to in ("html5", "latex"):
        result: subprocess.CompletedProcess[str] = build(
            folder, to, "A \\term{nosuchterm} here.\n"
        )
        assert result.returncode != 0 and "nosuchterm" in result.stderr


def test_unknown_reference_builds_with_a_warning(folder: Path) -> None:
    result: subprocess.CompletedProcess[str] = build(
        folder, "html5", "See \\autoref{sec:gone}.\n"
    )
    assert result.returncode == 0, result.stderr
    assert "Unknown cross-reference: sec:gone" in result.stderr
    assert '<span class="todo">??sec:gone</span>' in result.stdout

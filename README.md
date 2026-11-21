# pandoc-utils

Utilities for my pandoc/markdown/LaTeX workflows.

## Demos

Both are built from this repository and published at <https://mivanit.github.io/pandoc-utils/>.

- **The filters**: one markdown file that uses each filter below, as
  [a web page](https://mivanit.github.io/pandoc-utils/demo.html) and
  [a PDF](https://mivanit.github.io/pandoc-utils/demo.pdf), with
  [its source](https://mivanit.github.io/pandoc-utils/demo.md) ([`demo.md`](demo.md) here).
  `make demo` builds it.
- **html-papers**: [A Paper That Builds Itself](https://mivanit.github.io/pandoc-utils/html-papers/),
  a paper as a web page with notes in the margin, live figures, code the reader can run and
  comments, and as [a PDF](https://mivanit.github.io/pandoc-utils/html-papers/paper.pdf), from
  [one markdown file](https://mivanit.github.io/pandoc-utils/html-papers/paper.md)
  ([`html-papers/demo/`](https://github.com/mivanit/pandoc-utils/tree/main/html-papers/demo)
  here). `make demo-html-papers` builds it.

## Structure

```
pandoc-utils/
|-- pandoc_md_pdf.sh                # markdown -> LaTeX -> PDF pipeline
|-- Makefile                        # dep-install, dep-check, test, demo targets
|-- pyproject.toml                  # Python deps managed via uv
|-- markdown_get_defaults_yaml.py   # (internal) extract pandoc config from YAML front matter
|-- filters/
|   |-- svg_to_pdf.py               # convert SVG images to PDF for LaTeX
|   |-- mermaid.py                  # render mermaid diagrams to SVG/PDF
|   |-- csv_tex_table.py            # CSV code blocks to tables
|   |-- include-files.lua           # include external markdown files
|   |-- include-code-files.lua      # include source code snippets
|   |-- columns.lua                 # multi-column layout (HTML + LaTeX)
|   +-- table.lua                   # YAML-driven table templating
+-- html-papers/                    # a markdown paper as a web page and a PDF (see its README)
    |-- html-papers.lua             # the filter: numbered references, terms, subfigures, ...
    |-- demo/                       # a paper that builds itself: paper.md, build.sh, its experiment
    |-- html-papers.css             # the layout: text, notes margin, contents, comments
    |-- paper.css                   # the look: title block, tables, figures, bibliography
    |-- popups.js                   # margin notes and previews on hover
    |-- contents.js                 # contents sidebar
    |-- live-figures.js             # click a static figure for its live version
    |-- arxiv-links.js              # links in the bibliography
    |-- run-code.js                 # code blocks the reader can edit and run (Python in the browser)
    |-- keep-place.js               # keeps the reader's place when the text reflows
    |-- menu.js                     # the reader's settings (M)
    |-- review.js                   # comments and suggested edits, exported as JSON
    +-- collect_reviews.py          # merge reviewers' files, list comments by source line
```

## Core Scripts

### pandoc_md_pdf.sh

Main conversion pipeline: markdown -> LaTeX -> PDF with optional bibliography support.

```bash
pandoc_md_pdf.sh document.md       # convert to PDF (biblatex auto-detected)
pandoc_md_pdf.sh document.md -b    # force biblatex on
```

Extracts pandoc configuration from the document's YAML front matter (via `uv run markdown_get_defaults_yaml.py`), then runs pandoc followed by `latexmk`. Biblatex is enabled automatically when the front matter declares a `bibliography:` or `references:` field (pass `-b` to force it on regardless); when it is off, no bibliography markup is emitted so documents without citations build cleanly. `latexmk` runs `pdflatex` and, when biblatex is enabled, `biber`, re-running each as many times as needed until references converge. Produces `.tex`, `.pdf`, and `.pdlog` files.

<details>
<summary><b>Internal helpers</b></summary>

- **markdown_get_defaults_yaml.py** — Extracts pandoc defaults from YAML front matter and writes a defaults file. Called internally by `pandoc_md_pdf.sh`. Resolves the `$FILTERS$` placeholder to the actual filters directory.

</details>

## Filters

Pandoc filters are referenced in YAML front matter using the `$FILTERS$` placeholder:

```yaml
---
__defaults__:
  filters:
    - $FILTERS$/mermaid.py
    - $FILTERS$/svg_to_pdf.py
    - $FILTERS$/columns.lua
---
```

### svg_to_pdf.py

Converts `.svg` images to PDF using Inkscape when targeting LaTeX output. Caches results — only re-converts when the SVG is newer than the existing PDF.

### mermaid.py

Renders `mermaid` code blocks to SVG (HTML output) or PDF (LaTeX output) using `mmdc`. For LaTeX, converts SVG -> PDF via Inkscape and crops with `pdfcrop`. Caches output by content hash.

### csv_tex_table.py

Converts `csvtable` code blocks containing CSV data into pandoc tables. (WIP)

### include-files.lua

Includes external markdown files at compile time. Supports recursive inclusion, heading level shifting, relative path resolution, and comment lines.

````markdown
```include
chapter1.md
chapter2.md
```
````

### include-code-files.lua

Includes source code from external files into code blocks, with optional line range selection and dedentation.

````markdown
```python {include="src/main.py" startLine=10 endLine=25 dedent=4}
```
````

### columns.lua

Multi-column layout support for both HTML (CSS columns) and LaTeX (`multicols`). Configurable column count, gap, rules, and justification.

```markdown
::: {.columns column-count=3 column-gap="1em"}
Column 1 content

::: columnbreak
:::

Column 2 content
:::
```

### table.lua

YAML-driven table generation with reusable templates, configurable alignment and widths, auto-numbering, and horizontal orientation support.

## HTML papers

[`html-papers/`](html-papers/README.md) builds a paper written in markdown as a web page with
three columns: the contents, the text, and a side column with notes and previews (citations,
footnotes, terms, cross-references) and, in review mode, comments and suggested edits. The
columns resize, and on a phone the notes open in the text. Figures can be live, and a reader
can edit and run the paper's code on the page. The same source builds the PDF. A filter, two
stylesheets, eight drop-in scripts, and a script that maps reviewers' comments back to lines
of the source.

The demo is [a paper that builds itself](https://mivanit.github.io/pandoc-utils/html-papers/):
its build runs its experiment and prints the code that did.

```bash
make demo-html-papers        # html-papers/demo/ -> docs/html-papers/index.html and paper.pdf
make demo-html-papers-html   # the web page only, in a few seconds
```

## Setup

Dependencies are managed via `Makefile` and `pyproject.toml`:

```bash
make dep-install   # install system (apt), npm, and Python (uv) deps
make dep-check     # verify all required binaries are available
make test          # run pytest
make test-html     # html-papers/ in headless Chromium (once: uv run playwright install chromium)
make test-html-firefox  # the same in Firefox (once: uv run playwright install firefox)
```

### Dependencies

**System binaries:** `uv`, `pandoc` (>=2.12; `html-papers/` needs >=3.6.1), `latexmk`, `pdflatex`, `inkscape`, `mmdc` (mermaid-cli), `pdfcrop`, `magick` (ImageMagick), `biber` (for bibliographies)

**Python** (managed by `uv` via `pyproject.toml`): `pyyaml`, `pandocfilters`, `pandas`

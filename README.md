# pandoc-utils

Utilities for my pandoc/markdown/LaTeX workflows.

## Structure

```
pandoc-utils/
|-- pandoc_md_pdf.sh                # markdown -> LaTeX -> PDF pipeline
|-- Makefile                        # install, test, check-deps targets
|-- pyproject.toml                  # Python deps managed via uv
|-- markdown_get_defaults_yaml.py   # (internal) extract pandoc config from YAML front matter
+-- filters/
    |-- svg_to_pdf.py               # convert SVG images to PDF for LaTeX
    |-- mermaid.py                  # render mermaid diagrams to SVG/PDF
    |-- csv_tex_table.py            # CSV code blocks to tables
    |-- include-files.lua           # include external markdown files
    |-- include-code-files.lua      # include source code snippets
    |-- columns.lua                 # multi-column layout (HTML + LaTeX)
    +-- table.lua                   # YAML-driven table templating
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

## Setup

Dependencies are managed via `Makefile` and `pyproject.toml`:

```bash
make install       # install system (apt), npm, and Python (uv) deps
make dep-check     # verify all required binaries are available
make test          # run pytest
```

### Dependencies

**System binaries:** `uv`, `pandoc` (>=2.12), `latexmk`, `pdflatex`, `inkscape`, `mmdc` (mermaid-cli), `pdfcrop`, `magick` (ImageMagick), `biber` (for bibliographies)

**Python** (managed by `uv` via `pyproject.toml`): `pyyaml`, `pandocfilters`, `pandas`

# pandoc-utils

Utilities for my pandoc/markdown/LaTeX workflows.

## Structure

```
pandoc-utils/
├── pandoc_md_pdf.sh                # markdown -> LaTeX -> PDF pipeline
├── pandoc_md_tex.sh                # markdown -> LaTeX (no PDF compilation)
├── markdown_get_defaults_yaml.py   # extract pandoc config from YAML front matter
├── rsvg_convert_magick.py          # SVG converter using ImageMagick (rsvg-convert interface)
├── pandoc_filter.py                # TikZ diagram processor (legacy)
└── filters/
    ├── svg_to_pdf.py               # convert SVG images to PDF for LaTeX
    ├── mermaid.py                  # render mermaid diagrams to SVG/PDF
    ├── csv_tex_table.py            # CSV code blocks to tables
    ├── _dendron_link_tools.py      # dendron wiki-link conversion utilities
    ├── include-files.lua           # include external markdown files
    ├── include-code-files.lua      # include source code snippets
    ├── columns.lua                 # multi-column layout (HTML + LaTeX)
    └── table.lua                   # YAML-driven table templating
```

## Core Scripts

### pandoc_md_pdf.sh

Main conversion pipeline: markdown -> LaTeX -> PDF with optional bibliography support.

```bash
pandoc_md_pdf.sh document.md       # convert to PDF
pandoc_md_pdf.sh document.md -b    # convert with bibliography (biber)
```

Extracts pandoc configuration from the document's YAML front matter via `markdown_get_defaults_yaml.py`, then runs pandoc and pdflatex. Produces `.tex`, `.pdf`, and `.pdlog` files.

### pandoc_md_tex.sh

Simple markdown -> LaTeX conversion without PDF compilation.

```bash
pandoc_md_tex.sh document.md
```

### markdown_get_defaults_yaml.py

Extracts pandoc defaults from a markdown file's YAML front matter and writes them to a defaults file. Looks for `__defaults__` or `__pandoc__` keys and resolves the `$FILTERS$` placeholder to the actual filters directory.

```bash
python markdown_get_defaults_yaml.py document.md
python markdown_get_defaults_yaml.py document.md --defaults-file custom.yml --filters-dir /path/to/filters
```

### rsvg_convert_magick.py

Drop-in replacement for `rsvg-convert` backed by ImageMagick. Supports DPI, zoom, size, background color, and output format (png/pdf/ps/eps/svg) options.

```bash
python rsvg_convert_magick.py input.svg -f pdf -o output.pdf
python rsvg_convert_magick.py input.svg -d 300 -f png -o output.png
```

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

### _dendron_link_tools.py

Utility module for converting Dendron-style wiki links (`[[path.to.note]]`) to standard markdown links. Provides factory functions for customizable link text and path generation.

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

## Dependencies

**System binaries:** `pandoc` (≥2.12), `pdflatex`, `inkscape`, `mmdc` (mermaid-cli), `pdfcrop`, `magick` (ImageMagick), `biber` (optional)

**Python:** `pyyaml`, `pandocfilters`, `pandas`

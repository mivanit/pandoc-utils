# html-papers

A paper written in markdown, built as a web page that reads like a paper: notes and previews
in the margin, a contents sidebar, comments, live figures. The same file builds a PDF with the
same numbering and references.

## The demo

[`demo/`](demo/) is a paper that builds itself: its text explains each construct while using
it, and its build runs the experiment the text reports, draws the figures, fills the table
and prints the code that did so. Read it at
<https://mivanit.github.io/pandoc-utils/html-papers/> ([PDF](https://mivanit.github.io/pandoc-utils/html-papers/paper.pdf)),
or build it from the repository root:

```bash
make demo-html-papers        # docs/html-papers/index.html and paper.pdf (LaTeX, biber, inkscape)
make demo-html-papers-html   # the web page only, in a few seconds
```

Both copy `demo/` and the scripts and stylesheets of this folder into `docs/html-papers/`
(the GitHub Pages site) and run the paper's own [`build.sh`](demo/build.sh) there. `demo/`
holds only the source; nothing built is kept in it.

| In `demo/` | |
|---|---|
| `paper.md` | The paper. Its front matter holds the settings: bibliography, filters, terms file. |
| `build.sh` | `./build.sh [html\|pdf\|all]`: the experiment, then pandoc for the page, then the PDF. |
| `model.py`, `experiment.py`, `svgplot.py` | The experiment. It reads `paper.md` and writes `figures/`, `generated/` and `live/data.js`. |
| `terms.yaml`, `refs.bib` | The terms and the references. |
| `live/` | The pages behind the live figure and the linked one. |

The web page is two commands (`build.sh` step 2): `markdown_get_defaults_yaml.py` reads the
`__defaults__` block of the front matter into a pandoc defaults file, then

```bash
pandoc paper.md --defaults _pandoc_defaults.paper.yml \
  --from markdown+footnotes+inline_notes --to html5 --standalone --citeproc --mathml \
  --css html-papers.css --css paper.css --output index.html
```

The PDF is `pandoc_md_pdf.sh paper.md`.

## Starting your own

1. Copy `demo/` and, into the same folder, this folder's scripts, `html-papers.css`,
   `paper.css`, and `numeric.csl` if you cite. Each names this repository in its header;
   nothing updates the copies. `build.sh` finds pandoc-utils two folders up, or at
   `$PANDOC_UTILS`.
2. Replace the text, `terms.yaml`, `refs.bib` and the experiment (or delete step 1 of
   `build.sh` if nothing is computed).
3. Write. The demo shows each construct beside its source; [the filter](html-papers.lua)'s
   header lists them all.

If the scripts live somewhere else, set `html_papers_dir` in the front matter to their URL
prefix (`html_papers_dir: ../`) and give `--css` the same prefix.

Without the filter, the scripts still work on any pandoc page built with
`--number-sections --citeproc`; add their tags yourself:

```html
<link rel="stylesheet" href="html-papers.css" />
<link rel="stylesheet" href="paper.css" />  <!-- or your own -->
<script src="arxiv-links.js" defer></script>
<script src="popups.js" defer></script>
<script src="contents.js" defer></script>
<script src="live-figures.js" defer></script>
<script src="review.js" defer data-review-email="me@example.org"></script>
```

Each script is one file with no dependencies; take the ones you want.

### Building and publishing

- **Publish together:** the page, both stylesheets, the scripts, and the `figures/` and
  `live/` files it refers to. Nothing else is needed, and nothing is fetched from elsewhere.
- **Equations** are MathML (`--mathml`): they render in current Chrome, Firefox and Safari
  without JavaScript or a CDN. A bare `--mathjax` on Debian's pandoc writes a path that only
  exists on the machine that built the page.
- **Figures:** the page keeps the SVGs. The PDF build converts each to a PDF beside it, and
  again only when the SVG changes.
- **A captioned image is a numbered figure.** An image with an empty description
  (`![](logo.svg)`) is an illustration without a number.
- **The PDF** goes through latexmk, which runs LaTeX and biber as often as needed. If a
  reference shows as `??`, look in the final `.log`: the warnings in `.pdlog` are from early
  passes and most are resolved by later ones. `SOURCE_DATE_EPOCH=1` (as in the demo's
  `build.sh`) keeps the date out of the PDF and the converted figures, so they change only
  when their content does.
- **Live pages that fetch data** do not work from `file://`. Serve the folder
  (`python3 -m http.server --directory docs`) and open it at `localhost`.

## Files

| File | What it does |
|---|---|
| `html-papers.lua` | The pandoc filter: `\autoref` as numbered links, `\term`, subfigures, captioned blocks as figures, table header rows and notes, live and linked figures, token rows, `\TODO`, and the script tags. HTML and LaTeX from one source. |
| `html-papers.css` | The layout: text column (`body`), right margin for notes, left sidebar, room for the comment column; styles for everything the scripts add. |
| `paper.css` | The look: type, title block, figures, booktabs tables, code, token rows, bibliography. Replace it or follow it with your own. |
| `numeric.csl` | Citations as `[n]` in the HTML, like the PDF's. |
| `popups.js` | Hover a citation, footnote mark, term or cross-reference: its references, footnote, definition, or a copy of the section/figure/table shows in the margin. Links inside a note open notes below it. Click a note (or middle-click the link) to pin it; × closes it. |
| `contents.js` | A contents sidebar from the headings: slides out at the left edge, Pin keeps it open, the current section is highlighted. |
| `live-figures.js` | A figure with a live version: the static image until clicked, then an iframe of the live page, with links to the full page and back. |
| `arxiv-links.js` | In the bibliography, `arXiv:<id>` and the entry's title become links. |
| `review.js` | Review mode: readers press <kbd>E</kbd>, select text, and comment or suggest edits; they export a JSON file and send it to you. Works on any web page, with or without the rest. |
| `collect_reviews.py` | Merges the files reviewers send and lists each comment with the line of the markdown source it is about. |

Each file's header documents its markup, options and API. In short:

## What the page needs

- **Layout**: the text is `body`'s content; nothing else is assumed. Widths are CSS variables
  on `:root` (`--text`, `--gap`, `--note`, `--toc`).
- **Citations and bibliography**: pandoc `--citeproc` output (`.citation[data-cites]`, `#refs`).
- **Footnotes**: pandoc's (`a.footnote-ref`, `.footnotes`).
- **Cross-references**: any link to an id on the page. A heading, `figure` or `table` target
  gets a preview (`data-popups-preview` on the script tag changes which).
- **Terms**: `<a class="term" href="#where" title="The definition.">term</a>`.
- **Table notes**: `<span class="cell-note"><sup>*</sup><span class="cell-note-body" hidden>…</span></span>`
  in a cell.
- **Live figures**: `<div class="fig-static" data-embed="…" data-link="…" data-height="600">`
  around the static image.

pandoc writes the first four on its own; `html-papers.lua` writes the rest from markdown
(`\term{name}`, a footnote in a table cell, `interactive-src` on an image).

## Figures with a live version

```markdown
![Loss of each model.](figures/loss.svg){#fig:loss interactive-src="live/curve.html" interactive-height="330"}
```

On the web page the static image shows until it is clicked; then live-figures.js frames
`interactive-src`, with links to the full page and back to the image. Nothing loads from the
live page before the click. `interactive-embed` names a different page to frame (a view
without the title, say), and `interactive-width` the width that page is laid out for. A page
made to be framed can tell the frame its height: `parent.postMessage({embedHeight: n}, "*")`.

For a live page too heavy to frame, `interactive-link="live/all.html"` alone keeps the figure
a picture and puts an "Open the interactive version" link under it.

The PDF uses the static image and ignores all of these, so a PDF build never fetches the
page. The saved image is the record: export it again when the data or settings change.

## Token rows

````markdown
::: {#fig:continue .generations src="generated/continuations.json"}
Each model continues the same prompt.
:::
````

A numbered figure drawn from a file: a prompt, then a row per model, each token on its own
chip, in both outputs. The file is

```json
{"prompt": ["The", " quick", " brown"],
 "rows": [{"label": "the original", "tokens": [" fox", " jumps"], "end": "cut", "reference": true},
          {"label": "our model", "tokens": [" dog", " sleeps", "."], "end": "eos"}]}
```

`end` is `"eos"` (the model stopped: "end of text"), `"cut"` (the row was cut: "…") or absent.
The row marked `reference` is set apart. A newline in a token shows as ↵ and, after some text,
breaks the line, so code keeps its lines. A term's text inside a label becomes that term.

## How the scripts stay out of each other's way

- Anything a script adds to the page carries `data-doc-chrome`: review.js does not treat it as
  the document's text, popups.js does not look for anchors in it (other than in its own
  notes), and it is `contenteditable="false"`, so review.js's Suggest mode cannot edit it.
- Each margin note carries `data-doc-avoid`: review.js's comment lines pass behind it.
- popups.js dispatches `doclayout` on `document` after laying notes out; review.js redraws its
  lines then.
- review.js sets `html.review-on` and `--review-width`; contents.js sets `html.toc-pinned` and
  `html.toc-open`. Only `html-papers.css` turns these into positions, and only it has
  breakpoints: the scripts read the layout they find.
- popups.js dispatches `popups:preview` (`detail: {box, target}`) before showing a preview's
  copy, so another script can fix the copy up (live-figures.js puts the static image back).
- `window.MarginNotes` (`show`, `hide`, `place`, `narrow`) puts a note of your own in the margin.

Your own additions to the page should follow the first two rules.

## review.js

A review layer for a static page, like comments and suggestion mode in Google Docs or Overleaf. Readers press <kbd>E</kbd> (or open the page with `?review=1`), select text, and comment on it or suggest an edit. Their work stays in their browser (localStorage) until they export it as JSON (copy, download, or email) and send it to you. One file, no dependencies, no server; the page's own text is never changed (suggested insertions are shown in added `<span class="rv-ins">` elements, removed on leaving).

```html
<script src="review.js" defer
  data-review-root="main"
  data-review-ignore="#sidebar"
  data-review-email="me@example.org"></script>
<meta name="review-doc-version" content="<git sha>">
```

Load it with `defer`, or put the tag after the content.

**Options** (`data-` attributes on the script tag, all optional):
- `data-review-root` - CSS selector for the content that gets reviewed (default: `body`)
- `data-review-ignore` - selector for parts of it that are not text to review (popups, sidebars). Elements marked `data-doc-chrome` are skipped without being listed, which covers everything the scripts here add.
- `data-review-email` - address for Export > Email (without it there is no email option)
- `data-review-load` - URL of a review file to show read-only on entry (also `?review-load=path`, which takes only a path on the same site)
- `data-review-start` - `"1"` to enter review mode on load (for a bookmarklet)
- `<meta name="review-doc-version">` - stamped on every export, so you know which version was reviewed

**Using it:**
- Review mode starts in **Comment** mode: the page reads as usual. Select text, then Comment or Suggest edit.
- In **Suggest** mode (the switch in the panel, Suggest edit, or a double-click) the text is editable: typing inserts, Backspace strikes, typing over a selection replaces it. Each edit becomes a suggestion; the page's text never changes. Ctrl/Cmd+Z undoes suggestions (it never touches comments), Ctrl/Cmd+click follows a link, Esc goes back to Comment.
- Comments sit in a column at the right, level with their text. While review mode is on, `<html>` has the class `review-on` and the CSS property `--review-width`, so the page can move its content clear. `html-papers.css` does; on a page without it:

```css
html.review-on body { margin-right: calc(var(--review-width) + 2rem); }
```

- The × on a card deletes it at once; the message that follows has an Undo.
- Import (or drag files onto the panel) shows other reviewers' exports read-only, each in its own color.

**API** (`window.ReviewMode`):

```javascript
ReviewMode.enter();               // review mode on (E does the same)
ReviewMode.setMode(true);         // Suggest mode; false for Comment mode
const data = ReviewMode.exportData();  // this reviewer's review/v1 object; null until they give a name
ReviewMode.importData(data);      // show another reviewer's file read-only; returns [added, skipped]
ReviewMode.exit();
```

**Export format** (`review/v1`): `{format, doc: {url, path, title, commit, dirty, text_length}, reviewer, contact, exported_at, annotations}`. Each annotation has `id`, `kind` (`comment` or `suggestion`), `quote` (`{exact, prefix, suffix}`: the text and 32 characters of context either side), `position` (`{start, end}` offsets into the root's text), `section` (the nearest heading), `body`, `replacement` (suggestions; `exact` is empty for a pure insertion), `status`, `author`, `created`, `updated`, `commit` (the page version it was made on), and `deleted` for one removed after an earlier export. To merge several files, keep the newest `updated` copy of each `id`, then drop the deleted ones.

**Collecting reviews.** Put the files you receive in one folder and run

```bash
uv run html-papers/collect_reviews.py reviews/ --md paper.md -o reviews/merged.json
```

It merges them as above and prints each comment as `paper.md:LINE`, in the order of the
source, with the reviewer, the quoted text and the comment. The line is found from the
quote: exactly where it can be (whitespace and case aside, the surrounding text choosing among
repeats), otherwise approximately, marked `~` (the page's text differs from its source by
emphasis, citations, terms and math, and the source may have changed since). To read the
merged comments in place, put `merged.json` beside the page and open
`index.html?review=1&review-load=merged.json`, or drop the files on Import in the review
panel. Standard library only.

**After the page changes**, each annotation re-attaches to its old offsets, else its quote elsewhere (only where enough of the quote and its surrounding text match: a short quote alone could be anywhere), else the closest fuzzy match (shown as changed), else the text between its unchanged context; failing all of these it is listed as not found.

**Browser support:** highlights need the CSS Custom Highlight API (Chrome 105+, Safari 17.2+, Firefox 140+); without it the comment cards still work. On touch devices the text is not editable (touch keyboards cannot be intercepted), so a suggestion's new text is typed in its card.

## Tests

```bash
uv run playwright install chromium   # once
make test-html
```

- `tests/test_filter.py` runs the filter on small documents and checks the HTML and LaTeX it
  writes (needs pandoc, no browser).
- `tests/test_demo_build.py` builds the demo with its own `build.sh` in a temporary folder
  and checks the result: the experiment's files, that it gives the same files when run again,
  that nothing is unresolved, and that `docs/html-papers/` has the current scripts.
- `tests/test_paper.py` drives `tests/paper-fixture.html`, a page written by hand in pandoc's
  shape, with a real pointer: notes, nesting, pinning, the sidebar, review mode with notes.
- `tests/test-review.html` and `tests/test_review_typing.py` are review.js's own, in the page
  and with real keystrokes.
- `tests/test_pages.py` runs the in-page tests and loads each page of the built demo, failing
  on any error.
- `tests/test_collect_reviews.py`: merging, and finding quotes in the source.

review.js was developed in [js-dev-toolkit](https://github.com/mivanit/js-dev-toolkit) and
moved here on 2026-11-20 (from its commit 5ec127e). It is GPLv3, as it was there.

# html-papers

A paper written in markdown, built as a web page in three columns: the contents, the text,
and a side column for notes, previews of what a link points to, and readers' comments. Figures
can be live, and a reader can edit and run the paper's code on the page. The same file builds
a PDF with the same numbers on its sections, figures, tables
and references.

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

Both copy `demo/` and the scripts and stylesheets of this folder to a folder beside
`docs/html-papers/` (the GitHub Pages site), run the paper's own [`build.sh`](demo/build.sh)
there, and replace the published folder with the result if the build succeeds. `demo/` holds
only the source; nothing built is kept in it.

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
   `paper.css` and `numeric.csl` (the demo's front matter names it: keep it, or take out the
   `csl:` line). Each names this repository in its header; nothing updates the copies.
   `build.sh` finds pandoc-utils two folders up, or at `$PANDOC_UTILS`.
2. Replace the text, `terms.yaml`, `refs.bib` and the experiment (or delete step 1 of
   `build.sh` if nothing is computed).
3. Write. The demo shows each construct beside its source; [the filter](html-papers.lua)'s
   header lists them all.

If the scripts live somewhere else, set `html_papers_dir` in the front matter to their URL
prefix (`html_papers_dir: ../`) and give `--css` the same prefix. The demo's `build.sh` expects
them beside the page: with a prefix, change its check and its `--css` flags, or run the two
commands above yourself.

Without the filter, the scripts still work on any pandoc page built with
`--number-sections --citeproc`; add their tags yourself:

```html
<link rel="stylesheet" href="html-papers.css" />
<link rel="stylesheet" href="paper.css" />  <!-- or your own -->
<script src="arxiv-links.js" defer></script>
<script src="popups.js" defer></script>
<script src="contents.js" defer></script>
<script src="live-figures.js" defer></script>
<script src="run-code.js" defer></script>
<script src="keep-place.js" defer></script>
<script src="review.js" defer data-review-email="me@example.org"></script>
<script src="menu.js" defer></script>  <!-- last: it lists what the others let the reader change -->
```

Each script is one file with no dependencies; take the ones you want.

### Building and publishing

- **Publish together:** the page, both stylesheets, the scripts, and the `figures/` and
  `live/` files it refers to (and a renderer script, if a runnable block names one). Nothing
  else is needed. Nothing is fetched from elsewhere, with one exception: when a reader runs
  code (**Try it**), the browser fetches Python (Pyodide) from a CDN.
- **Equations** are MathML (`--mathml`): they render in current Chrome, Firefox and Safari
  without JavaScript or a CDN. A bare `--mathjax` on Debian's pandoc writes a path that only
  exists on the machine that built the page.
- **Figures:** the page keeps the SVGs. The PDF build converts each to a PDF beside it, and
  again only when the SVG is newer than that PDF. The demo's experiment leaves a figure it
  would not change alone, so running `build.sh` again in the same folder converts nothing
  (`make demo-html-papers` starts from a fresh folder each time).
- **References:** `numeric.csl` numbers the page's citations and orders its list as the PDF
  does. pandoc lower-cases the words of a BibTeX title for the page unless they are in braces:
  write `title = {{Kept As Written}}` to get the title the PDF prints.
- **The version** a page carries (`review-doc-version`, stamped on every exported comment) is
  the git commit, with `-dirty` when a tracked file in the page's folder is modified (the page
  itself aside). A build made away from its sources, as `make demo-html-papers` is, says what
  it was built from in the environment variable `DOC_VERSION`. A page committed with its
  sources names the commit before its own. The demo build instead supplies a `sha256:` hash
  of its source contents, including local edits. Committing or rebuilding the same sources
  preserves that identity; it does not claim a dirty tree is an exact Git revision.
- **A captioned image is a numbered figure.** An image with an empty description
  (`![](logo.svg)`) is an illustration without a number.
- **The PDF** goes through latexmk, which runs LaTeX and biber as often as needed. If a
  reference shows as `??`, look in the final `.log`: the warnings in `.pdlog` are from early
  passes and most are resolved by later ones. `SOURCE_DATE_EPOCH=1` (as in the demo's
  `build.sh`) keeps the date out of the PDF and the converted figures, so they change only
  when their content does.
- **From a file, a page cannot fetch.** A live page that loads data, and `?review-load=` (a
  review file to show), need a server: `python3 -m http.server --directory docs`, then open
  the page at `localhost`. The demo's live pages read their data from a script, so they work
  from a file too.

## Files

| File | What it does |
|---|---|
| `html-papers.lua` | The pandoc filter: `\autoref` as numbered links, `\term`, subfigures, captioned blocks as figures, table header rows and notes, live and linked figures, token rows, `\TODO`, and the script tags. HTML and LaTeX from one source. |
| `html-papers.css` | The layout: contents, text (`body`) and side column, by window width; styles for everything the scripts add. |
| `paper.css` | The look: type, title block, figures, booktabs tables, code, token rows, bibliography. Replace it or follow it with your own. |
| `numeric.csl` | Citations as `[n]` in the HTML, like the PDF's. |
| `popups.js` | Hover a citation, footnote mark, term or cross-reference: its references, footnote, definition, or a copy of the section/figure/table shows in the side column. Links inside a note open notes below it. Click a note (or middle-click the link) to pin it; × closes it. On a touch screen a tap opens the note; on a phone it opens in the text. |
| `contents.js` | The contents, from the headings: the left column, or unpinned a tab that slides out; on a phone a button and a swipe. The current section is highlighted. |
| `live-figures.js` | A figure with a live version: the static image until clicked, then an iframe of the live page, with links to the full page and back. |
| `arxiv-links.js` | In the bibliography, `arXiv:<id>` becomes a link, and so does the title of an entry that has an address. |
| `run-code.js` | A code block with `run=`: a **Try it** button opens the code in the side column, where the reader edits it, gives it input and runs it, in Python in the browser. |
| `keep-place.js` | When the text reflows (a column resized, the window resized), scrolls so the words at the middle of the window stay where they were. |
| `menu.js` | The settings, on <kbd>M</kbd> or the ⚙ beside the contents' Pin: the widths of the text and the columns, lines on or off, hover notes on or off, whether open notes are remembered. |
| `review.js` | Review mode: readers press <kbd>E</kbd>, select text, and comment or suggest edits; they export a JSON file and send it to you. Works on any web page, with or without the rest. |
| `collect_reviews.py` | Merges the files reviewers send and lists each comment with the line of the markdown source it is about. |

Each file's header documents its markup, options and API. In short:

## What the page needs

- **Layout**: the text is `body`'s content; nothing else is assumed. Widths are CSS variables
  on `:root` (`--toc`, `--side`, `--gap`, `--pad`, `--text-min`, `--text-max`).
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

For additional table header rows, wrap one table in a fenced div:

````markdown
::: {table-header-rows="1"}

| name | score |
|---|---|
| **sample count** | 100 |
| first | 0.8 |

: Scores.

:::
````

The count is the number of leading body rows to move into the existing header, in both
HTML and PDF. Bold cell text alone no longer promotes rows. Documents using the previous
bold-first-cell rule should add this wrapper with the intended count. Footnotes in captions
remain ordinary numbered footnotes; only cell footnotes become asterisks.

## Layout

Three columns: the contents at the left, the text, and a side column at the right that holds
the notes and previews and, in review mode, the comments.

| Window | |
|---|---|
| from 62rem (992px) | All three. **Unpin** folds the contents into a tab at the left edge; they slide out while the pointer is there. |
| from 760px | Text and side column. The contents slide out over the text. |
| below 760px | The text alone. A tap on a link opens its note in the text, under the paragraph (a second tap closes it). The contents open from a round button, or a swipe to the right. |

- **Resizing.** The right edge of the contents and the left edge of the side column drag; a
  double click puts one back. Both widths (and the pin) are remembered in the browser. The
  text takes what is left, up to `--text-max`; text and side column are centred together.
  A column can be dragged as wide as the window allows: the text gives way down to
  `--text-min` (22rem), the side column down to 10rem, the contents down to 8rem, so whatever
  was dragged, nothing runs off the page. Until the side column is dragged, it and the text
  narrow together with the window.
- **The reader's place.** A narrower or wider text breaks its lines elsewhere, which moves
  everything below. keep-place.js remembers the words at the middle of the window and, after
  the text's width changed, scrolls so they are where they were.
- **One column, in the order of the text.** Notes, previews and comments are one stack: each
  sits level with the place in the text it belongs to, or below the one before it. A note
  opened from a note goes right under that note.
- **Lines.** The link of an open note is tinted. A dot at the end of its line of text starts a
  line that curves through the gutter to the note; it never runs over the text, and because
  the column is in the order of the text, lines do not cross. With the pointer on a note, its
  link and its line are stronger. Comments have the same lines.
- **Remembered.** The notes a reader pinned are there on the next visit (per page, in the
  browser's storage).
- **Settings.** <kbd>M</kbd>, or the ⚙ beside Pin, opens a menu: the text's width, each
  column's width, lines on or off, whether a note opens when the pointer rests on a link (off:
  a click opens it), whether open notes are remembered, and Reset.
- **Touch.** Where no pointer can rest on a link (`hover: none`), one tap opens the note, with
  the link itself ("Go to Figure 3") inside it.
- **Keyboard.** Tab reaches the controls. Space on a citation, term or cross-reference opens
  its note and focuses Close; Escape closes it and returns to the link. Enter follows a
  term or cross-reference as usual. Table notes have a `*` button, and live figures have an
  **Open interactive figure** button. On a phone the live figure opens in a dialog; Close
  (or Escape while on its controls) returns to its button. **Review** beside the contents
  opens review mode without a keyboard; <kbd>E</kbd> still works too.
- **Previews.** A copy of a figure or table is laid out as wide as it is in the text and
  scaled to fit the note, down to 30%, so it has no scrollbar. A copy of a section is text
  and scrolls.
- **Comments.** review.js puts its cards in the side column, in the same stack as the notes.
  Its panel is only its title row there, so it does not cover them; it opens under the
  pointer, or on a click.

To change the defaults, set the variables after `html-papers.css`:

```css
:root { --toc: 13rem; --side: 22rem; --text-max: 40rem; }
```

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

## Code that runs

A code block the reader can run on the page:

````markdown
```{.python include="model.py" run="driver.py" run-files="model.py data/words.txt" run-stdin="some words"}
```
````

The block shows its own code (here `model.py`, through `include-code-files.lua`). `run` names
the file that runs, which may be another: a short driver that reads the input, calls the code
shown and prints. `run="model.py"` runs the file shown, and `.run` (or `run=""`) runs a block
written in the markdown itself.

| | |
|---|---|
| `run-files="a.py data/b.txt"` | Files the code imports or reads. |
| `run-stdin="text"` | The input it starts with (`\n` is a new line). Or `run-stdin-file="in.txt"`. |
| `run-render="draw.js"` | A script of yours that draws the output. Without it the output is shown as printed. |
| `run-packages="a-package"` | Packages to install from PyPI. Not needed for what Pyodide ships (numpy, matplotlib, pandas, ...): those are loaded when the code imports them. |
| `run-output="out.txt"` | A file holding what a run printed, made by your build. It is printed under the block, on the page and in the PDF. |

- **On the page** the block gets a **Try it** button. It opens a panel in the side column (in
  the text on a phone) and runs the code: a tab for each file, each editable, a box for the
  input, **Run**, **Stop**, **Reset**, and the output. Ctrl/Cmd+Enter runs. Python is
  coloured as the page's listings are, and long lines wrap.
- **In the PDF** the block is a listing. With `run-output` the output is under it; without,
  the code alone. That is the choice per block: give `run-output` where the paper should show
  a result, and have the build make the file by running the same script on the same input
  (`demo/build.sh` does: `python sentence_loss.py <run/sentence.txt >generated/sentence-loss.txt`).
- **The files are in the page.** The filter reads each at build time and puts its text in the
  page, at its path relative to the document, so what runs is what the build read, and a page
  opened from a file works. Paths must be below the document's folder. Write scripts so they
  run from that folder, and they run the same way in the build and in the page.
- **Python is [Pyodide](https://pyodide.org)**, in a worker, fetched from jsDelivr the first
  time **Try it** is pressed (a few MB, then cached; matplotlib is a larger download). Nothing is
  fetched before that. The version is pinned in `run-code.js`; `pyodide_url` in the front
  matter (the address of a `pyodide.mjs`) points it at another version or at your own copy.
- **Output.** Standard output as printed, standard error under it, then any matplotlib figure
  the code left open (collected as PNGs; the backend is Agg). An error shows its traceback,
  starting at the reader's file.
- **A renderer** is a script that calls `RunCode.render(function (result, el) { ... })`, with
  `result = {stdout, stderr, exit, images, seconds, stdin}` and `el`, an empty element to
  fill. It is loaded when first needed and called after a run that ended without an error;
  after any other run, or if it throws, the output is shown as printed. `demo/run/chips.js`
  draws a JSON object the script prints as rows of token chips.
- **Another language.** `RunCode.interpreter` is `{run(job, on)}`; replace it and the panel
  runs something else. The tests replace it with a stub.

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
breaks the line, so code keeps its lines. A term's text inside a label becomes that term. A
token stays intact in the PDF when it fits the column; an oversized token can wrap between
characters. Characters unsupported by the PDF engine or font remain identifiable as Unicode
markers such as `[U+2581]` for `▁`, rather than stopping the build or disappearing.

## How the scripts stay out of each other's way

- Script controls carry `data-doc-chrome`; review.js excludes these, `.margin-note` and its
  own `#rv-host` from the document's text. Notes stay excluded when placed inline on phones.
  Controls and notes are `contenteditable="false"`. Notes still allow popup links inside them.
- Each note carries `data-doc-avoid`: review.js's comment lines pass behind it, and
  `data-doc-reserve`: review.js's cards keep clear of it.
- `html-papers.css` says where the side column is, in `--doc-side-left` and
  `--doc-side-width`: review.js puts its cards there instead of in a column of its own.
- popups.js lays out the whole side column (`window.MarginNotes.column`). Before it does, it
  dispatches `doccolumn` on `document` with `detail.items`, an empty list: a script with boxes
  of its own for the column adds `{top, left, height, place(top)}` for each (where its anchor
  is and how tall it is, page coordinates), and `place` is called with where it goes.
  review.js gives its cards this way. Without popups.js it places them itself.
- `doclayout` on `document` says that things beside the text moved: popups.js dispatches it
  after every layout (review.js draws its lines then), and contents.js and menu.js when they
  move the text (popups.js lays the column out again).
- A script adds what the reader can change to `window.DocOptions` (`{label, type, get, set,
  ...}`, described in `menu.js`); menu.js lists them. Each script applies and remembers its
  own, so all of it works without the menu. `html.lines-off` turns the lines off.
- review.js sets `html.review-on`; contents.js sets `html.toc-pinned`, `html.toc-open` and
  `--toc`; popups.js sets `--side`. Only `html-papers.css` turns these into positions, and it
  has the breakpoints: popups.js and contents.js read the layout they find. review.js has one
  of its own (below 760px its cards go in a sheet at the bottom), which the stylesheet's
  phone layout matches.
- popups.js dispatches `popups:preview` (`detail: {box, target}`) before showing a preview's
  copy, so another script can fix the copy up (live-figures.js puts the static image back).
- `window.MarginNotes` (`show`, `hide`, `place`, `narrow`) puts a note of your own in the margin
  (run-code.js and live-figures.js do); a note that is closed gets a `noteclose` event.
- In the browser's storage: `toc-pinned`, `toc-width`, `side-width`, `text-width`, `lines`,
  `notes-hover`, `notes-remember`, and `notes-open:<path of the page>`.

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
- Comments sit in a column at the right, level with their text. With `html-papers.css` that is the page's side column, shared with the notes: popups.js places the cards among them, and the panel shrinks to its title row (the pointer, the focus, a click on the title, or Suggest mode opens it). On a page without it, review.js makes a column of its own: while review mode is on, `<html>` has the class `review-on` and the CSS property `--review-width`, so the page can move its content clear:

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
make test-html-firefox               # the same in Firefox (once: uv run playwright install firefox)
make test-html-webkit                # WebKit engine (once: uv run playwright install --with-deps webkit)
make test-html-pyodide               # the demo's runnable code in the real Python (needs the network)
```

- `tests/test_filter.py` runs the filter on small documents and checks the HTML and LaTeX it
  writes (needs pandoc, no browser).
- `tests/test_demo_build.py` builds the demo with its own `build.sh` in a temporary folder
  and checks the result: the experiment's files, that it gives the same files when run again,
  that nothing is unresolved, that `docs/html-papers/` is what the sources build now, and
  which version a page says it was built from.
- `tests/test_paper.py` drives `tests/paper-fixture.html`, a page written by hand in pandoc's
  shape, with a real pointer and, for the phone and tablet layouts, real touches: notes,
  nesting, pinning, the columns at every width, dragging their edges, the lines, remembered
  notes, the menu, comments in the side column, notes in the text, the swipe, and code that
  runs (with a stub in place of Python).
- `tests/test-review.html` and `tests/test_review_typing.py` are review.js's own, in the page
  and with real keystrokes.
- `tests/test_pages.py` runs the in-page tests and loads each page of the built demo, failing
  on any error. With `HTML_PAPERS_PYODIDE=1` it also runs the demo's code in the real Python:
  the page prints what the build printed, shows a traceback, stops a loop, draws a chart.
- `tests/test_collect_reviews.py`: merging, and finding quotes in the source.
- `tests/hp_paths.py` and `tests/hp_fixtures.py` hold what these share (not a `conftest.py`:
  `tests/` at the repository root has one, and `uv run pytest` runs both folders).

review.js was developed in [js-dev-toolkit](https://github.com/mivanit/js-dev-toolkit) and
moved here on 2026-11-20 (from its commit 5ec127e). It is GPLv3, as it was there.
The original license text is included in [COPYING.review](COPYING.review) and copied beside
the published demo. This records review.js's existing license; it does not establish a
repository-wide license for the other files.

Browser tests select their engine with `HTML_PAPERS_BROWSER` (Chromium by default). Tap tests
run in all three engines. Native swipe and IME injection tests still require Chromium's
protocol and are explicitly skipped elsewhere. WebKit coverage is not a test of the Safari
application or physical iOS devices.

Page preferences use `html-papers:v1:` storage keys. Existing unprefixed values are copied on
first read, then ignored; resetting a preference does not restore its legacy value. Legacy
keys are left untouched for other pages. Layout preferences remain shared across papers on
the same origin; open notes remain scoped to the document path.

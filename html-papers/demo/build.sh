#!/usr/bin/env bash
# Build this paper in the folder it is in:  ./build.sh [html|pdf|all]
#   html  the web page, index.html (a few seconds)
#   pdf   paper.pdf (LaTeX, biber, inkscape)
# The html-papers scripts and stylesheets must be beside it (`make demo-html-papers` copies
# them), and pandoc-utils two folders up or at $PANDOC_UTILS.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PANDOC_UTILS="$(cd "${PANDOC_UTILS:-$here/../..}" && pwd)"
cd "$here"
what="${1:-all}"
case "$what" in html | pdf | all) ;; *) echo "usage: build.sh [html|pdf|all]" >&2; exit 2 ;; esac
run() { uv run --project "$PANDOC_UTILS" "$@"; }

if [[ ! -f popups.js || ! -f html-papers.css ]]; then
	echo "build.sh: copy $PANDOC_UTILS/html-papers/{*.js,*.css,numeric.csl} to $PWD first" >&2
	exit 1
fi

# 1. The experiment: reads paper.md, writes figures/, generated/ and live/data.js.
run python -B experiment.py
# The code a reader can run in the page runs here first, on the input the page starts it
# with: a driver that broke stops the build, and the second one's output is in the paper.
run python -B continue_text.py <<<"the build" >/dev/null
run python -B sentence_loss.py <run/sentence.txt >generated/sentence-loss.txt

# 2. The web page. The front matter's __defaults__ block names the filters and the terms file.
if [[ $what == html || $what == all ]]; then
	run "$PANDOC_UTILS/markdown_get_defaults_yaml.py" paper.md \
		--defaults-file _pandoc_defaults.paper.yml
	run pandoc paper.md --defaults _pandoc_defaults.paper.yml \
		--from markdown+footnotes+inline_notes --to html5 --standalone \
		--citeproc --mathml --css html-papers.css --css paper.css --output index.html
fi

# 3. The PDF, from the same file. SOURCE_DATE_EPOCH keeps today's date out of it, so the
#    PDF changes only when the paper does.
if [[ $what == pdf || $what == all ]]; then
	SOURCE_DATE_EPOCH=1 bash "$PANDOC_UTILS/pandoc_md_pdf.sh" paper.md
fi

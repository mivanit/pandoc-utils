#!/usr/bin/env bash
# Build this paper in the folder it is in:  ./build.sh [html|pdf|all]
#   html  the web page, index.html (a few seconds)
#   pdf   paper.pdf (LaTeX, biber, inkscape)
# The html-papers scripts and stylesheets must be beside it (`make demo-html-papers` copies
# them), and pandoc-utils two folders up or at $PANDOC_UTILS.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
PANDOC_UTILS="${PANDOC_UTILS:-$(cd ../.. && pwd)}"
what="${1:-all}"
run() { uv run --project "$PANDOC_UTILS" "$@"; }

if [[ ! -f popups.js || ! -f html-papers.css ]]; then
	echo "build.sh: copy $PANDOC_UTILS/html-papers/{*.js,*.css,numeric.csl} to $PWD first" >&2
	exit 1
fi

# 1. The experiment: reads paper.md, writes figures/, generated/ and live/data.js.
run python -B experiment.py

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

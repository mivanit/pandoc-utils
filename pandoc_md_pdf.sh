set -euo pipefail

# resolve paths relative to this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# defining commands
PANDOC_EXT="markdown+footnotes+inline_notes"
PANDOC_CMD="pandoc -f $PANDOC_EXT -t latex -s"

# DEFAULTS_FILE="_pandoc_defaults.yml"
DEFAULTS_PRE="_pandoc_defaults."
DEFAULTS_SUF=".yml"
GET_DEFAULTS_PY_PATH="$SCRIPT_DIR/markdown_get_defaults_yaml.py"
FILTERS_DIR="$SCRIPT_DIR/filters"

# initial processing

# optional -b forces biblatex on regardless of front matter; strip it out so the
# markdown file remains "$1" (the VS Code keybinding passes -b as a trailing arg)
FORCE_BIBLATEX=0
POSITIONAL=()
for arg in "$@"; do
	case "$arg" in
		-b) FORCE_BIBLATEX=1 ;;
		*) POSITIONAL+=("$arg") ;;
	esac
done
set -- "${POSITIONAL[@]}"

# var_basename=$(echo "$1" | cut -f 1 -d '.')
# var_filetype=${1#*.}
var_basename="${1%.md}"

echo "# processing basename: $var_basename"
# echo "# read file extension: $var_filetype"
# if [ "$var_filetype" != "md" ]; then

if [[ $var_basename == *tex ]]; then
	echo "# ERROR: invalid file extension, should not be 'tex': '$var_basename'"
	exit 1
fi

# biblatex processing: enable only when the document actually declares a
# bibliography, otherwise pandoc emits \printbibliography with no source and biber
# fails.

# First grab the YAML front matter: the block between the first two '---' lines.
front_matter="$(awk '
	NR == 1 && $0 != "---" { exit }    # first line is not "---" -> no front matter
	NR > 1  && $0 == "---" { exit }    # reached the closing "---" -> stop
	NR > 1                 { print }   # in between -> print the front-matter line
' "$1")"

# Then look for a top-level bibliography declaration in that front matter. A
# commented '# bibliography:' or an occurrence in the document body will not match.
#   regex '^(bibliography|references):' means:
#     ^                          start of the line
#     (bibliography|references)   the literal word "bibliography" or "references"
#     :                          immediately followed by a colon
bib_declaration_regex='^(bibliography|references):'
if [[ $FORCE_BIBLATEX -eq 1 ]] || grep --quiet --extended-regexp "$bib_declaration_regex" <<<"$front_matter"; then
	PANDOC_CMD="$PANDOC_CMD --biblatex"
	echo "# biblatex: enabled"
else
	echo "# biblatex: disabled"
fi

# defaults processing
DEFAULTS_FILE="$DEFAULTS_PRE$var_basename$DEFAULTS_SUF"
echo "# trying to generate $DEFAULTS_FILE from yaml front matter"
(set -x; uv run --project "$SCRIPT_DIR" "$GET_DEFAULTS_PY_PATH" "$1" --defaults-file "$DEFAULTS_FILE" --filters-dir "$FILTERS_DIR")
if test -f "$DEFAULTS_FILE"; then
	echo "# found file, using as default: $DEFAULTS_FILE"
	PANDOC_CMD="$PANDOC_CMD --defaults $DEFAULTS_FILE"
fi

# compilation

(set -x; uv run --project "$SCRIPT_DIR" $PANDOC_CMD "$1" -o "$var_basename.tex")
echo "# converted to .tex"

# compilation: latexmk runs pdflatex + biber/bibtex as many passes as needed
LATEXMK="latexmk -pdf -synctex=1 -interaction=nonstopmode -file-line-error"
if ! (set -x; $LATEXMK "$var_basename.tex" > "$var_basename.pdlog"); then
	echo "# ERROR: latexmk failed. LaTeX errors from $var_basename.log:" >&2
	# Pull the real TeX errors out of the log and skip the font-path noise that
	# fills its tail. In the log an error line is one of:
	#   - a line starting with '!'          (a plain TeX error), or
	#   - 'file:line: message'              (because we pass -file-line-error)
	# so the regex '^(!|.+:[0-9]+: )' means:
	#     ^              start of the line
	#     (              match EITHER
	#       !              a literal '!'
	#       |            OR
	#       .+:[0-9]+:    one-or-more chars, ':', one-or-more digits, ':', then a space
	#     )
	# --after-context=6 also prints the 6 lines after each match, enough to include
	# the 'l.NN' line that pinpoints the source location.
	tex_error_regex='^(!|.+:[0-9]+: )'
	if [[ -f "$var_basename.log" ]] && grep --extended-regexp --after-context=6 "$tex_error_regex" "$var_basename.log" >&2; then
		: # matching error blocks were printed above
	else
		# nothing matched (or the .log is missing): don't hide anything, fall back
		# to the last 30 lines of latexmk's own captured output
		echo "# no explicit LaTeX error lines found; tail of $var_basename.pdlog:" >&2
		tail --lines=30 "$var_basename.pdlog" >&2
	fi
	echo "# full logs: $var_basename.log and $var_basename.pdlog" >&2
	exit 1
fi
echo "# compiled pdf (bibliography resolved automatically by latexmk)"

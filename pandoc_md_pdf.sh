set -euo pipefail

# resolve paths relative to this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# defining commands
PANDOC_EXT="markdown+footnotes+inline_notes"
PANDOC_CMD="pandoc -f $PANDOC_EXT -t latex -s --biblatex"

# DEFAULTS_FILE="_pandoc_defaults.yml"
DEFAULTS_PRE="_pandoc_defaults."
DEFAULTS_SUF=".yml"
GET_DEFAULTS_PY_PATH="$SCRIPT_DIR/markdown_get_defaults_yaml.py"
FILTERS_DIR="$SCRIPT_DIR/filters"

TEX_COMPILE="pdflatex -synctex=1 -interaction=nonstopmode -file-line-error"
BIB_COMPILE="biber"

# initial processing

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

# defaults processing
DEFAULTS_FILE="$DEFAULTS_PRE$var_basename$DEFAULTS_SUF"
echo "# trying to generate $DEFAULTS_FILE from yaml front matter"
(set -x; uv run "$GET_DEFAULTS_PY_PATH" "$1" --defaults-file "$DEFAULTS_FILE" --filters-dir "$FILTERS_DIR")
if test -f "$DEFAULTS_FILE"; then
	echo "# found file, using as default: $DEFAULTS_FILE"
	PANDOC_CMD="$PANDOC_CMD --defaults $DEFAULTS_FILE"
fi

# compilation

(set -x; $PANDOC_CMD "$1" -o "$var_basename.tex")
echo "# converted to .tex"

(set -x; $TEX_COMPILE "$var_basename.tex" > "$var_basename.pdlog")
echo "# compiled pdf"

# compilation, with biber

var_bib=false
for arg in "$@"; do
	if [[ "$arg" == "-b" ]]; then
		var_bib=true
		break
	fi
done

if [[ "$var_bib" == true ]]; then
	echo "# updating bibliography as well..."

	(set -x; $BIB_COMPILE "$var_basename" >> "$var_basename.pdlog")
	echo "# compiled bib"

	(set -x; $TEX_COMPILE "$var_basename.tex" >> "$var_basename.pdlog")
	echo "# compiled pdf (again)"
fi

var_basename="${1%.md}"
echo "$var_basename"
pandoc -f markdown -t latex -s --biblatex "$1" -o "$var_basename.tex"

var_basename=$(echo "$1" | cut -f 1 -d '.')
echo "$var_basename"
pandoc -f markdown -t latex -s --biblatex $1 -o $var_basename.tex


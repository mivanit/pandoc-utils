"""Where things are, for the html-papers tests."""

from pathlib import Path

HTML_PAPERS: Path = Path(__file__).parent.parent
REPO: Path = HTML_PAPERS.parent
# what a page needs beside it: the scripts, the stylesheets, the citation style
SHARED: list[str] = [
    *sorted(p.name for p in HTML_PAPERS.glob("*.js")),
    *sorted(p.name for p in HTML_PAPERS.glob("*.css")),
    "numeric.csl",
]

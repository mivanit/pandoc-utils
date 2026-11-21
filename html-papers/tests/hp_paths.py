"""Where things are, for the html-papers tests, and which browser runs them."""

import os
from pathlib import Path

# HTML_PAPERS_BROWSER=firefox runs the page tests there (once: uv run playwright install firefox)
BROWSER: str = os.environ.get("HTML_PAPERS_BROWSER", "chromium")
# HTML_PAPERS_PYODIDE=1 also runs the demo's code in the real Python, fetched from its CDN
PYODIDE: bool = bool(os.environ.get("HTML_PAPERS_PYODIDE"))

HTML_PAPERS: Path = Path(__file__).parent.parent
REPO: Path = HTML_PAPERS.parent
# what a page needs beside it: the scripts, the stylesheets, the citation style
SHARED: list[str] = [
    *sorted(p.name for p in HTML_PAPERS.glob("*.js")),
    *sorted(p.name for p in HTML_PAPERS.glob("*.css")),
    "numeric.csl",
    "COPYING.review",
]

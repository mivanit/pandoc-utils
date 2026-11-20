"""Shared fixtures: the demo paper, built once per test run."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

HTML_PAPERS: Path = Path(__file__).parent.parent
REPO: Path = HTML_PAPERS.parent
SHARED: list[str] = [
    *sorted(p.name for p in HTML_PAPERS.glob("*.js")),
    *sorted(p.name for p in HTML_PAPERS.glob("*.css")),
    "numeric.csl",
]


@pytest.fixture(scope="session")
def built_demo(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """demo/ built as `make demo-html-papers-html` builds it, in a temporary folder."""
    out: Path = tmp_path_factory.mktemp("demo") / "html-papers"
    shutil.copytree(HTML_PAPERS / "demo", out)
    for name in SHARED:
        shutil.copy(HTML_PAPERS / name, out / name)
    result: subprocess.CompletedProcess[str] = subprocess.run(
        ["bash", str(out / "build.sh"), "html"],
        env={**os.environ, "PANDOC_UTILS": str(REPO)},
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "WARNING" not in result.stderr, result.stderr
    return out

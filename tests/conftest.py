import json
import os
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
FILTERS_DIR = REPO_ROOT / "filters"


@pytest.fixture
def tmp_workdir(tmp_path):
    """Change to a temp directory for tests that produce output files."""
    orig = os.getcwd()
    os.chdir(tmp_path)
    yield tmp_path
    os.chdir(orig)


def run_pandoc(
    markdown: str,
    *,
    filter_path: str | Path | None = None,
    to: str = "latex",
    extra_args: list[str] | None = None,
    cwd: str | Path | None = None,
) -> str:
    """Run pandoc on a markdown string and return the output."""
    cmd = ["pandoc", "-f", "markdown", "-t", to]
    if filter_path is not None:
        cmd.extend(["--filter", str(filter_path)])
    if extra_args:
        cmd.extend(extra_args)
    result = subprocess.run(
        cmd,
        input=markdown,
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"pandoc failed (rc={result.returncode}):\n{result.stderr}"
        )
    return result.stdout


def run_pandoc_json(
    markdown: str,
    *,
    filter_path: str | Path | None = None,
    extra_args: list[str] | None = None,
    cwd: str | Path | None = None,
) -> dict:
    """Run pandoc and return the AST as a JSON dict."""
    output = run_pandoc(
        markdown,
        filter_path=filter_path,
        to="json",
        extra_args=extra_args,
        cwd=cwd,
    )
    return json.loads(output)

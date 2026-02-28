import json
import os
import shutil
import subprocess
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT: Path = Path(__file__).resolve().parent.parent
FILTERS_DIR: Path = REPO_ROOT / "filters"
TEMP_DIR: Path = REPO_ROOT / "tests" / ".temp"


@pytest.fixture
def temp_dir(request: pytest.FixtureRequest) -> Path:
    """Provide a per-test temp directory under tests/.temp/ for inspecting outputs."""
    d: Path = TEMP_DIR / request.node.name
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True)
    return d


@pytest.fixture
def tmp_workdir(temp_dir: Path) -> Generator[Path, None, None]:
    """Change to a temp directory for tests that produce output files."""
    orig: str = os.getcwd()
    os.chdir(temp_dir)
    yield temp_dir
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
        raise RuntimeError(f"pandoc failed (rc={result.returncode}):\n{result.stderr}")
    return result.stdout


def run_pandoc_json(
    markdown: str,
    *,
    filter_path: str | Path | None = None,
    extra_args: list[str] | None = None,
    cwd: str | Path | None = None,
) -> dict[str, Any]:
    """Run pandoc and return the AST as a JSON dict."""
    output = run_pandoc(
        markdown,
        filter_path=filter_path,
        to="json",
        extra_args=extra_args,
        cwd=cwd,
    )
    return json.loads(output)

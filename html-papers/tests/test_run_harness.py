"""Exercise the runner's Python harness locally, without downloading Pyodide."""

from pathlib import Path
import subprocess
import sys

from hp_paths import HTML_PAPERS


def test_repeated_runs_reload_packages_and_restore_directory(tmp_path: Path) -> None:
    source = (HTML_PAPERS / "run-code.js").read_text()
    harness = source.split("const HARNESS = String.raw`", 1)[1].split("`;", 1)[0]
    (tmp_path / "pkg").mkdir()
    (tmp_path / "pkg/__init__.py").write_text("VALUE = 1\n")
    (tmp_path / "main.py").write_text(
        "import pkg, os, sys\nprint(pkg.VALUE)\nos.chdir('pkg')\nsys.path.clear()\n"
    )
    check = """
from pathlib import Path
assert _run_code('main.py', '')[0] == 0
Path(_RUN_DIR, 'pkg/__init__.py').write_text('VALUE = 2\\n')
assert _run_code('main.py', '')[0] == 0
"""
    result = subprocess.run(
        [sys.executable, "-c", harness + check],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout == "1\n2\n"
    assert not result.stderr

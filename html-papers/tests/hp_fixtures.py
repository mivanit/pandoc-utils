"""The demo paper, built once per test run. A test module that needs it says
`pytest_plugins = ["hp_fixtures"]`.

Not a conftest.py: the repository's other test folder has one, and its tests import from it by
name, so a second module called conftest breaks a run of both folders together.
"""

import os
import shutil
import subprocess
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from collections.abc import Iterator

import pytest

from hp_paths import HTML_PAPERS, REPO, SHARED


@pytest.fixture
def paper_url() -> Iterator[str]:
    """Storage tests need an HTTP origin: file:// storage semantics are browser-specific."""
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(HTML_PAPERS))
    )
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/tests/paper-fixture.html"
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.fixture(scope="session")
def built_demo(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """demo/ built as `make demo-html-papers-html` builds it, in a temporary folder."""
    out: Path = tmp_path_factory.mktemp("demo") / "html-papers"
    shutil.copytree(HTML_PAPERS / "demo", out)
    for name in SHARED:
        shutil.copy(HTML_PAPERS / name, out / name)
    result: subprocess.CompletedProcess[str] = subprocess.run(
        ["bash", str(out / "build.sh"), "html"],
        env={
            **os.environ,
            "PANDOC_UTILS": str(REPO),
            "DOC_VERSION": subprocess.check_output(
                ["python3", str(HTML_PAPERS / "source_version.py")], text=True
            ).strip(),
        },
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "WARNING" not in result.stderr, result.stderr
    return out

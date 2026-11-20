"""Run the in-page test files (test-*.html, on test-framework.js) and smoke-test the demo's pages.

Each test page sets window.TEST_RESULTS when done. Any console error or warning, page error or
failed test fails the run.
"""

from pathlib import Path

import pytest
from playwright.sync_api import ConsoleMessage, Error, sync_playwright

HERE: Path = Path(__file__).parent
TEST_PAGES: list[Path] = sorted(HERE.glob("test-*.html"))
# the pages of the built demo paper (the `built_demo` fixture), relative to its folder
DEMO_PAGES: list[str] = [
    "index.html",
    "live/curve.html",
    "live/words.html",
]


def load(page_file: Path, wait_for_results: bool) -> dict | None:
    """Open a page in headless Chromium; raise on any console error/warning or page error."""
    problems: list[str] = []

    def on_console(msg: ConsoleMessage) -> None:
        if msg.type in ("error", "warning"):
            problems.append(f"console {msg.type}: {msg.text}")

    def on_error(err: Error) -> None:
        problems.append(f"page error: {err}")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("console", on_console)
        page.on("pageerror", on_error)
        page.goto(page_file.absolute().as_uri(), wait_until="networkidle")
        results: dict | None = None
        if wait_for_results:
            page.wait_for_function("window.TEST_RESULTS !== undefined", timeout=30000)
            results = page.evaluate("window.TEST_RESULTS")
        else:
            page.wait_for_timeout(500)
        browser.close()
    assert not problems, problems
    return results


@pytest.mark.parametrize("page_file", TEST_PAGES, ids=lambda f: f.stem)
def test_page(page_file: Path) -> None:
    results: dict | None = load(page_file, wait_for_results=True)
    assert results is not None
    assert results["failed"] == 0, f"{results['failed']} of {results['total']} failed"


@pytest.mark.parametrize("name", DEMO_PAGES)
def test_demo(name: str, built_demo: Path) -> None:
    load(built_demo / name, wait_for_results=False)

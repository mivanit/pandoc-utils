"""Run the in-page test files (test-*.html, on test-framework.js) and smoke-test the demo's pages.

Each test page sets window.TEST_RESULTS when done. Any console error or warning, page error or
failed test fails the run.
"""

from pathlib import Path

import pytest
from playwright.sync_api import ConsoleMessage, Error, sync_playwright

from hp_paths import BROWSER, PYODIDE

pytest_plugins = ["hp_fixtures"]  # the built_demo fixture

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
        browser = getattr(p, BROWSER).launch()
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


@pytest.mark.skipif(
    not PYODIDE, reason="fetches Python from its CDN: set HTML_PAPERS_PYODIDE=1"
)
def test_the_demo_code_runs_in_real_python(built_demo: Path) -> None:
    """The page's Python prints what the build's Python printed, draws, and can be stopped."""
    errors: list[str] = []
    with sync_playwright() as p:
        browser = getattr(p, BROWSER).launch()
        page = browser.new_page(viewport={"width": 1600, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto((built_demo / "index.html").absolute().as_uri())

        def run(block: int, patience: int = 240):
            """Open a block's panel, which runs it; the panel, once the run has ended."""
            page.locator(".run-open").nth(block).click()
            panel = page.locator(".run-panel")
            panel.locator(".run-status", has_text="Ran in").wait_for(
                timeout=patience * 1000
            )
            return panel

        # the model continues the words it is given: the page's own script draws the chips
        panel = run(0)
        assert panel.locator(".run-rendered .gen-row").count() == 5
        assert panel.locator(".run-rendered .tok").count() > 10
        page.locator(".run-open").nth(0).click()
        # the same script on the same input as the build: the same lines
        panel = run(1)
        assert (
            panel.locator(".run-stdout").text_content()
            == (built_demo / "generated/sentence-loss.txt").read_text()
        )
        # an error in edited code: its traceback, from the reader's file down
        editor = panel.locator(".run-editor")
        editor.fill(editor.input_value() + "\nundefined_name\n")
        panel.locator(".run-go").click()
        panel.locator(".run-status", has_text="error").wait_for(timeout=30000)
        trace: str = panel.locator(".run-stderr").text_content() or ""
        assert "NameError" in trace and 'File "sentence_loss.py"' in trace
        assert "runpy" not in trace and "_run_code" not in trace
        # a loop that never ends: Stop ends it, and the next run works
        editor.fill("while True:\n    pass\n")
        panel.locator(".run-go").click()
        panel.locator(".run-status", has_text="Running").wait_for(timeout=30000)
        panel.locator(".run-stop").click()
        assert panel.locator(".run-status").text_content() == "Stopped"
        editor.fill("print(6 * 7)\n")
        panel.locator(".run-go").click()
        panel.locator(".run-status", has_text="Ran in").wait_for(timeout=120000)
        assert panel.locator(".run-stdout").text_content() == "42\n"
        page.locator(".run-open").nth(1).click()
        # matplotlib, fetched because the script imports it: the figure it left open
        panel = run(2)
        assert "The ten most used:" in (
            panel.locator(".run-stdout").text_content() or ""
        )
        assert panel.locator(".run-image").count() == 1
        # a package from PyPI (the fixture page asks for a small one): installed, then imported
        page.goto((HERE / "paper-fixture.html").absolute().as_uri())
        page.locator("#run-two .run-open").click()
        panel = page.locator(".run-panel")
        panel.locator(".run-status", has_text="Ran in").wait_for(timeout=240000)
        panel.locator(".run-editor").fill("import cowsay\nprint(cowsay.__name__)\n")
        panel.locator(".run-go").click()
        panel.locator(".run-stdout", has_text="cowsay").wait_for(timeout=60000)
        assert panel.locator(".run-stdout").text_content() == "cowsay\n"
        browser.close()
    assert not errors, errors

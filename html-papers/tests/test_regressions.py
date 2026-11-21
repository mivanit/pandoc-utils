"""Regressions found by reviewing generated pages and interactions between scripts."""

import json
import re
import shutil
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

from hp_paths import BROWSER, HTML_PAPERS, SHARED
import test_paper
from test_filter import build
from test_paper import PAPER, STUB, comment

page = test_paper.page


def test_generated_json_and_caption_footnote(page: Page, tmp_path: Path) -> None:
    (tmp_path / "terms.yaml").write_text("{}")
    # WebKit restricts file:// resources outside the page's directory.
    for name in SHARED:
        shutil.copyfile(HTML_PAPERS / name, tmp_path / name)
    source = (
        "---\nhtml_papers_dir: ./\ncss: [html-papers.css]\n---\n"
        + """
```{.python .run}
print("<!-- <script> </script>")
```

# Still here

| name | score |
|---|---|
| one | 1 |

: Caption^[Caption footnote is readable.]
"""
    )
    built = build(tmp_path, "html5", source)
    assert built.returncode == 0, built.stderr
    output = tmp_path / "page.html"
    output.write_text(built.stdout)
    page.goto(output.as_uri())
    expect(page.locator("#still-here")).to_be_visible()
    data = json.loads(page.locator(".run-data").text_content() or "")
    assert data["files"][0]["text"] == 'print("<!-- <script> </script>")'
    expect(page.locator("caption .cell-note")).to_have_count(0)
    page.locator("caption .footnote-ref").click()
    expect(page.locator(".margin-note")).to_contain_text(
        "Caption footnote is readable."
    )


def test_mobile_notes_do_not_change_review_anchors(page: Page) -> None:
    page.set_viewport_size({"width": 420, "height": 900})
    page.evaluate("ReviewMode.enter()")
    comment(page, "#run-two + p", "before opening notes")
    stored = "JSON.parse(localStorage.getItem('review:v1:doc:' + location.pathname)).annotations"
    before = page.evaluate(stored)[0]
    page.locator("#term-widget").click()
    page.evaluate(STUB)
    page.locator("#run-two .run-open").click()
    expect(page.locator(".run-status")).to_contain_text("Ran in")
    comment(page, "#run-two + p", "after opening notes")
    after = page.evaluate(stored)[-1]
    assert after["position"] == before["position"]
    assert after["quote"] == before["quote"]
    page.evaluate("ReviewMode.setMode(true)")
    assert page.locator(".margin-note").evaluate_all(
        "ns => ns.every(n => !n.isContentEditable)"
    )
    assert not page.locator(".run-panel").evaluate("n => n.isContentEditable")
    # Definitions and references inside inline previews must still open their own notes.
    page.evaluate("ReviewMode.exit()")
    page.locator("#ref-method").click()
    page.locator(".margin-note.preview a[href='#tab:scores']").click()
    expect(page.locator(".margin-note.preview table")).to_have_count(1)


def test_review_exit_releases_space_reserved_for_comments(page: Page) -> None:
    page.evaluate("ReviewMode.enter()")
    comment(page, "#p-intro", "Long comment. " * 60)
    page.evaluate(
        "MarginNotes.show('probe', document.querySelector('#term-widget'), 'note', {closable:true})"
    )
    top = "document.querySelector('.margin-note').getBoundingClientRect().top + scrollY"
    before = page.evaluate(top)
    page.evaluate("ReviewMode.exit()")
    page.wait_for_timeout(100)
    after = page.evaluate(top)
    assert before - after > 100
    page.evaluate("dispatchEvent(new Event('resize'))")
    assert abs(page.evaluate(top) - after) < 1


def test_preview_does_not_offer_a_dead_run_button(page: Page) -> None:
    page.evaluate("""() => {
        const block = document.querySelector('#run-one'), figure = document.createElement('figure');
        figure.id = 'fig:code'; block.before(figure); figure.append(block);
        document.querySelector('#ref-fig').href = '#fig:code';
    }""")
    page.locator("#ref-fig").click(button="middle")
    expect(page.locator(".margin-note pre")).to_contain_text("def double")
    expect(page.locator(".margin-note .run-open")).to_have_count(0)
    expect(page.locator("#run-one .run-open")).to_have_count(1)


def test_failed_renderer_can_be_retried(page: Page) -> None:
    # Intercept script insertion so this also exercises file:// pages without routing support.
    page.evaluate("""() => {
        const append = document.head.append.bind(document.head);
        window.rendererAttempts = 0;
        document.head.append = (...nodes) => {
            const script = nodes[0];
            if (script.src?.endsWith('run-render-fixture.js') && ++rendererAttempts === 1) {
                setTimeout(() => script.dispatchEvent(new Event('error')), 0); return;
            }
            return append(...nodes);
        };
    }""")
    page.evaluate(STUB)
    page.locator("#run-one .run-open").click()
    expect(page.locator(".run-stderr")).to_contain_text("could not be loaded")
    page.locator(".run-go").click()
    expect(page.locator(".run-rendered")).to_contain_text("drawn:")
    assert page.evaluate("rendererAttempts") == 2


def test_menu_tracks_external_changes_and_full_width_range(page: Page) -> None:
    page.set_viewport_size({"width": 3000, "height": 900})
    page.keyboard.press("m")
    review = page.locator(".menu-row", has_text="Review mode").locator("input")
    page.keyboard.press("e")
    expect(review).to_be_checked()
    page.keyboard.press("e")
    expect(review).not_to_be_checked()
    page.evaluate("""() => {
        DocOptions.find(o => o.label === 'Notes column width').set(75);
        DocOptions.find(o => o.label === 'Contents width').set(50);
    }""")
    expect(
        page.locator(".menu-row", has_text="Notes column width").locator("input")
    ).to_have_value("75")
    expect(
        page.locator(".menu-row", has_text="Contents width").locator("input")
    ).to_have_value("50")


def test_legacy_preferences_migrate_once_and_reset_stays_reset(page: Page) -> None:
    page.evaluate(
        "localStorage.clear(); localStorage.setItem('lines', '0'); localStorage.setItem('text-width', '50')"
    )
    page.reload()
    expect(page.locator("html")).to_have_class(re.compile(r".*lines-off.*"))
    page.evaluate("DocMenu.open()")
    page.locator("#doc-menu .menu-foot button").click()
    assert (
        page.evaluate("localStorage.getItem('lines')") == "0"
    )  # another page's key is untouched
    page.reload()
    assert not page.evaluate("document.documentElement.classList.contains('lines-off')")
    assert (
        page.evaluate(
            "getComputedStyle(document.documentElement).getPropertyValue('--text-max').trim()"
        )
        == "44rem"
    )


def test_touch_taps_open_notes_and_contents_in_each_browser() -> None:
    with sync_playwright() as p:
        browser = getattr(p, BROWSER).launch()
        context = browser.new_context(
            viewport={"width": 420, "height": 900}, has_touch=True
        )
        pg = context.new_page()
        errors: list[str] = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(PAPER)
        pg.locator("#term-widget").tap()
        expect(pg.locator(".margin-note.inline")).to_contain_text("A small part")
        pg.locator("#toc-tab").tap()
        expect(pg.locator("#toc-tab")).to_have_attribute("aria-expanded", "true")
        pg.locator("#toc-nav li a").first.tap()
        expect(pg.locator("#toc-tab")).to_have_attribute("aria-expanded", "false")
        browser.close()
        assert not errors, errors

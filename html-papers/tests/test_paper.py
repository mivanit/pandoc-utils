"""popups.js, contents.js, arxiv-links.js and review.js together on paper-fixture.html, a page
written by hand in the shape pandoc gives, so these tests need no build.

Real pointer movement in headless Chromium: hover notes and previews, notes opened from notes,
pinning (click, middle click) and closing, no overlaps, the contents sidebar, and review mode's
comment lines passing behind the notes.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from playwright.sync_api import Page, sync_playwright

PAPER: str = (Path(__file__).parent / "paper-fixture.html").absolute().as_uri()
REST: int = 350  # ms: longer than the rest an anchor needs before its note opens

# every note: its key, whether it is a preview, the index of the note it was opened from, its box
NOTES: str = """() => { const ns = [...document.querySelectorAll('.margin-note')];
    return ns.map(n => { const r = n.getBoundingClientRect(); return {key: n.dataset.key, preview: n.classList.contains('preview'),
        parent: ns.indexOf(n.parentNote), top: r.top, bottom: r.bottom, left: r.left, right: r.right, text: n.textContent,
        close: !!n.querySelector(':scope > .note-close')} }) }"""


@pytest.fixture
def page() -> Iterator[Page]:
    """The demo paper in a wide window, pointer parked in the text; fails on any page error."""
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1600, "height": 900})
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.add_init_script("localStorage.setItem('review:v1:help-seen', '1')")
        pg.goto(PAPER)
        pg.mouse.move(700, 880)
        yield pg
        browser.close()
    assert not errors, errors


def hover(page: Page, css: str, park: bool = True) -> None:
    """Move the pointer onto the first line box of an element and let it rest.

    park: start from clear of everything, closing any hover note (an anchor on the way to an
    open hover note waits longer before opening its own).
    """
    if park:
        page.mouse.move(700, 880)
    point: dict = page.eval_on_selector(
        css,
        "el => { const r = el.getClientRects()[0]; return {x: r.left + 3, y: r.top + 3} }",
    )
    page.mouse.move(point["x"], point["y"], steps=8)
    page.wait_for_timeout(REST)


def notes(page: Page) -> list[dict]:
    return page.evaluate(NOTES)


def overlaps(ns: list[dict]) -> int:
    return sum(
        a["top"] < b["bottom"] and b["top"] < a["bottom"]
        for i, a in enumerate(ns)
        for b in ns[i + 1 :]
    )


def test_each_kind_of_anchor_has_a_note(page: Page) -> None:
    hover(page, "#term-widget")
    assert "A small part that does one thing." in notes(page)[0]["text"]
    hover(page, "#cite-one")
    assert "Widgets by hand" in notes(page)[0]["text"]
    hover(page, "#fnref1")
    assert "Slowly." in notes(page)[0]["text"]
    hover(page, "#ref-table")
    (n,) = notes(page)
    assert n["preview"] and "Scores by size" in n["text"]
    hover(page, "#ref-method")
    (n,) = notes(page)
    # the section up to its first subsection, which is only linked
    assert "We build each" in n["text"] and "Details of the method" not in n["text"]
    assert (
        page.eval_on_selector(
            ".margin-note .preview-subs a", "a => a.getAttribute('href')"
        )
        == "#sec:details"
    )
    # the copy has no ids: the page's own stay unique
    assert page.evaluate("document.querySelectorAll('.margin-note [id]').length") == 0


def test_arxiv_id_and_title_become_links(page: Page) -> None:
    hrefs: list[str] = page.eval_on_selector_all(
        "#refs a", "as => as.map(a => a.getAttribute('href'))"
    )
    assert hrefs == ["https://arxiv.org/abs/2001.01234"] * 2
    hover(page, "#cite-one")  # the note copies the linked entry
    assert (
        page.evaluate(
            "document.querySelectorAll('.margin-note a[href^=\"https://arxiv.org\"]').length"
        )
        == 2
    )


def test_notes_open_from_notes_without_moving_them(page: Page) -> None:
    hover(page, "#ref-method")
    before: dict = notes(page)[0]
    link: str = ".margin-note.preview a[href='#tab:scores']"
    y_before: float = page.eval_on_selector(link, "a => a.getBoundingClientRect().top")
    hover(page, link, park=False)
    ns: list[dict] = notes(page)
    assert [n["parent"] for n in ns] == [-1, 0]
    assert ns[0]["top"] == before["top"]
    assert page.eval_on_selector(link, "a => a.getBoundingClientRect().top") == y_before
    assert ns[1]["top"] >= ns[0]["bottom"] and overlaps(ns) == 0
    # a line for each note
    assert (
        page.eval_on_selector(
            "#note-lines path", "p => p.getAttribute('d').split('M').length - 1"
        )
        == 2
    )
    # a click on the lower note pins both; the pointer leaving closes neither
    page.mouse.click(ns[1]["right"] - 20, ns[1]["top"] + 8)
    page.mouse.move(700, 880, steps=5)
    ns = notes(page)
    assert [n["key"] != "hover" and n["close"] for n in ns] == [True, True]
    # the first note's × closes the note opened from it too
    page.click(".margin-note .note-close")
    assert notes(page) == []


def test_hover_note_goes_when_the_pointer_leaves(page: Page) -> None:
    hover(page, "#term-widget")
    assert len(notes(page)) == 1
    page.mouse.move(700, 880, steps=5)
    assert notes(page) == []


def test_middle_click_pins_and_unpins(page: Page) -> None:
    point: dict = page.eval_on_selector(
        "#ref-table",
        "el => { const r = el.getClientRects()[0]; return {x: r.left + 3, y: r.top + 3} }",
    )
    page.mouse.move(point["x"], point["y"])
    page.mouse.click(point["x"], point["y"], button="middle")
    page.wait_for_timeout(REST)
    assert len(page.context.pages) == 1  # no new tab
    page.mouse.move(700, 880, steps=5)
    (n,) = notes(page)
    assert n["key"] != "hover" and n["close"]
    page.mouse.click(point["x"], point["y"], button="middle")
    assert notes(page) == []


def test_click_pins_a_citation_and_a_table_note(page: Page) -> None:
    page.click("#cite-one")
    page.click("#cell-noted")
    page.mouse.move(700, 880, steps=5)
    ns: list[dict] = notes(page)
    assert len(ns) == 2 and overlaps(ns) == 0
    assert any("One run only." in n["text"] for n in ns)
    page.click("#cite-one")  # again: unpins
    assert len(notes(page)) == 1


def test_contents_lists_sections_and_pins(page: Page) -> None:
    items: list[str] = page.eval_on_selector_all(
        "#toc-nav li a", "as => as.map(a => a.textContent.replace(/\\s+/g, ' ').trim())"
    )
    assert items == ["1 Introduction", "2 Method", "2.1 Details", "References"]
    page.wait_for_timeout(300)  # the pointer left the edge: the panel slides back
    assert (
        page.evaluate(
            "document.getElementById('toc-nav').getBoundingClientRect().right"
        )
        < 1
    )
    page.mouse.move(3, 400)
    page.wait_for_timeout(300)
    assert page.evaluate("document.documentElement.classList.contains('toc-open')")
    left: float = page.evaluate("document.body.getBoundingClientRect().left")
    page.click(".toc-pin")
    page.wait_for_timeout(300)
    assert page.evaluate("document.documentElement.classList.contains('toc-pinned')")
    nav_right: float = page.evaluate(
        "document.getElementById('toc-nav').getBoundingClientRect().right"
    )
    assert page.evaluate("document.body.getBoundingClientRect().left") >= max(
        left, nav_right
    )


def test_narrow_window_shows_the_note_in_a_bottom_panel(page: Page) -> None:
    page.set_viewport_size({"width": 600, "height": 800})
    hover(page, "#term-widget")
    assert notes(page) == []  # no hover notes without a margin
    page.click("#term-widget")  # a tap opens the definition instead of jumping
    assert (
        page.evaluate(
            "getComputedStyle(document.getElementById('margin-notes')).position"
        )
        == "fixed"
    )
    assert "Go to the section" in notes(page)[0]["text"]


def test_review_mode_lines_pass_behind_notes_and_notes_are_not_text(page: Page) -> None:
    page.goto(PAPER + "?review=1")
    page.wait_for_timeout(300)
    # a comment on the first words of the intro paragraph
    page.evaluate(
        """() => { const t = document.querySelector('#p-intro').firstChild, r = document.createRange();
        r.setStart(t, 0); r.setEnd(t, 20); getSelection().removeAllRanges(); getSelection().addRange(r); }"""
    )
    page.wait_for_timeout(300)
    page.evaluate(
        "document.querySelector('#rv-host').shadowRoot.querySelector('.toolbar button').click()"
    )
    page.keyboard.type("a comment")
    page.mouse.click(700, 880)
    page.wait_for_timeout(200)
    line: str = "document.querySelector('#rv-host').shadowRoot.querySelector('svg path').getAttribute('d')"
    assert page.evaluate(line).count("M") == 1
    # a pinned preview level with the comment: the line breaks around it
    page.click("#cite-one")
    hover(page, "#ref-method")
    (cite, preview) = sorted(notes(page), key=lambda n: n["preview"])
    page.mouse.click(preview["left"] + 30, preview["top"] + 10)
    page.wait_for_timeout(200)
    assert page.evaluate(line).count("M") >= 2
    # the note is right of the text and left of the comment column
    card_left: float = page.evaluate(
        "document.querySelector('#rv-host').shadowRoot.querySelector('.card').getBoundingClientRect().left"
    )
    assert all(n["right"] <= card_left for n in notes(page))
    # Suggest mode: the page is editable, the notes are not
    page.evaluate("ReviewMode.setMode(true)")
    assert (
        page.evaluate("document.querySelector('.margin-note').isContentEditable")
        is False
    )
    assert (
        page.evaluate("document.getElementById('toc-nav').isContentEditable") is False
    )

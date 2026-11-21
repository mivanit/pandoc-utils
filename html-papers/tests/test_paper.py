"""popups.js, contents.js, arxiv-links.js and review.js together on paper-fixture.html, a page
written by hand in the shape pandoc gives, so these tests need no build.

Real pointer movement in headless Chromium: hover notes and previews, notes opened from notes,
pinning (click, middle click) and closing, no overlaps, the three columns and their edges that
drag, review mode's comments sharing the side column, and, without a side column or without a
pointer, notes that open on a tap (in the text on a phone) and the contents that open on a swipe.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from playwright.sync_api import CDPSession, Locator, Page, sync_playwright

from hp_paths import BROWSER

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
        browser = getattr(p, BROWSER).launch()
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
    assert page.locator("#note-lines path").count() == 2
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


RECT: str = "id => { const r = document.getElementById(id).getBoundingClientRect(); return {left: r.left, right: r.right, width: r.width} }"
OVERFLOW: str = (
    "document.documentElement.scrollWidth - document.documentElement.clientWidth"
)


def has_class(page: Page, name: str) -> bool:
    return page.evaluate(f"document.documentElement.classList.contains('{name}')")


def fresh_page(page: Page) -> Page:
    """Another window of the same browser, with nothing stored: as a later visit would be."""
    browser = page.context.browser
    assert browser is not None
    return browser.new_page(viewport={"width": 1600, "height": 900})


def test_three_columns_fit_at_every_width(page: Page) -> None:
    for width in (2200, 1600, 1280, 1040, 992, 900, 760, 759, 420):
        page.set_viewport_size({"width": width, "height": 800})
        page.wait_for_timeout(300)  # the contents slide in and out
        assert page.evaluate(OVERFLOW) == 0, width
        text: dict = page.evaluate(RECT, "p-intro")
        nav: dict = page.evaluate(RECT, "toc-nav")
        side: str = page.evaluate(
            "getComputedStyle(document.getElementById('margin-notes')).display"
        )
        # the contents are a column from 62rem, the side column is there from 760px
        assert (nav["right"] > 100) == (width >= 992), width
        assert (side != "none") == (width >= 760), width
        if width >= 992:
            assert text["left"] >= nav["right"], width
        if width >= 760:
            margin: dict = page.evaluate(RECT, "margin-notes")
            assert text["right"] < margin["left"] and margin["right"] <= width, width
            assert text["width"] >= 22 * 16 - 1 and margin["width"] >= 10 * 16 - 1


def test_contents_are_a_column_until_unpinned(page: Page) -> None:
    items: list[str] = page.eval_on_selector_all(
        "#toc-nav li a", "as => as.map(a => a.textContent.replace(/\\s+/g, ' ').trim())"
    )
    assert items == ["1 Introduction", "2 Method", "2.1 Details", "References"]
    # pinned as it starts: the left column, the text right of it
    assert has_class(page, "toc-pinned")
    nav: dict = page.evaluate(RECT, "toc-nav")
    assert nav["left"] == 0 and nav["right"] > 150
    assert page.evaluate(RECT, "p-intro")["left"] >= nav["right"]
    # unpinned: gone, until the pointer is at the left edge
    page.click(".toc-pin")
    page.wait_for_timeout(300)
    assert not has_class(page, "toc-pinned")
    assert page.evaluate(RECT, "toc-nav")["right"] < 1
    page.mouse.move(3, 400)
    page.wait_for_timeout(300)
    assert has_class(page, "toc-open")
    page.mouse.move(700, 400)
    page.wait_for_timeout(300)
    assert not has_class(page, "toc-open")
    # remembered: stored, and a page that finds it stored starts unpinned
    assert page.evaluate("localStorage.getItem('toc-pinned')") == ""
    later: Page = fresh_page(page)
    later.add_init_script("localStorage.setItem('toc-pinned', '')")
    later.goto(PAPER)
    assert not has_class(later, "toc-pinned")


def test_column_edges_drag_and_are_remembered(page: Page) -> None:
    def drag(handle: str, by: int) -> float:
        """Drag a column's edge sideways; returns where the pointer let go."""
        box = page.locator(handle).bounding_box()
        assert box is not None
        x: float = box["x"] + box["width"] / 2
        page.mouse.move(x, 300)
        page.mouse.down()
        page.mouse.move(x + by / 2, 300, steps=4)
        page.mouse.move(x + by, 300, steps=4)
        page.mouse.up()
        return x + by

    def middle(handle: str) -> float:
        r: dict = page.evaluate(RECT, handle)
        return (r["left"] + r["right"]) / 2

    side: float = page.evaluate(RECT, "margin-notes")["width"]
    toc: float = page.evaluate(RECT, "toc-nav")["width"]
    let_go: float = drag("#side-handle", -60)
    wider: float = page.evaluate(RECT, "margin-notes")["width"]
    # the text and the column are centred together, so the column grew by more than the
    # pointer moved, and the edge is still under the pointer
    assert wider > side + 60 and abs(middle("side-handle") - let_go) < 3
    let_go = drag("#toc-handle", 50)
    assert abs(page.evaluate(RECT, "toc-nav")["width"] - (toc + 50)) < 2
    assert abs(middle("toc-handle") - let_go) < 3
    assert page.evaluate(OVERFLOW) == 0
    # remembered: both widths are stored (in rem), and a page that finds them stored has them
    stored: list[str] = page.evaluate(
        "[localStorage.getItem('side-width'), localStorage.getItem('toc-width')]"
    )
    assert (
        abs(float(stored[0]) * 16 - wider) < 2
        and abs(float(stored[1]) * 16 - toc - 50) < 2
    )
    later: Page = fresh_page(page)
    later.add_init_script(
        f"localStorage.setItem('side-width', '{stored[0]}'); localStorage.setItem('toc-width', '{stored[1]}')"
    )
    later.goto(PAPER)
    assert abs(later.evaluate(RECT, "margin-notes")["width"] - wider) < 2
    assert abs(later.evaluate(RECT, "toc-nav")["width"] - (toc + 50)) < 2
    later.close()
    # dragged as far as they go: the side column takes room from the text, down to the
    # text's least width (22rem); the contents leave room for both, and nothing overflows
    drag("#side-handle", -900)
    assert abs(page.evaluate(RECT, "p-intro")["width"] - 22 * 16) < 2
    assert page.evaluate(RECT, "margin-notes")["width"] > 40 * 16
    drag("#toc-handle", 900)
    assert page.evaluate(RECT, "toc-nav")["width"] > 30 * 16
    assert page.evaluate(RECT, "p-intro")["width"] >= 22 * 16 - 1
    assert page.evaluate(RECT, "margin-notes")["width"] >= 10 * 16 - 1
    assert page.evaluate(OVERFLOW) == 0
    # a double click puts each back, and forgets it
    page.locator("#side-handle").dblclick(position={"x": 4, "y": 300})
    page.locator("#toc-handle").dblclick(position={"x": 4, "y": 300})
    assert abs(page.evaluate(RECT, "margin-notes")["width"] - side) < 2
    assert abs(page.evaluate(RECT, "toc-nav")["width"] - toc) < 2
    assert page.evaluate(
        "[localStorage.getItem('side-width'), localStorage.getItem('toc-width')]"
    ) == [None, None]


def test_a_figure_in_a_preview_is_scaled_not_scrolled(page: Page) -> None:
    # a window so low that the figure's copy does not fit the height a preview may take
    page.set_viewport_size({"width": 1600, "height": 260})
    page.evaluate("scrollTo(0, 0)")
    page.mouse.move(700, 250)
    hover(page, "#ref-fig", park=False)
    scale, scrolls, text = page.eval_on_selector(
        ".margin-note.preview",
        """n => [parseFloat(getComputedStyle(n.querySelector('.preview-fit')).getPropertyValue('--fit')),
                 n.scrollHeight - n.clientHeight, n.textContent]""",
    )
    assert "The score rises with size" in text
    assert 0.3 <= scale < 1 and scrolls <= 1
    # a section is text: it flows at the note's width instead
    page.set_viewport_size({"width": 1600, "height": 900})
    hover(page, "#ref-method")
    assert page.locator(".margin-note.preview .preview-fit").count() == 0


def test_without_a_side_column_notes_open_in_the_text(page: Page) -> None:
    page.set_viewport_size({"width": 600, "height": 800})
    hover(page, "#term-widget")
    assert notes(page) == []  # nothing on hover
    place: str = """() => [...document.querySelectorAll('.margin-note')].map(n =>
        [n.classList.contains('inline'), n.previousElementSibling && (n.previousElementSibling.id || n.previousElementSibling.tagName)])"""
    page.click("#term-widget")  # a tap opens the definition under its paragraph
    assert page.evaluate(place) == [[True, "p-intro"]]
    assert "Go to the section" in notes(page)[0]["text"]
    page.click("#ref-table")  # a cross-reference too, after the note already there
    ns: list[dict] = notes(page)
    assert len(ns) == 2 and ns[1]["preview"] and "Scores by size" in ns[1]["text"]
    assert "Go to Table 1" in ns[1]["text"] and ns[1]["top"] >= ns[0]["bottom"]
    assert page.evaluate("location.hash") == ""  # the tap did not jump
    page.click("#ref-table")  # again: closes it
    assert len(notes(page)) == 1
    page.click("#cite-one")
    page.click("#cell-noted")  # a table's note goes after the table
    assert page.evaluate(place)[-1] == [True, "tab:scores"]
    assert len(notes(page)) == 3 and page.evaluate(OVERFLOW) == 0
    # the note's own link goes there, and closes the note
    page.click("#p-intro ~ .margin-note .note-more")
    assert page.evaluate("location.hash") == "#sec:method" and len(notes(page)) == 2
    # a wider window: the same notes, now in the side column
    page.set_viewport_size({"width": 1600, "height": 800})
    page.wait_for_timeout(100)
    assert [inline for inline, _ in page.evaluate(place)] == [False, False]
    assert page.evaluate("document.getElementById('margin-notes').children.length") == 2


def swipe(cdp: CDPSession, page: Page, x0: float, x1: float, y: float = 400) -> None:
    cdp.send(
        "Input.dispatchTouchEvent",
        {"type": "touchStart", "touchPoints": [{"x": x0, "y": y}]},
    )
    for i in range(1, 6):
        point: dict = {"x": x0 + (x1 - x0) * i / 5, "y": y}
        cdp.send(
            "Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [point]}
        )
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    page.wait_for_timeout(300)


@pytest.mark.skipif(
    BROWSER != "chromium", reason="touches are sent over Chromium's protocol"
)
def test_touch_a_tap_opens_the_note_and_a_swipe_the_contents() -> None:
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # a tablet: a side column, but no pointer to rest on a link
        tablet = browser.new_context(
            viewport={"width": 1024, "height": 768}, has_touch=True, is_mobile=True
        )
        pg = tablet.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(PAPER)
        pg.tap("#ref-fig")
        pg.wait_for_timeout(200)
        (n,) = notes(pg)
        assert n["preview"] and n["close"] and "Go to Figure 1" in n["text"]
        assert pg.evaluate("location.hash") == ""
        assert n["left"] >= pg.evaluate(RECT, "p-intro")["right"]  # in the side column
        pg.tap("#ref-fig")  # a second tap closes it
        assert notes(pg) == []
        tablet.close()
        # a phone: the contents are behind a button, and a swipe
        phone = browser.new_context(
            viewport={"width": 400, "height": 800}, has_touch=True, is_mobile=True
        )
        pg = phone.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(PAPER)
        cdp: CDPSession = phone.new_cdp_session(pg)
        assert not has_class(pg, "toc-open")
        swipe(cdp, pg, 60, 260)
        assert has_class(pg, "toc-open")
        assert pg.evaluate(RECT, "toc-nav")["left"] == 0
        swipe(cdp, pg, 300, 80)
        assert not has_class(pg, "toc-open")
        swipe(cdp, pg, 200, 210)  # a tap that wanders is not a swipe
        swipe(cdp, pg, 60, 260, y=400)
        pg.touchscreen.tap(380, 300)  # a tap outside closes it
        pg.wait_for_timeout(300)
        assert not has_class(pg, "toc-open")
        pg.tap("#toc-tab")  # the button opens it, once
        pg.wait_for_timeout(300)
        assert has_class(pg, "toc-open")
        pg.tap("#toc-nav li a")  # a section: go there, and close
        pg.wait_for_timeout(300)
        assert (
            not has_class(pg, "toc-open")
            and pg.evaluate("location.hash") == "#sec:intro"
        )
        pg.tap("#term-widget")
        pg.wait_for_timeout(200)
        assert pg.evaluate(
            "document.querySelector('.margin-note').classList.contains('inline')"
        )
        assert pg.evaluate(OVERFLOW) == 0
        browser.close()
    assert not errors, errors


CARD: str = """() => { const r = document.querySelector('#rv-host').shadowRoot.querySelector('.card').getBoundingClientRect();
    return {left: r.left, right: r.right, top: r.top, bottom: r.bottom} }"""
# each line to a note: its box, in the window
LINES: str = """() => [...document.querySelectorAll('#note-lines path')].map(p => { const r = p.getBoundingClientRect();
    return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, active: p.classList.contains('active')} })"""


def comment(page: Page, css: str, text: str) -> None:
    """In review mode: a comment on the first 20 characters of an element."""
    page.evaluate(
        """css => { const t = document.querySelector(css).firstChild, r = document.createRange();
        r.setStart(t, 0); r.setEnd(t, 20); getSelection().removeAllRanges(); getSelection().addRange(r); }""",
        css,
    )
    page.wait_for_timeout(300)
    page.evaluate(
        "document.querySelector('#rv-host').shadowRoot.querySelector('.toolbar button').click()"
    )
    page.keyboard.type(text)
    page.mouse.click(700, 880)
    page.wait_for_timeout(200)


def test_lines_stay_in_the_gutter_and_the_anchor_is_marked(page: Page) -> None:
    page.click("#cite-one")
    page.click("#fnref1")
    page.mouse.move(700, 880)
    text_right: float = page.evaluate(
        "document.body.getBoundingClientRect().right - parseFloat(getComputedStyle(document.body).paddingRight)"
    )
    margin: dict = page.evaluate(RECT, "margin-notes")
    lines: list[dict] = page.evaluate(LINES)
    ns: list[dict] = notes(page)
    assert len(lines) == 2 and not any(line["active"] for line in lines)
    for line, n in zip(lines, ns):
        # from just right of the text to the note's edge, near its top: never over the text
        # (a browser may count the stroke in the line's box: a few px)
        assert text_right < line["left"] and abs(line["right"] - margin["left"]) < 4
        assert n["top"] < line["bottom"] <= n["top"] + 16
    # the column is in the order of the text, so the lines do not cross
    assert (
        lines[0]["top"] <= lines[1]["top"] and lines[0]["bottom"] < lines[1]["bottom"]
    )
    marked: str = "[...document.querySelectorAll('.note-open')].map(e => e.id + (e.classList.contains('note-active') ? '!' : ''))"
    assert page.evaluate(marked) == ["cite-one", "fnref1"]
    # the pointer on a note: its anchor and its line are the strong ones
    page.mouse.move(ns[1]["left"] + 30, ns[1]["top"] + 12, steps=4)
    assert page.evaluate(marked) == ["cite-one", "fnref1!"]
    assert [line["active"] for line in page.evaluate(LINES)] == [False, True]
    page.mouse.move(700, 880)
    page.click(".margin-note .note-close")
    page.mouse.move(700, 880)  # the note below moved up, under the pointer
    assert page.evaluate(marked) == ["fnref1"] and len(page.evaluate(LINES)) == 1


def test_pinned_notes_are_remembered(page: Page) -> None:
    key: str = "'notes-open:' + location.pathname"
    page.click("#cite-one")
    hover(page, "#ref-method")
    hover(page, ".margin-note.preview a[href='#tab:scores']", park=False)
    page.click(
        ".margin-note.preview:last-child caption"
    )  # pins the table and the section it came from
    page.mouse.move(700, 880, steps=5)
    before: list[dict] = notes(page)
    assert len(before) == 3 and all(n["key"] != "hover" for n in before)
    stored: str = page.evaluate(f"localStorage.getItem({key})")
    assert stored.count("#tab:scores") == 1 and "doe2020" in stored
    # a later visit that finds them stored has the same notes, the table's under the section's
    later: Page = fresh_page(page)
    later.add_init_script(f"localStorage.setItem({key}, {stored!r})")
    later.goto(PAPER)
    later.wait_for_timeout(200)
    after: list[dict] = notes(later)
    assert [(n["text"], n["parent"], n["close"]) for n in after] == [
        (n["text"], n["parent"], n["close"]) for n in before
    ]
    assert overlaps(after) == 0
    later.close()
    # closing one forgets it; closing all, or turning it off in the menu, forgets everything
    page.click(".margin-note .note-close")
    assert "doe2020" not in page.evaluate(f"localStorage.getItem({key})")
    page.keyboard.press("m")
    page.locator("#doc-menu .menu-row", has_text="Remember").locator("input").click()
    assert (
        page.evaluate(f"localStorage.getItem({key})") is None and len(notes(page)) == 2
    )


def test_the_menu_lists_what_the_scripts_let_the_reader_change(page: Page) -> None:
    hidden: str = "document.getElementById('doc-menu').hidden"

    def row(label: str) -> Locator:
        """The control of the menu's row with this label."""
        return page.locator("#doc-menu .menu-row", has_text=label).locator("input")

    assert page.evaluate(hidden)
    page.keyboard.press("m")
    assert not page.evaluate(hidden)
    labels: str = " | ".join(page.locator("#doc-menu .menu-row").all_text_contents())
    for part in (
        "Text width",
        "Lines",
        "Notes column width",
        "pointer rests",
        "Remember",
        "Contents as a column",
        "Contents width",
        "Review mode",
    ):
        assert part in labels, part
    # lines off: none drawn, to notes or to comments
    page.click("#cite-one")
    assert len(page.evaluate(LINES)) == 1
    page.keyboard.press("m")
    row("Lines").click()
    assert has_class(page, "lines-off") and page.evaluate(LINES) == []
    assert page.evaluate("localStorage.getItem('lines')") == "0"
    # the text's width: as asked, where the window has the room
    row("Text width").fill("50")
    assert abs(page.evaluate(RECT, "p-intro")["width"] - 50 * 16) < 2
    assert page.evaluate("localStorage.getItem('text-width')") == "50"
    # hover notes off: nothing opens under a resting pointer; a click opens the note instead
    row("pointer rests").click()
    page.keyboard.press("Escape")
    assert page.evaluate(hidden)
    page.click(".margin-note .note-close")
    hover(page, "#term-widget")
    assert notes(page) == []
    page.click("#term-widget")
    (n,) = notes(page)
    assert (
        "A small part" in n["text"] and "Go to the section" in n["text"] and n["close"]
    )
    page.click("#term-widget")
    assert notes(page) == []
    # the contents: unpinned from the menu, opened with the button beside Pin
    page.keyboard.press("m")
    row("Contents as a column").click()
    assert not has_class(page, "toc-pinned")
    row("Contents as a column").click()
    # Reset puts everything back and forgets it
    page.click("#doc-menu .menu-foot button")
    assert not has_class(page, "lines-off") and has_class(page, "toc-pinned")
    assert abs(page.evaluate(RECT, "p-intro")["width"] - 44 * 16) < 2
    assert (
        page.evaluate(
            "['lines', 'text-width', 'notes-hover', 'side-width', 'toc-width'].map(k => localStorage.getItem(k))"
        )
        == [None] * 5
    )
    page.keyboard.press("Escape")
    page.mouse.move(700, 880)
    hover(page, "#term-widget")
    assert len(notes(page)) == 1
    page.mouse.move(700, 880)
    page.click(".toc-menu")
    assert not page.evaluate(hidden)
    page.mouse.click(700, 880)  # a press outside closes it
    assert page.evaluate(hidden)
    # M typed into a field is a letter
    page.goto(PAPER + "?review=1")
    page.wait_for_timeout(300)
    page.evaluate(
        "document.querySelector('#rv-host').shadowRoot.querySelector('.panel').classList.add('open')"
    )
    page.evaluate(
        "document.querySelector('#rv-host').shadowRoot.querySelector('.who input').focus()"
    )
    page.keyboard.type("Mm")
    assert page.evaluate(hidden)
    assert (
        page.evaluate(
            "document.querySelector('#rv-host').shadowRoot.querySelector('.who input').value"
        )
        == "Mm"
    )


def test_review_mode_comments_share_the_side_column_with_notes(page: Page) -> None:
    page.goto(PAPER + "?review=1")
    page.wait_for_timeout(300)
    comment(page, "#p-intro", "a comment")
    line: str = (
        "document.querySelector('#rv-host').shadowRoot.querySelector('svg path')"
    )
    # the card is in the page's side column, which needs no room of its own
    margin: dict = page.evaluate(RECT, "margin-notes")
    c: dict = page.evaluate(CARD)
    assert margin["left"] - 1 <= c["left"] and c["right"] <= margin["right"] + 1
    assert (
        page.evaluate(
            "getComputedStyle(document.documentElement).getPropertyValue('--review-width')"
        )
        == "0px"
    )
    assert page.evaluate(OVERFLOW) == 0
    # its line: one stroke, through the gutter to the card's edge
    assert page.evaluate(line + ".getAttribute('d')").count("M") == 1
    assert abs(page.evaluate(line + ".getBoundingClientRect().right") - c["left"]) < 4
    # review.js's panel is only its title row here, so it does not cover the column
    panel: str = "document.querySelector('#rv-host').shadowRoot.querySelector('.panel')"
    assert page.evaluate(panel + ".classList.contains('compact')")
    assert page.evaluate(panel + ".querySelector('.who').offsetHeight") == 0
    assert page.evaluate(panel + ".getBoundingClientRect().bottom") < c["top"]
    level: float = c["top"]
    # One column, in the order of the text. The comment is on the paragraph's first words: a
    # note from further on in the paragraph goes below the card, which stays where it is
    page.click("#cite-one")
    page.wait_for_timeout(200)
    (cite,) = notes(page)
    c = page.evaluate(CARD)
    assert c["top"] == level and cite["top"] >= c["bottom"]
    # a hover note from the first line, right of the comment: between the two
    hover(page, "#ref-method")
    page.wait_for_timeout(200)
    c = page.evaluate(CARD)
    cite, hovering = sorted(notes(page), key=lambda n: n["key"] == "hover")
    assert hovering["key"] == "hover" and c["top"] == level
    assert c["bottom"] <= hovering["top"] and hovering["bottom"] <= cite["top"]
    page.mouse.move(700, 880, steps=5)
    page.click(".margin-note .note-close")
    page.wait_for_timeout(200)
    assert notes(page) == [] and page.evaluate(CARD)["top"] == level
    # a comment further down than a note is below it: here the note is the one that stays
    page.click("#cite-one")
    comment(page, "#p-intro + p", "a second comment")
    (cite,) = notes(page)
    cards: list[dict] = page.evaluate(
        """() => [...document.querySelector('#rv-host').shadowRoot.querySelectorAll('.card')].map(c => c.getBoundingClientRect()).map(r => ({top: r.top, bottom: r.bottom})).sort((a, b) => a.top - b.top)"""
    )
    assert cards[0]["bottom"] <= cite["top"] and cite["bottom"] <= cards[1]["top"]
    # the contents column goes: the text moves, and the cards and their lines with it
    page.click(".toc-pin")
    page.mouse.move(700, 880)
    page.wait_for_timeout(300)
    margin = page.evaluate(RECT, "margin-notes")
    c = page.evaluate(CARD)
    assert abs(c["left"] - margin["left"]) < 1.5
    assert abs(page.evaluate(line + ".getBoundingClientRect().right") - c["left"]) < 4
    # Suggest mode: the page is editable, the notes are not
    page.evaluate("ReviewMode.setMode(true)")
    assert (
        page.evaluate("document.querySelector('.margin-note').isContentEditable")
        is False
    )
    assert (
        page.evaluate("document.getElementById('toc-nav').isContentEditable") is False
    )
    assert (
        page.evaluate("document.getElementById('doc-menu').isContentEditable") is False
    )


# what stands in for Python: it records each job and answers by what the main file says
STUB: str = """() => { window.JOBS = []; window.STOPPED = 0;
    RunCode.interpreter = { run(job, on) {
        JOBS.push(job);
        const main = job.files.find(f => f.name === job.main).text;
        on.status('Running…');
        if (!main.includes('forever')) setTimeout(() => {
            if (main.includes('boom')) { on.out('before\\n'); on.err('Traceback: boom\\n'); on.done({exit: 1, images: [], seconds: 0.5}); }
            else { on.out('echo ' + job.stdin + '\\n');
                on.done({exit: 0, seconds: 0.25, images: main.includes('plot') ? ['data:image/png;base64,iVBORw0KGgo='] : []}); }
        }, 30);
        else on.out('tick\\n');
        return { stop() { STOPPED++; } };
    } } }"""


def test_code_runs_in_a_panel_beside_the_text(page: Page) -> None:
    page.evaluate(STUB)
    assert page.locator(".run-open").count() == 2
    page.click("#run-one .run-open")
    (n,) = notes(page)
    margin: dict = page.evaluate(RECT, "margin-notes")
    # a note in the side column, with a × and a line, holding the files, the input and Run
    assert n["close"] and n["left"] >= margin["left"] - 1
    assert page.locator("#note-lines path").count() == 1
    panel = page.locator(".margin-note.run-note .run-panel")
    editor, stdin, status = (
        panel.locator(".run-editor"),
        panel.locator(".run-stdin"),
        panel.locator(".run-status"),
    )
    assert panel.locator(".run-tab").all_text_contents() == [
        "driver.py",
        "lib/data.txt",
    ]
    assert editor.input_value() == "print(input())\n" and stdin.input_value() == "hello"
    # each file keeps its edits while another is shown
    editor.fill("print(input())  # edited\n")
    panel.locator(".run-tab").nth(1).click()
    assert editor.input_value() == "one two\n"
    editor.fill("three\n")
    panel.locator(".run-tab").nth(0).click()
    assert editor.input_value() == "print(input())  # edited\n"
    # Run: the files as edited and the input go to the interpreter; the page's script draws
    # what came back
    stdin.fill("abc")
    panel.locator(".run-go").click()
    page.wait_for_timeout(200)
    assert page.evaluate("JOBS[0]") == {
        "main": "driver.py",
        "files": [
            {"name": "driver.py", "text": "print(input())  # edited\n"},
            {"name": "lib/data.txt", "text": "three\n"},
        ],
        "stdin": "abc",
        "packages": [],
    }
    assert status.text_content() == "Ran in 0.25 s"
    assert (
        panel.locator(".run-rendered").text_content()
        == "drawn: ECHO ABC (exit 0, input abc)"
    )
    # a run that failed is shown as printed, not drawn
    editor.fill("boom")
    editor.press("Control+Enter")  # runs, as the button does
    page.wait_for_timeout(200)
    assert status.text_content() == "Stopped with an error"
    assert panel.locator(".run-stdout").text_content() == "before\n"
    assert panel.locator(".run-stderr").text_content() == "Traceback: boom\n"
    assert panel.locator(".run-rendered").count() == 0
    # a run that does not end: Stop ends it
    editor.fill("forever")
    panel.locator(".run-go").click()
    assert status.text_content() == "Running…"
    assert (
        panel.locator(".run-go").is_hidden() and panel.locator(".run-stop").is_visible()
    )
    panel.locator(".run-stop").click()
    assert page.evaluate("STOPPED") == 1 and status.text_content() == "Stopped"
    assert (
        panel.locator(".run-go").is_visible() and panel.locator(".run-stop").is_hidden()
    )
    # Reset: the code and the input as the page has them
    panel.locator(".run-reset").click()
    assert editor.input_value() == "print(input())\n" and stdin.input_value() == "hello"
    panel.locator(".run-tab").nth(1).click()
    assert editor.input_value() == "one two\n"
    # closed and opened again, it has what was typed; a note opened meanwhile is not under it
    stdin.fill("kept")
    page.click(".margin-note .note-close")
    assert notes(page) == [] and page.locator(".run-panel").count() == 0
    page.click("#cite-one")
    page.click("#run-one .run-open")
    ns: list[dict] = notes(page)
    assert len(ns) == 2 and overlaps(ns) == 0
    assert stdin.input_value() == "kept"
    # the button closes it too; an open panel is not remembered as a pinned note is
    page.click("#run-one .run-open")
    assert len(notes(page)) == 1
    assert "run" not in page.evaluate(
        "localStorage.getItem('notes-open:' + location.pathname)"
    )
    # the other block: its own code, shown as printed, with the figure it drew and its packages
    page.click("#run-two .run-open")
    panel = page.locator(".margin-note.run-note .run-panel")
    assert panel.locator(".run-tabs").is_hidden()
    panel.locator(".run-editor").fill("plot")
    panel.locator(".run-go").click()
    page.wait_for_timeout(200)
    assert page.evaluate("JOBS.at(-1).packages") == ["some-package"]
    assert panel.locator(".run-stdout").text_content() == "echo \n"
    assert panel.locator(".run-image").count() == 1
    # without a side column the panel is in the text, under its block
    page.set_viewport_size({"width": 420, "height": 800})
    page.wait_for_timeout(300)
    assert page.evaluate(
        "document.querySelector('.run-panel').closest('.margin-note').classList.contains('inline')"
    )
    assert page.evaluate(OVERFLOW) == 0
    assert panel.locator(".run-stdout").text_content() == "echo \n"

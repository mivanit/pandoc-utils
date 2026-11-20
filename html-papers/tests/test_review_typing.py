"""review.js with real input: keystrokes, clicks, compositions and blocked storage.

An in-page test (test-review.html) dispatches synthetic events; these need the browser's own:
the space bar's default action, link navigation, the target ranges of Backspace, and IME
compositions (driven through the DevTools protocol, as close to a real IME as headless gets).
"""

import json
from pathlib import Path

import pytest
from playwright.sync_api import Page, sync_playwright

FIXTURE = (Path(__file__).parent / "review-fixture.html").absolute()
SHADOW = "document.querySelector('#rv-host').shadowRoot"
STORED = """JSON.parse(localStorage.getItem('review:v1:doc:' + location.pathname)
    || '{"annotations": []}').annotations"""
BLOCK_STORAGE = """Object.defineProperty(window, 'localStorage',
    { get() { throw new DOMException('blocked', 'SecurityError'); } });"""

# select a needle within one element's text (whitespace-tolerant); optionally collapse to its end
SELECT = """([css, needle, caretAfter]) => {
    const el = document.querySelector(css), w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = []; let full = '';
    for (let n; (n = w.nextNode());) {
        if (n.parentElement.closest('.rv-ins')) continue;
        nodes.push([n, full.length]); full += n.data;
    }
    const m = new RegExp(needle.split(' ').join('\\\\s+')).exec(full);
    const at = off => { for (let k = nodes.length - 1; k >= 0; k--) if (nodes[k][1] <= off) return [nodes[k][0], off - nodes[k][1]]; };
    const r = document.createRange(); r.setStart(...at(m.index)); r.setEnd(...at(m.index + m[0].length));
    if (caretAfter) r.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(r);
}"""

# a paragraph as shown: inserted text as [+...], struck text as [-...]
VIEW = """css => {
    const p = document.querySelector(css), struck = [...(CSS.highlights.get('rv-strike') || [])];
    let out = '';
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
        if (n.parentElement.closest('.rv-ins')) { out += '[+' + n.data + ']'; continue; }
        for (let i = 0; i < n.data.length; i++) {
            const hit = struck.some(r => r.isPointInRange(n, i) && !(r.endContainer === n && r.endOffset === i));
            out += hit ? '~' + n.data[i] : n.data[i];
        }
    }
    return out.replace(/\\s+/g, ' ').trim().replace(/(~.)+/g, m => '[-' + m.replace(/~/g, '') + ']');
}"""


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        yield b
        b.close()


def open_page(browser, blocked: bool = False) -> tuple[Page, list[str]]:
    """The fixture in review mode, help dismissed, a name given; and its page errors."""
    ctx = browser.new_context(
        viewport={"width": 1300, "height": 900}, accept_downloads=True
    )
    if blocked:
        ctx.add_init_script(BLOCK_STORAGE)
    page = ctx.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(FIXTURE.as_uri() + "?review=1")
    page.click("text=Got it")
    page.fill("input[aria-label='Your name']", "tester")
    return page, errors


def select(page: Page, css: str, needle: str, caret_after: bool = False) -> None:
    page.evaluate(SELECT, [css, needle, caret_after])
    page.wait_for_timeout(200)  # the selection toolbar is debounced


def view(page: Page, css: str) -> str:
    return page.evaluate(VIEW, css)


def mode(page: Page) -> str:
    return page.evaluate(
        f"{SHADOW}.querySelector('.modes [aria-pressed=true]').textContent"
    )


def test_comment_mode_reads_normally(browser):
    """Space scrolls instead of typing, links work, E leaves and re-enters review mode."""
    page, errors = open_page(browser)
    assert mode(page) == "Comment"
    page.click("#fox")
    y0 = page.evaluate("scrollY")
    page.keyboard.press(" ")
    page.wait_for_timeout(300)
    assert page.evaluate("scrollY") > y0
    assert page.evaluate(STORED) == []
    page.evaluate("scrollTo(0, 0)")
    page.click("#lnk")
    assert page.evaluate("location.hash") == "#top"
    page.keyboard.press("e")
    assert not page.evaluate("document.documentElement.classList.contains('review-on')")
    page.keyboard.press("e")
    assert mode(page) == "Comment"
    assert errors == []


def test_suggest_mode_typing(browser):
    """Suggest edit, typing, Backspace, typing over a selection, undo of a typing run, Esc."""
    page, errors = open_page(browser)
    select(page, "#fox", "quick")
    page.click(".toolbar >> text=Suggest edit")
    page.keyboard.type("slow")
    assert mode(page) == "Suggest"
    assert "[-quick][+slow]" in view(page, "#fox")
    select(page, "#fox", "riverbank", caret_after=True)
    page.keyboard.type(" there")
    page.keyboard.press("Backspace")
    assert "riverbank[+ ther] today." in view(page, "#fox")
    select(page, "#prog", "prefix", caret_after=True)
    for _ in range(6):
        page.keyboard.press("Backspace")
    page.keyboard.type("context")
    assert "[-prefix][+context]" in view(page, "#prog")
    page.keyboard.press("Control+z")  # the whole run of edits, one step
    assert "prefix," in view(page, "#prog") and "[+" not in view(page, "#prog")
    page.keyboard.press("Control+Shift+z")
    assert "[-prefix][+context]" in view(page, "#prog")
    page.keyboard.press("Escape")
    assert mode(page) == "Comment"
    assert page.evaluate("document.documentElement.classList.contains('review-on')")
    assert errors == []


def test_suggest_mode_links_and_double_click(browser):
    """In Suggest mode a plain click on a link places the caret, Ctrl+click follows it;
    a double-click in Comment mode starts suggesting, its word replaced by typing."""
    page, errors = open_page(browser)
    page.click("text=Suggest")
    page.click("#lnk")
    assert page.evaluate("location.hash") == ""
    page.click("#lnk", modifiers=["Control"])
    assert page.evaluate("location.hash") == "#top"
    page.keyboard.press("Escape")
    page.dblclick("#prog >> text=autoregressivity")
    page.keyboard.type("causality")
    assert mode(page) == "Suggest"
    assert "[-autoregressivity][+causality]" in view(page, "#prog")
    assert errors == []


def test_compositions(browser):
    """A dead key and a multi-step IME: the page's text is unchanged, one suggestion holds the result."""
    page, errors = open_page(browser)
    page.click("text=Suggest")
    select(page, "#fox", "riverbank", caret_after=True)
    cdp = page.context.new_cdp_session(page)
    cdp.send(
        "Input.imeSetComposition", {"text": "´", "selectionStart": 1, "selectionEnd": 1}
    )
    cdp.send("Input.insertText", {"text": "é"})
    for step in ("n", "に", "にほ"):
        cdp.send(
            "Input.imeSetComposition",
            {"text": step, "selectionStart": len(step), "selectionEnd": len(step)},
        )
    cdp.send("Input.insertText", {"text": "日本"})
    page.wait_for_timeout(300)
    own_text = page.evaluate(
        "[...document.querySelector('#fox').childNodes]"
        ".filter(n => !(n.classList && n.classList.contains('rv-ins')))"
        ".map(n => n.textContent).join('').replace(/\\s+/g, ' ').trim()"
    )
    assert (
        own_text
        == "The quick brown fox jumps over the lazy dog near the riverbank today."
    )
    assert [a["replacement"] for a in page.evaluate(STORED)] == ["é日本"]
    assert errors == []


def test_emptied_insertion_and_struck_selection(browser):
    """Backspacing an insertion to nothing leaves no suggestion (and no error); deleting a
    selection of struck text strikes nothing more."""
    page, errors = open_page(browser)
    page.click("text=Suggest")
    page.click("#fox")
    select(page, "#fox", "riverbank", caret_after=True)
    page.keyboard.type("a")
    page.keyboard.press("Backspace")
    assert page.evaluate(STORED) == []
    select(page, "#fox", "quick")
    page.keyboard.press("Delete")
    select(page, "#fox", "quick")
    page.keyboard.press("Delete")
    assert "The [-quick] brown" in view(page, "#fox")
    assert errors == []


def test_page_form_fields(browser):
    """A field of the page's own keeps its typing, its undo and its compositions."""
    page, errors = open_page(browser)
    page.click("text=Suggest")
    page.click("#fox")
    select(page, "#fox", "riverbank", caret_after=True)
    page.keyboard.type("x")
    page.click("#field")
    page.keyboard.type("abc")
    page.keyboard.press("Control+z")
    assert page.input_value("#field") != "abc"
    cdp = page.context.new_cdp_session(page)
    cdp.send(
        "Input.imeSetComposition", {"text": "´", "selectionStart": 1, "selectionEnd": 1}
    )
    cdp.send("Input.insertText", {"text": "é"})
    page.wait_for_timeout(300)
    assert "é" in page.input_value("#field")
    assert [a["replacement"] for a in page.evaluate(STORED)] == ["x"]
    assert errors == []


def test_blocked_storage(browser):
    """Storage blocked (as in some embedded previews): a warning, and everything still works for the tab."""
    page, errors = open_page(browser, blocked=True)
    assert page.locator("text=This view blocks browser storage").count() == 1
    select(page, "#fox", "brown fox")
    page.click(".toolbar >> text=Comment")
    page.keyboard.type("line one")
    page.keyboard.press("Shift+Enter")
    page.keyboard.type("line two")
    page.keyboard.press("Enter")
    page.click("button.primary >> nth=0")
    with page.expect_download() as dl:
        page.click("text=Download file")
    data = json.loads(Path(dl.value.path()).read_text())
    assert data["reviewer"] == "tester"
    assert data["doc"]["commit"] == "abc123"
    assert [a["body"] for a in data["annotations"]] == ["line one\nline two"]
    assert errors == []

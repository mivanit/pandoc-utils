/**
 * Keeps the reader's place when the text reflows, for a pandoc HTML page.
 * From https://github.com/mivanit/pandoc-utils, html-papers/.
 *
 *     <script src="keep-place.js" defer></script>
 *
 * When the text's column changes width (a column dragged, the menu's widths, the window
 * resized), its lines break elsewhere and everything further down moves, so the reader is
 * suddenly somewhere else. This script remembers the words at the middle of the window, and
 * after such a change scrolls the page so that they are where they were.
 *
 * It acts on a `doclayout` event on document (contents.js, popups.js and menu.js dispatch one
 * when they move the text) and on the window's resize, and only if the text's width changed:
 * a note opening in the text also moves what is below it, and there the page should stay put.
 * What the scripts add to the page (`data-doc-chrome`, notes, review.js's panel) is never the
 * place.
 */
(function () {
  const NOT_TEXT = '[data-doc-chrome], #rv-host, .margin-note';
  const middle = () => innerHeight / 2;
  // the place: a character (`range`) or, where there is no text (a figure), a point part of
  // the way down an element; `top` is where it was in the window, `width` the text's width then
  let place = null;
  let quiet = 0;  // until then, a scroll is this script's own

  // the n-th character of an element's text, as a range, and its box (null: not drawn, as
  // the white space between lines of the source is not)
  function character(nodes, n) {
    for (const node of nodes) {
      if (n < node.length) {
        const range = document.createRange();
        range.setStart(node, n);
        range.setEnd(node, n + 1);
        return { range, box: range.getClientRects()[0] || null };
      }
      n -= node.length;
    }
    return null;
  }
  // the first character of an element at or below a height in the window: its text runs
  // downwards, so halving finds it
  function characterAt(el, y) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
    let total = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement.closest(NOT_TEXT)) continue;
      nodes.push(node);
      total += node.length;
    }
    let low = 0, high = total - 1, found = null;
    while (low <= high) {
      const mid = (low + high) >> 1;
      let at = character(nodes, mid);
      for (let more = 1; at && !at.box && more <= 3; more++) at = character(nodes, mid + more);  // past white space
      if (at && at.box && at.box.bottom > y) { found = at; high = mid - 1; } else low = mid + 1;
    }
    return found;
  }
  function remember() {
    const body = document.body.getBoundingClientRect();
    const x = body.left + body.width / 2, y = middle();
    place = null;
    // what is at the middle of the window, or a little above or below (between two paragraphs
    // there is nothing)
    for (const off of [0, 16, -16, 32, -32, 64, -64, 128, -128]) {
      const el = document.elementsFromPoint(x, y + off).find((e) => e !== document.body && document.body.contains(e) && !e.closest(NOT_TEXT));
      if (!el) continue;
      const at = characterAt(el, y + off);
      if (at) place = { range: at.range, top: at.box.top };
      else {
        const box = el.getBoundingClientRect();
        place = { el, part: box.height ? (y + off - box.top) / box.height : 0, top: y + off };
      }
      place.width = document.body.clientWidth;
      return;
    }
  }
  // where the place is now, in the window; null if it is gone (the text was edited)
  function now() {
    if (place.range) {
      const box = place.range.startContainer.isConnected && place.range.getClientRects()[0];
      return box ? box.top : null;
    }
    if (!place.el.isConnected) return null;
    const box = place.el.getBoundingClientRect();
    return box.top + place.part * box.height;
  }
  function keep() {
    if (!place || document.body.clientWidth === place.width) return;  // the text did not reflow
    place.width = document.body.clientWidth;
    const top = now();
    if (top === null) { remember(); return; }
    if (Math.abs(top - place.top) < 1) return;
    quiet = performance.now() + 200;
    scrollBy(0, top - place.top);
  }

  let waiting = 0;
  addEventListener('scroll', () => {
    if (performance.now() < quiet) return;  // our own scroll: the place is the same
    clearTimeout(waiting);
    waiting = setTimeout(remember, 120);  // once the reader has stopped
  }, { passive: true });
  document.addEventListener('doclayout', keep);
  addEventListener('resize', keep);
  addEventListener('load', remember);
  remember();
})();

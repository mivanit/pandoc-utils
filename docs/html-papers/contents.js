/**
 * A contents sidebar for a pandoc HTML page (styles and layout in html-papers.css).
 * From https://github.com/mivanit/pandoc-utils, html-papers/.
 *
 *     <script src="contents.js" defer
 *       data-contents-headings="h1[id], h2[id]"   which headings it lists (the default)
 *       data-contents-title="Contents"></script>
 *
 * Pinned (as it starts), the contents are the page's left column where there is room for one;
 * the column's right edge drags to resize it, and a double click puts it back. Unpinned, or
 * without room, a thin tab at the left edge: the panel slides out while the pointer is left of
 * the text, or on a tap on the tab. On a phone the tab is a round button, and a swipe to the
 * right opens the panel (to the left, or a tap outside, closes it). Pin and the width are
 * remembered in this browser. The section being read is highlighted. Section numbers come
 * from pandoc's `.header-section-number`. The page title (`.title`) is not listed; its place is
 * the panel's own title, which scrolls to the top.
 *
 * On <html>: `toc-open` while the panel is out, `toc-pinned` while pinned, `--toc` its width
 * (html-papers.css makes it a column where there is room). The panel, tab and edge are
 * `data-doc-chrome`: not the document's text, to review.js and popups.js.
 */
(function () {
  const CFG = (document.currentScript && document.currentScript.dataset) || {};
  const TITLE = CFG.contentsTitle || 'Contents';
  const root = document.documentElement;
  function chrome(el) {
    el.setAttribute('data-doc-chrome', '');
    el.setAttribute('contenteditable', 'false');
    return el;
  }
  const heads = [...document.querySelectorAll(CFG.contentsHeadings || 'h1[id], h2[id]')].filter((h) => !h.classList.contains('title'));
  const nav = chrome(document.createElement('nav'));
  nav.id = 'toc-nav';
  nav.setAttribute('aria-label', TITLE);
  nav.innerHTML = '<div class="toc-top"><a href="#" class="toc-title"></a>'
    + '<button type="button" class="toc-pin" aria-pressed="false">Pin</button></div>';
  nav.querySelector('.toc-title').textContent = TITLE;
  const list = document.createElement('ol');
  const links = heads.map((h) => {
    const num = h.querySelector('.header-section-number');
    const label = h.cloneNode(true);
    label.querySelector('.header-section-number')?.remove();
    const li = document.createElement('li');
    li.className = 'toc-' + h.tagName.toLowerCase();
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.innerHTML = (num ? '<span class="toc-num">' + num.textContent + '</span> ' : '') + label.innerHTML.trim();
    a.querySelectorAll('a').forEach((inner) => inner.replaceWith(...inner.childNodes));  // links in headings: text only
    li.append(a);
    list.append(li);
    return a;
  });
  nav.append(list);
  const tab = chrome(document.createElement('button'));
  tab.type = 'button';
  tab.id = 'toc-tab';
  tab.setAttribute('aria-label', TITLE);
  tab.append(document.createElement('span'));
  tab.firstChild.textContent = TITLE;
  document.body.append(tab, nav);
  const pin = nav.querySelector('.toc-pin');
  const remember = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) { /* no storage: not remembered */ } };
  const recall = (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } };
  function setPinned(on, keep) {
    root.classList.toggle('toc-pinned', on);
    pin.setAttribute('aria-pressed', on);
    pin.textContent = on ? 'Unpin' : 'Pin';
    if (keep) remember('toc-pinned', on ? '1' : '');
  }
  setPinned(recall('toc-pinned') !== '', false);  // pinned until the reader unpins it

  // The column's right edge drags (--toc, html-papers.css), remembered; a double click puts it
  // back. It shows only while the contents are a column (html-papers.css).
  const TOC_MIN = 10, TOC_MAX = 30;  // rem
  const handle = chrome(document.createElement('div'));
  handle.id = 'toc-handle';
  handle.className = 'col-handle';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Resize the contents');
  handle.title = 'Drag to resize; double click to reset';
  document.body.append(handle);
  const docked = () => getComputedStyle(handle).display !== 'none';
  const rem = () => parseFloat(getComputedStyle(root).fontSize);
  const setWidth = (px) => root.style.setProperty('--toc', Math.max(TOC_MIN, Math.min(TOC_MAX, px / rem())).toFixed(2) + 'rem');
  if (parseFloat(recall('toc-width'))) setWidth(parseFloat(recall('toc-width')) * rem());
  handle.addEventListener('pointerdown', (event) => {
    if (event.button) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('dragging');
    root.classList.add('col-dragging');
    const move = (e) => setWidth(e.clientX);
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.classList.remove('dragging');
      root.classList.remove('col-dragging');
      setWidth(nav.offsetWidth);  // what it came to, not what was asked for
      remember('toc-width', (nav.offsetWidth / rem()).toFixed(2));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
    handle.addEventListener('pointercancel', up, { once: true });
  });
  handle.addEventListener('dblclick', () => { root.style.removeProperty('--toc'); remember('toc-width', null); });
  const open = (on) => root.classList.toggle('toc-open', on);
  // a mouse over the tab opens the panel (a tap is the click below, alone)
  tab.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') open(true); });
  tab.addEventListener('click', () => open(!root.classList.contains('toc-open')));
  // the panel opens while the pointer is over the strip it would cover but left of the text
  // (zoomed in, the text starts near the edge: reading it must not open the panel), and
  // closes once the pointer is right of it
  document.addEventListener('mousemove', (event) => {
    if (tab.offsetHeight < 3 * tab.offsetWidth) return;  // the tab is a button (a phone), not a strip along the edge
    const width = nav.offsetWidth, b = document.body;
    const textLeft = b.getBoundingClientRect().left + parseFloat(getComputedStyle(b).paddingLeft);
    if (event.clientX <= Math.min(width, textLeft - 8)) open(true);
    else if (event.clientX > width + 8) open(false);
  });
  pin.addEventListener('click', () => { setPinned(!root.classList.contains('toc-pinned'), true); open(false); });
  // out over the page: a press anywhere else puts it back
  document.addEventListener('pointerdown', (event) => {
    if (root.classList.contains('toc-open') && !docked() && !event.target.closest?.('#toc-nav, #toc-tab')) open(false);
  });
  // A touch screen: a quick swipe to the right opens the panel, one to the left closes it. Not
  // from inside something that scrolls sideways (a wide table), a form field or review.js's
  // panel, and not while text is selected.
  const sideways = (el) => {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.matches('input, textarea, select, [contenteditable="true"], #rv-host')) return true;
      if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    }
    return false;
  };
  let swipe = null;
  document.addEventListener('touchstart', (event) => {
    const t = event.touches.length === 1 ? event.touches[0] : null;
    swipe = t && event.target instanceof Element && !sideways(event.target) ? { x: t.clientX, y: t.clientY, at: event.timeStamp } : null;
  }, { passive: true });
  document.addEventListener('touchend', (event) => {
    if (!swipe) return;
    const t = event.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, quick = event.timeStamp - swipe.at < 600;
    swipe = null;
    if (!quick || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) / 2 || docked() || !getSelection().isCollapsed) return;
    open(dx > 0);
  }, { passive: true });
  nav.addEventListener('click', (event) => { if (event.target.closest('a')) open(false); });
  nav.querySelector('.toc-title').addEventListener('click', (event) => { event.preventDefault(); window.scrollTo({ top: 0 }); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') open(false); });
  // the current section: the last heading above a line a third of the way down the window
  let current = null;
  function mark() {
    const line = innerHeight / 3;
    let i = -1;
    while (i + 1 < heads.length && heads[i + 1].getBoundingClientRect().top < line) i++;
    const a = links[i] || null;
    if (a === current) return;
    current?.classList.remove('current');
    current = a;
    if (!a) return;
    a.classList.add('current');
    if (a.offsetTop < nav.scrollTop + 40 || a.offsetTop > nav.scrollTop + nav.clientHeight - 40) {
      nav.scrollTop = a.offsetTop - nav.clientHeight / 3;
    }
  }
  let queued = false;
  window.addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; mark(); }); }
  }, { passive: true });
  mark();
})();

/**
 * A contents sidebar for a pandoc HTML page (styles and layout in html-papers.css).
 * From https://github.com/mivanit/pandoc-utils, html-papers/.
 *
 *     <script src="contents.js" defer
 *       data-contents-headings="h1[id], h2[id]"   which headings it lists (the default)
 *       data-contents-title="Contents"></script>
 *
 * A thin tab at the left edge; the panel slides out while the pointer is left of the text (or
 * on a tap on the tab), and Pin keeps it open, remembered in this browser. The section being
 * read is highlighted. Section numbers come from pandoc's `.header-section-number`. The page
 * title (`.title`) is not listed; its place is the panel's own title, which scrolls to the top.
 *
 * On <html>: `toc-open` while the panel is out, `toc-pinned` while pinned (html-papers.css
 * moves the text clear of it where there is room). The panel and tab are `data-doc-chrome`:
 * not the document's text, to review.js and popups.js.
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
  function setPinned(on) {
    root.classList.toggle('toc-pinned', on);
    pin.setAttribute('aria-pressed', on);
    pin.textContent = on ? 'Unpin' : 'Pin';
    try { localStorage.setItem('toc-pinned', on ? '1' : ''); } catch (e) { /* no storage: not remembered */ }
  }
  try { setPinned(localStorage.getItem('toc-pinned') === '1'); } catch (e) { setPinned(false); }
  const open = (on) => root.classList.toggle('toc-open', on);
  tab.addEventListener('mouseenter', () => open(true));
  tab.addEventListener('click', () => open(!root.classList.contains('toc-open')));
  // the panel opens while the pointer is over the strip it would cover but left of the text
  // (zoomed in, the text starts near the edge: reading it must not open the panel), and
  // closes once the pointer is right of it
  document.addEventListener('mousemove', (event) => {
    const width = nav.offsetWidth, b = document.body;
    const textLeft = b.getBoundingClientRect().left + parseFloat(getComputedStyle(b).paddingLeft);
    if (event.clientX <= Math.min(width, textLeft - 8)) open(true);
    else if (event.clientX > width + 8) open(false);
  });
  pin.addEventListener('click', () => { setPinned(!root.classList.contains('toc-pinned')); open(false); });
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

/**
 * Margin notes and previews for a pandoc HTML page (styles and layout in html-papers.css).
 * From https://github.com/mivanit/pandoc-utils, html-papers/.
 *
 *     <script src="popups.js" defer
 *       data-popups-preview="h1, h2, figure, table"></script>   what a cross-reference can show
 *
 * Anchors, in the text or in a note:
 * - a citation (`.citation[data-cites]`, pandoc --citeproc): its references from `#refs`;
 * - a footnote mark (`a.footnote-ref`): the footnote;
 * - a term (`a.term` with a `title`): the title, as its definition;
 * - a table cell holding `.cell-note > .cell-note-body`: that note (a footnote in a cell);
 * - any other link to an id on this page whose target matches data-popups-preview: a copy of
 *   the target. A heading shows its section up to the first subsection, then its subsections
 *   as links.
 *
 * Hovering an anchor shows its note in the right margin, level with it. A link inside a note
 * is an anchor too, its note opening below that one, so the hover notes are one chain, from
 * the text down through notes. A click on a hover note, or a middle click on its anchor, pins
 * it (and the hover notes it came from), with a × that closes it and every note opened from
 * it. A click on a citation, footnote mark or table-note cell pins or unpins directly. Notes
 * never overlap, an open note does not move when notes open from it, and a thin line joins
 * each note to its anchor. Without room for a margin (html-papers.css) the newest note shows
 * in a panel at the bottom, on a tap.
 *
 * For the page's own scripts:
 * - `window.MarginNotes`: `show(key, anchor, html)` puts a note of the page's own beside an
 *   element, `hide(key)` removes it, `place()` lays the notes out again (after the page moved
 *   things), `narrow()` says whether the margin is the bottom panel;
 * - a `popups:preview` event on document, `detail: {box, target}`, before a preview's copy is
 *   shown: change `box` to fix up the copy (drop an iframe, say);
 * - with review.js: everything added here is `data-doc-chrome` (not the document's text), each
 *   note is `data-doc-avoid` (comment lines pass behind it), and a `doclayout` event on
 *   document follows every layout.
 */
(function () {
  const CFG = (document.currentScript && document.currentScript.dataset) || {};
  const PREVIEWABLE = CFG.popupsPreview || 'h1, h2, h3, h4, h5, h6, figure, table, div[id^="fig:"]';
  const PREVIEW_MAX = 36;  // rem: a preview's width, where the window allows
  const REST = 120, REST_IN_TRANSIT = 450;  // ms the pointer rests on an anchor before its note opens
  const HOVER_BAND = 48;  // px above and below an anchor in which its hover note stays

  // What this script adds to the page is not the document's text: review.js skips it, and in
  // its Suggest mode, where the page is editable, it stays read-only.
  function chrome(el) {
    el.setAttribute('data-doc-chrome', '');
    el.setAttribute('contenteditable', 'false');
    return el;
  }
  const root = document.documentElement;
  const margin = chrome(document.createElement('aside'));
  margin.id = 'margin-notes';
  margin.setAttribute('aria-live', 'polite');
  const lines = chrome(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
  lines.id = 'note-lines';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  lines.append(path);
  document.body.append(margin, lines);
  // no room for a margin: html-papers.css makes the notes a panel fixed at the bottom
  const narrow = () => getComputedStyle(margin).position === 'fixed';

  // every link in the bibliography or a note opens in a new tab: the reader keeps their place
  document.addEventListener('click', (event) => {
    const a = event.target.closest('#refs a, #margin-notes a');
    if (a && /^https?:/.test(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener'; }
  }, true);

  const notes = () => [...margin.children];
  const isHover = (n) => n.dataset.key === 'hover';
  const isPreview = (n) => n.classList.contains('preview');
  const hovers = () => notes().filter(isHover);
  const shown = (key) => notes().some((c) => c.dataset.key === key);
  // a note and every note opened from it, at any depth
  const tree = (n) => notes().filter((m) => { for (let p = m; p; p = p.parentNote) if (p === n) return true; return false; });
  const byY = (a, b) => a.y - b.y;

  // Each note sits level with its anchor, pushed down past the notes above; a note opened from
  // a note goes right below it (and its earlier children).
  function place() {
    const all = notes();
    if (narrow()) {
      for (const n of all) { n.style.width = ''; n.style.maxHeight = ''; }
      draw();
      return;
    }
    const body = document.body.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(root).fontSize);
    // a preview may widen up to the window's edge, or review.js's comment column
    const room = innerWidth - (parseFloat(getComputedStyle(root).getPropertyValue('--review-width')) || 0) - margin.getBoundingClientRect().left - 24;
    const kids = new Map(all.map((n) => [n, []])), roots = [];
    for (const n of all) {
      if (isPreview(n)) n.style.width = Math.max(margin.offsetWidth, Math.min(room, PREVIEW_MAX * rem)) + 'px';
      n.y = n.anchor.getBoundingClientRect().top;  // in the window
      (n.parentNote && kids.has(n.parentNote) ? kids.get(n.parentNote) : roots).push(n);
    }
    // An open note doesn't move when notes open from it. A hover note from the text moves up to
    // fit in the window only while it is alone (its images may still be loading). A note with
    // notes opened from it is cut off (scrolling) a little below the lowest link that opened one,
    // if that leaves the window's bottom 12rem for them; nothing above the cut moves. A preview
    // opened from a note gets the window below it (at least 10rem). Both are worked out when the
    // notes open, not on later layouts (the page may have scrolled since: nothing should resize).
    const chain = all.filter(isHover), first = chain[0];
    if (chain.length === 1 && !first.parentNote) first.shift = Math.max(Math.min(0, innerHeight - first.y - first.offsetHeight - 12), 12 - first.y);
    let floor = 0;  // in the body's coordinates, as the notes' tops
    function put(n) {
      const top = n.parentNote ? floor : Math.max(n.y + (n.shift || 0) - body.top, floor);
      n.style.top = top + 'px';
      const k = kids.get(n).sort(byY);
      if (isPreview(n)) {
        if (!n.parentNote) n.cap = 0.7 * innerHeight;
        else if (n.cap === undefined) n.cap = Math.max(10 * rem, innerHeight - 12 - (top + body.top));
        const opened = k.map((c) => c.uid).join(' ');  // the notes opened from it
        if (opened !== n.opened) {
          n.opened = opened;
          n.cut = Infinity;
          if (k.length) {
            const r = n.getBoundingClientRect();
            const below = Math.max(...k.map((c) => c.anchor.getBoundingClientRect().bottom)) - r.top + 1.5 * rem;
            n.cut = Math.max(below, innerHeight - 22 - 12 * rem - r.top);
          }
        }
        n.style.maxHeight = Math.min(n.cap, n.cut) + 'px';
      }
      floor = top + n.offsetHeight + 10;
      k.forEach(put);
    }
    roots.sort(byY).forEach(put);
    draw();
  }
  // From the text: under the anchor to the gap between text and margin, down, into the note.
  // From a note: under the anchor to the left of that note, down, into the child note.
  function draw() {
    let d = '';
    if (!narrow()) {
      const body = document.body.getBoundingClientRect();
      const gap = (body.right - parseFloat(getComputedStyle(document.body).paddingRight) + margin.getBoundingClientRect().left) / 2;
      const X = (v) => (v - body.left).toFixed(1), Y = (v) => (v - body.top).toFixed(1);
      for (const n of notes()) {
        const rects = n.anchor.getClientRects();
        if (!n.linked || !rects.length) continue;
        const a = rects[rects.length - 1], r = n.getBoundingClientRect();
        if (n.parentNote) {
          const p = n.parentNote.getBoundingClientRect(), ay = Math.min(Math.max(a.bottom, p.top), p.bottom);
          d += `M${X(a.right)} ${Y(ay)}H${X(p.left - 6)}V${Y(r.top + 10)}H${X(r.left)}`;
        } else d += `M${X(a.left)} ${Y(a.bottom)}H${X(gap)}V${Y(r.top + 10)}H${X(r.left)}`;
      }
    }
    path.setAttribute('d', d);
    document.dispatchEvent(new Event('doclayout'));  // review.js redraws its lines around the notes
  }
  margin.addEventListener('scroll', draw, true);  // a preview scrolled inside moves its links
  const resized = new ResizeObserver(() => place());  // e.g. a preview's images loading
  resized.observe(document.body);
  let lastNote = 0;
  function addClose(n) {
    const close = document.createElement('button');
    close.className = 'note-close';
    close.setAttribute('aria-label', 'Close note');
    close.textContent = '×';
    close.addEventListener('click', () => drop([n]));
    n.prepend(close);
  }
  // opts: pinKey (the key a hover note takes when pinned), cls ('preview'), parent (the note
  // the anchor is in), linked (draw its line)
  function show(key, anchor, html, closable, opts = {}) {
    const n = document.createElement('div');
    n.className = 'margin-note' + (opts.cls ? ' ' + opts.cls : '');
    n.setAttribute('data-doc-avoid', '');  // review.js's comment lines pass behind it
    n.dataset.key = key;
    n.uid = ++lastNote;
    n.anchor = anchor;
    n.pinKey = opts.pinKey;
    n.parentNote = opts.parent || null;
    n.linked = !!opts.linked;
    n.innerHTML = html;
    if (closable) addClose(n);
    margin.append(n);  // last = newest, which the narrow layout shows
    resized.observe(n);
    place();
    return n;
  }
  // take notes, and every note opened from them, off the page
  function drop(list) {
    for (const n of list) for (const m of tree(n)) { resized.unobserve(m); m.remove(); }
    place();
  }
  const hide = (key) => drop(notes().filter((c) => c.dataset.key === key));
  function pinNote(n) {
    for (let m = n; m; m = m.parentNote) if (isHover(m)) { m.dataset.key = m.pinKey; addClose(m); }
    place();
  }

  // Anchors. Each gets its own key, so a pinned note belongs to the anchor it was opened from.
  const ids = new WeakMap();
  let lastId = 0;
  function keyOf(a) {
    if (!ids.has(a)) ids.set(a, ++lastId);
    return 'note:' + ids.get(a);
  }
  // not anchors: links in other scripts' furniture (a contents sidebar), in the bibliography,
  // and a note's own controls
  const SKIP = '[data-doc-chrome]:not(#margin-notes), #refs, .note-more, .note-close, .footnote-back, [data-popups-skip]';
  function anchorOf(t) {
    if (!(t instanceof Element) || t.closest(SKIP)) return null;
    const a = t.closest('.citation[data-cites], a.term, a.footnote-ref, a[href^="#"]');
    if (a) return a.closest('.citation[data-cites]') || a;  // a citation's own links: the citation
    const cell = t.closest('td, th');
    return cell && cell.querySelector('.cell-note') ? cell : null;
  }
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // the note's html and class, or null when the anchor has none
  function content(a) {
    if (a.matches('.citation')) {
      // every reference it names, in bibliography (= number) order, as the [n, m] in the text
      const entries = a.dataset.cites.split(' ').map((k) => document.getElementById('ref-' + k)).filter(Boolean)
        .sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      return entries.length ? { html: entries.map((e) => '<div class="note-ref">' + e.innerHTML + '</div>').join('') } : null;
    }
    if (a.matches('a.term')) return a.dataset.def ? { html: '<span class="note-head">' + a.innerHTML + '</span> ' + escape(a.dataset.def) } : null;
    if (a.matches('a.footnote-ref')) {
      // the note's text without its back link
      const li = document.getElementById(a.getAttribute('href').slice(1));
      if (!li) return null;
      const body = li.cloneNode(true);
      body.querySelectorAll('.footnote-back').forEach((b) => b.remove());
      return { html: '<span class="note-head">' + a.textContent + '</span> ' + body.innerHTML };
    }
    if (a.matches('td, th')) {
      const body = a.querySelector('.cell-note-body');
      return body ? { html: '<span class="note-head">*</span> ' + body.innerHTML } : null;
    }
    const target = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
    if (!target || target.contains(a) || !target.matches(PREVIEWABLE)) return null;
    return { html: preview(target), cls: 'preview' };
  }
  // has a note: open now, or one to make
  const hasNote = (a) => hovers().some((n) => n.anchor === a) || shown(keyOf(a)) || !!content(a);
  // the anchor's hover note, replacing the hover notes outside the chain it is in; nothing if
  // its note is already pinned
  function hover(a) {
    if (narrow() || hovers().some((n) => n.anchor === a) || shown(keyOf(a))) return;
    const c = content(a);
    if (!c) return;
    const parent = a.closest('.margin-note'), keep = new Set();
    for (let p = parent; p; p = p.parentNote) keep.add(p);
    drop(hovers().filter((n) => !keep.has(n)));
    show('hover', a, c.html, false, { pinKey: keyOf(a), cls: c.cls, parent, linked: true });
  }
  // a click (or middle click) on an anchor: pin its note, or close it if pinned
  function clickPin(a, extra = '') {
    const key = keyOf(a), h = hovers().find((n) => n.anchor === a);
    if (shown(key)) hide(key);
    else if (h) pinNote(h);
    else {
      const c = content(a);
      if (c) pinNote(show(key, a, c.html + extra, true, { cls: c.cls, parent: a.closest('.margin-note'), linked: true }));
    }
  }
  // An anchor's note opens once the pointer rests on it: briefly, or longer when the pointer is
  // on its way to an open hover note (toward), so crossing other links on the way doesn't
  // replace it.
  let resting = null;
  document.addEventListener('mouseover', (event) => {
    const a = anchorOf(event.target);
    clearTimeout(resting);
    if (!a || event.buttons) return;  // not while selecting text (to comment on it, say)
    const transit = !event.target.closest('.margin-note') && hovers().some((n) => n.anchor !== a && toward(n, event.clientX, event.clientY));
    resting = setTimeout(() => { if (a.matches(':hover')) hover(a); }, transit ? REST_IN_TRANSIT : REST);
  });
  document.addEventListener('click', (event) => {
    const t = event.target, n = t.closest('.margin-note'), a = anchorOf(t);
    // following a note's own in-page link closes it
    if (n && t.closest('.note-more')) { drop([n]); return; }
    // citations and footnotes pin; a table note pins on a click anywhere in its cell
    if (a && (a.matches('.citation, a.footnote-ref') || (a.matches('td, th') && !t.closest('a'))) && hasNote(a)) {
      event.preventDefault();
      clickPin(a);
      return;
    }
    // Without a margin (no hover) a tap on a term opens its definition, with the link the tap
    // would have followed, instead of jumping there. Cross-references just go.
    if (a && a.matches('a.term') && narrow() && hasNote(a)) {
      event.preventDefault();
      clickPin(a, ' <a class="note-more" href="' + escape(a.getAttribute('href')).replace(/"/g, '&quot;') + '">Go to the section ›</a>');
      return;
    }
    // a click on a hover note, not on a link or button in it, pins it
    if (n && isHover(n) && !t.closest('a, button')) pinNote(n);
  });
  // a middle click pins: on an anchor with a note (instead of opening its link in a new tab),
  // or on a hover note; no autoscroll on either
  const middleTarget = (t) => { const a = anchorOf(t); return a && hasNote(a) ? a : null; };
  document.addEventListener('mousedown', (event) => {
    if (event.button === 1 && (middleTarget(event.target) || event.target.closest?.('.margin-note'))) event.preventDefault();
  });
  document.addEventListener('auxclick', (event) => {
    if (event.button !== 1) return;
    const a = middleTarget(event.target), n = event.target.closest?.('.margin-note');
    if (a) { event.preventDefault(); clickPin(a); }
    else if (n && isHover(n) && !event.target.closest('a')) { event.preventDefault(); pinNote(n); }
  });

  // A hover note stays while the pointer is over it or a note opened from it. One from a note
  // also stays while the pointer is over that note (to try its other links); one from the text,
  // while the pointer is in a band about an inch tall around its anchor (any distance
  // sideways), or on the way from the anchor to the note.
  let pointerX = 0, pointerY = null;
  const inside = (r, x, y, pad) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  function keeps(n, x, y) {
    if (tree(n).some((m) => inside(m.getBoundingClientRect(), x, y, 12))) return true;
    if (n.parentNote) return inside(n.parentNote.getBoundingClientRect(), x, y, 12);
    const a = n.anchor.getBoundingClientRect();
    return (y >= a.top - HOVER_BAND && y <= a.bottom + HOVER_BAND) || toward(n, x, y);
  }
  // on the way to a hover note from the text: in the triangle from its anchor to the note's
  // left edge, so any straight path to the note works
  function toward(n, x, y) {
    if (n.parentNote) return false;
    const a = n.anchor.getBoundingClientRect(), r = n.getBoundingClientRect();
    const ax = a.left, ay = (a.top + a.bottom) / 2, t = r.top - HOVER_BAND, b = r.bottom + HOVER_BAND;
    if (x < ax || x > r.left) return false;
    const f = (x - ax) / Math.max(1, r.left - ax);  // 0 at the anchor, 1 at the note
    return y >= ay + f * (t - ay) && y <= ay + f * (b - ay);
  }
  function dropHovers() {
    if (pointerY === null) return;
    const gone = hovers().filter((n) => !keeps(n, pointerX, pointerY));
    if (gone.length) drop(gone);
  }
  document.addEventListener('mousemove', (event) => { pointerX = event.clientX; pointerY = event.clientY; dropHovers(); });
  window.addEventListener('scroll', dropHovers, { passive: true });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hide('hover'); });

  // Terms: the definition is the link's title, moved so the browser's slow tooltip stays away
  // (copies in previews keep data-def)
  document.querySelectorAll('a.term[title]').forEach((a) => {
    a.dataset.def = a.title;
    a.removeAttribute('title');
  });

  // A cross-reference's preview: a copy of the target.
  const HEADING = /^H[1-6]$/;
  function preview(target) {
    const box = document.createElement('div');
    if (HEADING.test(target.tagName)) {
      const level = Number(target.tagName[1]), subs = [];
      box.append(target.cloneNode(true));
      for (let el = target.nextElementSibling; el && !(HEADING.test(el.tagName) && Number(el.tagName[1]) <= level); el = el.nextElementSibling) {
        if (el.matches('[data-doc-chrome], #rv-host, .footnotes, script')) break;  // the page's furniture, at the end
        if (HEADING.test(el.tagName)) subs.push(el);
        else if (!subs.length) box.append(el.cloneNode(true));
      }
      if (subs.length) {
        const list = document.createElement('div');
        list.className = 'preview-subs';
        for (const h of subs) {
          const a = document.createElement('a');
          a.href = '#' + h.id;
          a.className = 'preview-sub-' + h.tagName.toLowerCase();
          a.innerHTML = h.innerHTML;
          a.querySelectorAll('a').forEach((inner) => inner.replaceWith(...inner.childNodes));
          list.append(a);
        }
        box.append(list);
      }
    } else box.append(target.cloneNode(true));
    document.dispatchEvent(new CustomEvent('popups:preview', { detail: { box, target } }));  // the page's own fix-ups
    box.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    box.querySelectorAll('.rv-ins').forEach((e) => e.remove());  // review.js's suggested insertions: not the text
    return box.innerHTML;
  }

  window.MarginNotes = {
    show: (key, anchor, html) => show(key, anchor, html, false),
    hide,
    place,
    narrow,
  };
})();

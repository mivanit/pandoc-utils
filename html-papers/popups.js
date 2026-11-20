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
 * never overlap and are in the order of the text, an open note does not move when notes open
 * from it, and a thin line through the gutter joins each note to its anchor, which is tinted
 * while its note is open. A preview of a figure or table is scaled to fit its box, so it has
 * no scrollbar. Pinned notes are remembered for the page in this browser.
 *
 * The margin is the page's side column (html-papers.css), and its left edge drags to resize
 * it, remembered in this browser (a double click puts it back). On a touch screen, where no
 * pointer rests on a link, one tap on a link opens its note, with the link itself inside.
 * Without a side column (a phone) a note opens in the text, under the block its link is in.
 *
 * The reader's settings are in `window.DocOptions`, for menu.js: the column's width, whether a
 * note opens under a resting pointer (off: a click opens it, as a tap does), and whether
 * pinned notes are remembered.
 *
 * For the page's own scripts:
 * - `window.MarginNotes`: `show(key, anchor, html)` puts a note of the page's own beside an
 *   element, `hide(key)` removes it, `place()` lays the column out again (after the page moved
 *   things), `narrow()` says whether there is no margin (notes go in the text);
 * - a `doccolumn` event on document, `detail: {items: []}`, at every layout: this script lays
 *   out the whole side column (`MarginNotes.column`), so another script with boxes for it
 *   adds `{top, left, height, place(top)}` for each: where its anchor is and how tall the box
 *   is, in page coordinates. They are stacked with the notes in the order of the text, and
 *   `place` is called with each one's top (review.js: its comment cards);
 * - a `popups:preview` event on document, `detail: {box, target}`, before a preview's copy is
 *   shown: change `box` to fix up the copy (drop an iframe, say);
 * - with review.js: everything added here is `data-doc-chrome` (not the document's text), each
 *   note is `data-doc-avoid` and `data-doc-reserve` (for a review.js that places its own
 *   cards: its lines pass behind such a box and its cards keep clear of it), and a `doclayout`
 *   event on document follows every layout. One from another script (contents.js moved the
 *   text) lays the column out again.
 */
(function () {
  const CFG = (document.currentScript && document.currentScript.dataset) || {};
  const PREVIEWABLE = CFG.popupsPreview || 'h1, h2, h3, h4, h5, h6, figure, table, div[id^="fig:"]';
  const PREVIEW_MAX = 36;  // rem: a preview's width, where the window allows
  const REST = 120, REST_IN_TRANSIT = 450;  // ms the pointer rests on an anchor before its note opens
  const HOVER_BAND = 48;  // px above and below an anchor in which its hover note stays
  const FIT_MIN = 0.3;  // a figure in a preview is scaled down to this, no further
  const SIDE_MIN = 10, SIDE_MAX = 80;  // rem: how far the side column drags (html-papers.css keeps the text its least width)
  const GAP = 10;  // px between one box in the column and the next
  const store = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) { /* no storage: not remembered */ } };
  const recall = (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } };

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
  document.body.append(margin, lines);
  // no side column (a phone): html-papers.css hides the margin, and notes go in the text
  const narrow = () => getComputedStyle(margin).display === 'none';
  // no pointer that can rest on a link (a touch screen): a tap opens its note
  const TOUCH = matchMedia('(hover: none)');
  let hoverOn = recall('notes-hover') !== '0';  // the reader can turn hover notes off (the menu)
  let remembering = recall('notes-remember') !== '0';  // pinned notes come back on the next visit
  // a click opens a term's or a cross-reference's note instead of following the link
  const tapMode = () => narrow() || TOUCH.matches || !hoverOn;

  // every link in the bibliography or a note opens in a new tab: the reader keeps their place
  document.addEventListener('click', (event) => {
    const a = event.target.closest('#refs a, #margin-notes a');
    if (a && /^https?:/.test(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener'; }
  }, true);

  const open = [];  // every note on the page, oldest first: in the margin or (narrow) in the text
  const notes = () => open.slice();
  const isHover = (n) => n.dataset.key === 'hover';
  const isPreview = (n) => n.classList.contains('preview');
  const hovers = () => notes().filter(isHover);
  const shown = (key) => notes().some((c) => c.dataset.key === key);
  // a note and every note opened from it, at any depth
  const tree = (n) => notes().filter((m) => { for (let p = m; p; p = p.parentNote) if (p === n) return true; return false; });
  const byY = (a, b) => a.y - b.y;
  // in the order of the text: by line (anchors within a few px of each other are on one line),
  // then from the left
  function inOrder(list) {
    list.sort(byY);
    let line = 0, start = -Infinity;
    for (const n of list) { if (n.y - start > 8) { line++; start = n.y; } n.line = line; }
    return list.sort((a, b) => a.line - b.line || a.x - b.x);
  }

  // The side column is one stack, in the order of the text: each box sits level with its
  // anchor, or below the box before it. The boxes are this script's notes and whatever other
  // scripts have for the column (review.js: its comment cards), asked for with a `doccolumn`
  // event. A note opened from a note goes right below it (and its earlier children).
  function place() {
    const all = notes(), inText = narrow();
    for (const n of all) if (n.classList.contains('inline') !== inText) home(n);  // the window changed
    if (inText) {
      for (const n of all) { n.style.width = ''; n.style.maxHeight = ''; n.style.top = ''; fit(n, Infinity); }
      draw();
      save();
      return;
    }
    const body = document.body.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(root).fontSize);
    // a preview may widen up to the window's edge, or review.js's comment column
    const room = innerWidth - (parseFloat(getComputedStyle(root).getPropertyValue('--review-width')) || 0) - margin.getBoundingClientRect().left - 24;
    const kids = new Map(all.map((n) => [n, []])), roots = [];
    for (const n of all) {
      if (isPreview(n)) n.style.width = Math.max(margin.offsetWidth, Math.min(room, PREVIEW_MAX * rem)) + 'px';
      const a = n.anchor.getBoundingClientRect();  // in the window
      n.y = a.top;
      n.x = a.left;
      (n.parentNote && kids.has(n.parentNote) ? kids.get(n.parentNote) : roots).push(n);
    }
    // other scripts' boxes: {top, left: where the anchor is, height, place(top)}, page coordinates
    const others = [];
    document.dispatchEvent(new CustomEvent('doccolumn', { detail: { items: others } }));
    for (const o of others) roots.push({ y: o.top - scrollY, x: o.left, height: o.height, place: o.place });
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
      if (n.place) {  // another script's box
        const at = Math.max(n.y - body.top, floor);
        n.place(at + body.top + scrollY);
        floor = at + n.height + GAP;
        return;
      }
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
          if (k.length && !restoring) {  // notes brought back: nobody is reaching for the links
            const r = n.getBoundingClientRect();
            const below = Math.max(...k.map((c) => c.anchor.getBoundingClientRect().bottom)) - r.top + 1.5 * rem;
            n.cut = Math.max(below, innerHeight - 22 - 12 * rem - r.top);
          }
        }
        n.style.maxHeight = Math.min(n.cap, n.cut) + 'px';
        fit(n, Math.min(n.cap, n.cut));
      }
      floor = top + n.offsetHeight + GAP;
      k.forEach(put);
    }
    inOrder(roots).forEach(put);
    draw();
    save();
  }
  // A figure or table in a preview (.preview-fit, as wide as it is in the text) is scaled to
  // the note: to its width, then down to FIT_MIN to the height the note may take, so it has no
  // scrollbar. Its caption keeps the note's size (html-papers.css) and wraps again at each
  // scale, so the height takes a few steps.
  function fit(n, maxHeight) {
    const box = n.querySelector(':scope > .preview-fit');
    if (!box) return;
    const cs = getComputedStyle(n);
    const inner = n.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    let scale = Math.min(1, inner / parseFloat(box.style.width));
    for (let i = 0; i < 5; i++) {
      box.style.setProperty('--fit', scale.toFixed(3));
      if (scale <= FIT_MIN || n.scrollHeight <= maxHeight + 1) break;
      scale = Math.max(FIT_MIN, scale * 0.97 * maxHeight / n.scrollHeight);
    }
  }
  // Where a note lives: the margin or, without one, the text, under the block its anchor is in
  // (after earlier notes of that block; inside a list item; after the whole figure or table
  // for an anchor in a caption or a cell). A note opened from a note stays inside that note.
  function home(n) {
    const inText = narrow();
    n.classList.toggle('inline', inText);
    if (!inText) { margin.append(n); return; }
    const a = n.anchor, parent = n.parentNote;
    const within = (el) => el && (!parent || parent.contains(el));
    let block = a.closest('p, li, dd, blockquote, pre, h1, h2, h3, h4, h5, h6, figure, table');
    for (let f = a.closest('figure, table'); within(f); f = f.parentElement.closest('figure, table')) block = f;
    if (!within(block)) { if (parent) parent.append(n); else a.after(n); return; }
    if (block.matches('li, dd')) { block.append(n); return; }
    let at = block;
    while (at.nextElementSibling && at.nextElementSibling.matches('.margin-note.inline')) at = at.nextElementSibling;
    at.after(n);
  }
  // The lines stay in the gutter, off the text. The anchor of an open note is tinted (.note-open,
  // html-papers.css); a dot at the end of its line of text marks where the line to its note
  // starts, and the line curves from there to the note's edge: straight across when the note is
  // level with its anchor. The column is in the order of the text, so lines do not cross. A
  // note opened from a note: a bracket on that note's left, from the anchor's line to the new
  // note. The note under the pointer, or whose anchor is, has its line and anchor stronger
  // (.active, .note-active). html.lines-off (the menu) turns the lines off.
  let active = null;
  function draw() {
    let svg = '';
    if (!narrow() && !root.classList.contains('lines-off')) {
      const body = document.body.getBoundingClientRect();
      const edge = body.right - parseFloat(getComputedStyle(document.body).paddingRight) + 6;  // just right of the text
      const X = (v) => (v - body.left).toFixed(1), Y = (v) => (v - body.top).toFixed(1);
      const bracket = new Map();  // note -> how many notes opened from it have a line: each a little further out
      for (const n of notes()) {
        const rects = n.anchor.getClientRects();
        if (!n.linked || !rects.length) continue;
        const a = rects[rects.length - 1], r = n.getBoundingClientRect(), to = r.top + 12;
        let x = edge, y = (a.top + a.bottom) / 2, mid = (edge + r.left) / 2;
        if (n.parentNote) {
          const p = n.parentNote.getBoundingClientRect(), nth = bracket.get(n.parentNote) || 0;
          bracket.set(n.parentNote, nth + 1);
          x = p.left;
          y = Math.min(Math.max(y, p.top + 4), p.bottom - 4);
          mid = p.left - 16 - 5 * nth;
        }
        const cls = n === active ? ' class="active"' : '';
        svg += `<path data-uid="${n.uid}"${cls} d="M${X(x)} ${Y(y)}C${X(mid)} ${Y(y)} ${X(mid)} ${Y(to)} ${X(r.left)} ${Y(to)}"/>`
          + `<circle data-uid="${n.uid}"${cls} cx="${X(x)}" cy="${Y(y)}" r="2.2"/>`;
      }
    }
    lines.innerHTML = svg;  // numbers and a fixed class only
    mark();
    own = true;
    document.dispatchEvent(new Event('doclayout'));  // review.js draws its own lines now
    own = false;
  }
  // the anchors of open notes, and the active note's anchor and line
  function mark() {
    if (active && !open.includes(active)) active = null;
    document.querySelectorAll('.note-open').forEach((a) => a.classList.remove('note-open', 'note-active'));
    for (const n of notes()) if (n.linked) { n.anchor.classList.add('note-open'); n.anchor.classList.toggle('note-active', n === active); }
    for (const el of lines.children) el.classList.toggle('active', !!active && el.dataset.uid === String(active.uid));
  }
  document.addEventListener('mouseover', (event) => {
    const t = event.target instanceof Element ? event.target : null;
    const a = t && anchorOf(t);
    const n = (t && t.closest('.margin-note')) || (a && notes().find((m) => m.anchor === a && m.linked)) || null;
    if (n !== active) { active = n; mark(); }
  });
  // another script moved the page (contents.js: its column), without the window changing
  let own = false;
  document.addEventListener('doclayout', () => { if (!own) place(); });
  margin.addEventListener('scroll', draw, true);  // a preview scrolled inside moves its links
  addEventListener('resize', () => place());  // the room beside the column, even if the text stayed as wide
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
    n.setAttribute('data-doc-reserve', '');  // and its cards move clear of it
    n.dataset.key = key;
    n.uid = ++lastNote;
    n.anchor = anchor;
    n.pinKey = opts.pinKey;
    n.parentNote = opts.parent || null;
    n.linked = !!opts.linked;
    n.innerHTML = html;
    if (closable) addClose(n);
    open.push(n);
    home(n);
    resized.observe(n);
    place();
    return n;
  }
  // take notes, and every note opened from them, off the page
  function drop(list) {
    for (const n of list) for (const m of tree(n)) { resized.unobserve(m); m.remove(); open.splice(open.indexOf(m), 1); }
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
  const HEADING = /^H[1-6]$/;
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
    // a figure or table keeps the width it has in the text, scaled to the note (fit); a
    // section is text, and flows at the note's width
    const width = HEADING.test(target.tagName) ? 0 : Math.round(target.getBoundingClientRect().width);
    const html = preview(target);
    return { html: width ? '<div class="preview-fit" style="width:' + width + 'px">' + html + '</div>' : html, cls: 'preview' };
  }
  // has a note: open now, or one to make
  const hasNote = (a) => hovers().some((n) => n.anchor === a) || shown(keyOf(a)) || !!content(a);
  // the anchor's hover note, replacing the hover notes outside the chain it is in; nothing if
  // its note is already pinned
  function hover(a) {
    if (tapMode() || hovers().some((n) => n.anchor === a) || shown(keyOf(a))) return;
    const c = content(a);
    if (!c) return;
    const parent = a.closest('.margin-note'), keep = new Set();
    for (let p = parent; p; p = p.parentNote) keep.add(p);
    drop(hovers().filter((n) => !keep.has(n)));
    show('hover', a, c.html, false, { pinKey: keyOf(a), cls: c.cls, parent, linked: true });
  }
  // where a click opens a term's or a cross-reference's note (tapMode), the note ends with the
  // link the click would have followed
  function more(a) {
    if (!tapMode() || !a.matches('a[href^="#"]') || a.matches('a.footnote-ref')) return '';
    const label = a.matches('a.term') ? 'Go to the section' : 'Go to ' + escape(a.textContent.trim());
    return ' <a class="note-more" href="' + escape(a.getAttribute('href')).replace(/"/g, '&quot;') + '">' + label + ' ›</a>';
  }
  // the anchor's note, pinned: its hover note if that is open, else a new one; null without one
  function pin(a) {
    const h = hovers().find((n) => n.anchor === a);
    if (h) { pinNote(h); return h; }
    const c = content(a);
    return c ? show(keyOf(a), a, c.html + more(a), true, { cls: c.cls, parent: a.closest('.margin-note'), linked: true }) : null;
  }
  // a click (or middle click) on an anchor: pin its note, or close it if pinned
  function clickPin(a) {
    if (shown(keyOf(a))) hide(keyOf(a));
    else pin(a);
  }

  // Pinned notes are remembered for this page in this browser (the reader can turn that off):
  // each as the way to its anchor, [which anchor of the text, what it points to], then the same
  // inside each note it was opened from. If the text changed, what it points to finds it.
  const OPEN_KEY = 'notes-open:' + location.pathname;
  const ANCHORS = '.citation[data-cites], a.term, a.footnote-ref, a[href^="#"], td, th';
  const anchorsIn = (note) => [...(note || document.body).querySelectorAll(ANCHORS)].filter((el) => anchorOf(el) === el && el.closest('.margin-note') === note);
  const sig = (a) => a.dataset.cites || a.getAttribute('href') || 'cell';
  let saved = recall(OPEN_KEY), savedFor = null, restoring = false;
  function save() {
    if (restoring) return;
    const pinned = remembering ? notes().filter((n) => !isHover(n) && n.linked) : [];
    const uids = pinned.map((n) => n.uid).join(' ');
    if (uids === savedFor) return;  // the same notes as last time: nothing to work out
    savedFor = uids;
    const lists = new Map();
    const within = (note) => { if (!lists.has(note)) lists.set(note, anchorsIn(note)); return lists.get(note); };
    const wayTo = (n) => (n.parentNote ? wayTo(n.parentNote) : []).concat([[within(n.parentNote).indexOf(n.anchor), sig(n.anchor)]]);
    const value = pinned.length ? JSON.stringify(pinned.map(wayTo)) : null;
    if (value !== saved) { saved = value; store(OPEN_KEY, value); }
  }
  function restore() {
    if (!remembering || !saved) return;
    restoring = true;
    try {
      for (const way of JSON.parse(saved)) {
        let note = null;
        for (const [i, what] of way) {
          const list = anchorsIn(note);
          const a = list[i] && sig(list[i]) === what ? list[i] : list.find((x) => sig(x) === what);
          note = a ? notes().find((n) => n.anchor === a && !isHover(n)) || pin(a) : null;
          if (!note) break;
        }
      }
    } catch (e) { /* not what this script stored: nothing to restore */ }
    restoring = false;
    save();
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
    // Without a pointer to rest on a link (a touch screen), without a side column (a phone), or
    // with hover notes turned off, one tap on a term or a cross-reference opens its note, with
    // the link the tap would have followed inside it (more), instead of jumping there. A second
    // tap closes the note.
    if (a && a.matches('a[href^="#"]') && tapMode() && hasNote(a)) {
      event.preventDefault();
      clickPin(a);
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
  function preview(target) {
    const box = document.createElement('div');
    if (HEADING.test(target.tagName)) {
      const level = Number(target.tagName[1]), subs = [];
      box.append(target.cloneNode(true));
      for (let el = target.nextElementSibling; el && !(HEADING.test(el.tagName) && Number(el.tagName[1]) <= level); el = el.nextElementSibling) {
        if (el.matches('.margin-note')) continue;  // a note open in the text is not the section's
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
    box.querySelectorAll('.margin-note').forEach((e) => e.remove());  // notes open in the text: not the target's
    box.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    box.querySelectorAll('.rv-ins').forEach((e) => e.remove());  // review.js's suggested insertions: not the text
    box.querySelectorAll('.note-open').forEach((e) => e.classList.remove('note-open', 'note-active'));  // its notes are not the copy's
    return box.innerHTML;
  }

  // The side column's left edge drags (--side, html-papers.css), remembered in this browser; a
  // double click puts it back. A width the reader chose may take room from the text, down to
  // the text's least width (--side-share). Text and column are centred together, so the edge
  // moves less than the width changes: a few steps bring it under the pointer.
  const handle = chrome(document.createElement('div'));
  handle.id = 'side-handle';
  handle.className = 'col-handle';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Resize the notes column');
  handle.title = 'Drag to resize; double click to reset';
  document.body.append(handle);
  const rem = () => parseFloat(getComputedStyle(root).fontSize);
  const setSide = (px) => {
    root.style.setProperty('--side', Math.max(SIDE_MIN, Math.min(SIDE_MAX, px / rem())).toFixed(2) + 'rem');
    root.style.setProperty('--side-share', '1');
  };
  const resetSide = () => { root.style.removeProperty('--side'); root.style.removeProperty('--side-share'); store('side-width', null); place(); };
  if (parseFloat(recall('side-width'))) setSide(parseFloat(recall('side-width')) * rem());
  handle.addEventListener('pointerdown', (event) => {
    if (event.button) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('dragging');
    root.classList.add('col-dragging');
    const move = (e) => {
      for (let i = 0; i < 6; i++) {
        const r = handle.getBoundingClientRect(), off = (r.left + r.right) / 2 - e.clientX, before = margin.offsetWidth;
        if (Math.abs(off) < 1) break;
        setSide(before + off);
        if (margin.offsetWidth === before) break;  // as wide, or as narrow, as it goes
      }
      place();
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.classList.remove('dragging');
      root.classList.remove('col-dragging');
      setSide(margin.offsetWidth);  // what it came to, not what was asked for
      store('side-width', (margin.offsetWidth / rem()).toFixed(2));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
    handle.addEventListener('pointercancel', up, { once: true });
  });
  handle.addEventListener('dblclick', resetSide);

  // what the reader can change: menu.js lists whatever the page's scripts add to DocOptions
  (window.DocOptions = window.DocOptions || []).push(
    { label: 'Notes column width', type: 'range', min: SIDE_MIN, max: 60, step: 0.5, unit: 'rem', available: () => !narrow(),
      get: () => margin.offsetWidth / rem(), set: (v) => { setSide(v * rem()); store('side-width', String(v)); place(); }, reset: resetSide },
    { label: 'Open a note when the pointer rests on a link', type: 'toggle', default: true, available: () => !narrow() && !TOUCH.matches,
      get: () => hoverOn, set: (on) => { hoverOn = on; store('notes-hover', on ? null : '0'); if (!on) hide('hover'); } },
    { label: 'Remember which notes are open', type: 'toggle', default: true,
      get: () => remembering, set: (on) => { remembering = on; store('notes-remember', on ? null : '0'); savedFor = null; save(); } },
  );

  window.MarginNotes = {
    show: (key, anchor, html) => show(key, anchor, html, false),
    hide,
    place,
    narrow,
    column: true,  // place() lays out the whole side column, other scripts' boxes too (`doccolumn`)
  };
  restore();
})();

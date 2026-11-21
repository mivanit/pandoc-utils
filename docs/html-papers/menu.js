/**
 * A settings menu for a pandoc HTML page (styles in html-papers.css).
 * From https://github.com/mivanit/pandoc-utils, html-papers/.
 *
 *     <script src="menu.js" defer></script>     after the page's other scripts
 *
 * M opens and closes it (not while typing); Esc or a press outside closes it. With contents.js
 * on the page there is a ⚙ button beside Pin as well, which is how a phone gets to it. The menu
 * lists what the reader can change: its own two options (how wide the text may be, and whether
 * lines are drawn to notes and comments) and whatever the page's other scripts added to
 * `window.DocOptions`, each an object:
 *
 *     label        what the row says
 *     type         'toggle' (a checkbox) or 'range' (a slider: min, max, step, unit)
 *     get()        its value now
 *     set(value)   change it; the script that owns it applies and remembers it
 *     default      a toggle's value after Reset; or reset() for anything else
 *     available()  optional: false leaves the row out (a column that is not there on a phone)
 *
 * So each script keeps its own settings, in this browser, and works without this one.
 *
 * On <html>: `--text-max` (the text's width, where the window has room for it) and `lines-off`
 * (no lines; popups.js and review.js look for it). A `doclayout` event on document follows a
 * change to either. The menu is `data-doc-chrome`: not the document's text.
 */
(function () {
  const root = document.documentElement;
  // JSON null records a reset, so an old unprefixed preference cannot return later.
  // Legacy keys are left intact: another page on this origin may still use them.
  const PREF = 'html-papers:v1:';
  const store = (key, value) => { try { localStorage.setItem(PREF + key, JSON.stringify(value)); } catch (e) { /* no storage */ } };
  const recall = (key) => {
    try {
      const saved = localStorage.getItem(PREF + key);
      if (saved !== null) return JSON.parse(saved);
      const legacy = localStorage.getItem(key);
      store(key, legacy);
      return legacy;
    } catch (e) { return null; }
  };
  const moved = () => document.dispatchEvent(new Event('doclayout'));

  // this script's own options, applied now
  const TEXT = 44;  // rem: html-papers.css's --text-max
  const setText = (v) => { v === null ? root.style.removeProperty('--text-max') : root.style.setProperty('--text-max', v + 'rem'); moved(); };
  const setLines = (on) => { root.classList.toggle('lines-off', !on); moved(); };
  if (parseFloat(recall('text-width'))) setText(parseFloat(recall('text-width')));
  if (recall('lines') === '0') setLines(false);
  // both are about the text beside a side column: html-papers.css has none on a phone (--side-w)
  const columns = () => getComputedStyle(root).getPropertyValue('--side-w').trim() !== '0rem';
  const options = (window.DocOptions = window.DocOptions || []);
  options.unshift(
    { label: 'Text width, at most', type: 'range', min: 24, max: 90, step: 1, unit: 'rem', available: columns,
      get: () => parseFloat(getComputedStyle(root).getPropertyValue('--text-max')) || TEXT,
      set: (v) => { setText(v); store('text-width', String(v)); },
      reset: () => { setText(null); store('text-width', null); } },
    { label: 'Lines from the text to notes and comments', type: 'toggle', default: true, available: columns,
      get: () => !root.classList.contains('lines-off'),
      set: (on) => { setLines(on); store('lines', on ? null : '0'); } },
  );
  // review.js has no options of its own here: its switch is the E key, shown as a row
  if (window.ReviewMode) {
    options.push({ label: 'Review mode: comment on the text', key: 'E', type: 'toggle',
      get: () => root.classList.contains('review-on'),
      set: (on) => (on ? window.ReviewMode.enter() : window.ReviewMode.exit()) });
  }

  const menu = document.createElement('div');
  menu.id = 'doc-menu';
  menu.hidden = true;
  menu.tabIndex = -1;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Settings');
  menu.setAttribute('data-doc-chrome', '');
  menu.setAttribute('contenteditable', 'false');
  document.body.append(menu);

  const shown = (v, o) => (o.unit ? (Math.round(v * 10) / 10) + ' ' + o.unit : String(v));
  let controls = [];
  function render() {
    const focused = [...menu.querySelectorAll('input, button')].indexOf(document.activeElement);
    menu.textContent = '';
    controls = [];
    const top = document.createElement('div');
    top.className = 'menu-top';
    top.innerHTML = '<b>Settings</b><button type="button" class="menu-close" aria-label="Close">×</button>';
    top.querySelector('button').addEventListener('click', close);
    menu.append(top);
    for (const o of options) {
      if (o.available && !o.available()) continue;
      const row = document.createElement('label');
      row.className = 'menu-row';
      const text = document.createElement('span');
      text.textContent = o.label;
      if (o.key) { const k = document.createElement('kbd'); k.textContent = o.key; text.append(' ', k); }
      const input = document.createElement('input');
      let out = null;
      if (o.type === 'range') {
        out = document.createElement('output');
        input.type = 'range';
        input.min = o.min; input.max = o.max; input.step = o.step || 1;
        input.value = o.get();
        out.textContent = shown(o.get(), o);
        // what it came to, which may be less than what was asked for (the window has only so much room)
        input.addEventListener('input', () => { o.set(Number(input.value)); out.textContent = shown(o.get(), o); });
        row.append(text, input, out);
      } else {
        input.type = 'checkbox';
        input.checked = !!o.get();
        input.addEventListener('change', () => { o.set(input.checked); render(); });  // one option may change what another can be
        row.append(input, text);
      }
      controls.push({ option: o, input, out });
      menu.append(row);
    }
    const foot = document.createElement('div');
    foot.className = 'menu-foot';
    foot.innerHTML = '<span><kbd>M</kbd> opens and closes this. Kept in this browser.</span><button type="button">Reset</button>';
    foot.querySelector('button').addEventListener('click', () => {
      for (const o of options) { if (o.reset) o.reset(); else if ('default' in o) o.set(o.default); }
      render();
    });
    menu.append(foot);
    // Rebuilding options after a toggle must not send keyboard focus back to the page.
    if (focused >= 0) menu.querySelectorAll('input, button')[focused]?.focus();
  }
  let before = null;  // what had the focus
  function open() {
    render();
    before = document.activeElement;
    menu.hidden = false;
    menu.focus();
  }
  function close() {
    if (menu.hidden) return;
    menu.hidden = true;
    if (before instanceof HTMLElement && before.isConnected) before.focus();
  }
  const toggle = () => (menu.hidden ? open() : close());

  // External changes (E, column dragging, resizing) update values without replacing the
  // focused control. Rebuild only when the set of available options changes.
  let refreshFrame = 0;
  function refreshSoon() {
    if (menu.hidden || refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      if (menu.hidden) return;
      const available = options.filter((o) => !o.available || o.available());
      if (available.length !== controls.length || available.some((o, i) => controls[i].option !== o)) { render(); return; }
      for (const { option: o, input, out } of controls) {
        if (out) { input.value = o.get(); out.textContent = shown(o.get(), o); }
        else input.checked = !!o.get();
      }
    });
  }
  document.addEventListener('doclayout', refreshSoon);
  addEventListener('resize', refreshSoon);
  new MutationObserver(refreshSoon).observe(root, { attributes: true, attributeFilter: ['class'] });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { close(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey || (event.key !== 'm' && event.key !== 'M')) return;
    const t = event.composedPath()[0];  // inside review.js's panel too
    const typing = t instanceof Element && (t.matches('textarea, select, input:not([type="checkbox"], [type="range"])') || t.isContentEditable);
    if (typing) return;
    event.preventDefault();
    toggle();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !event.target.closest?.('#doc-menu, .toc-menu')) close();
  });

  // beside the contents' Pin button (contents.js), when there is one
  const bar = document.querySelector('#toc-nav .toc-top');
  if (bar) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toc-menu';
    button.textContent = '⚙';
    button.title = 'Settings (M)';
    button.setAttribute('aria-label', 'Settings');
    button.addEventListener('click', toggle);
    bar.insertBefore(button, bar.querySelector('.toc-pin'));
    if (window.ReviewMode) {
      const review = document.createElement('button');
      review.type = 'button';
      review.className = 'toc-review';
      review.textContent = 'Review';
      review.title = 'Comment on this paper (E)';
      review.addEventListener('click', () => window.ReviewMode.enter());
      bar.insertBefore(review, button);
    }
  }

  window.DocMenu = { open, close };
})();

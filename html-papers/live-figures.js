/**
 * Figures with a live version (styles in html-papers.css; works with or without popups.js).
 * From https://github.com/mivanit/pandoc-utils, html-papers/.
 *
 *     <script src="live-figures.js" defer></script>
 *
 *     <div class="fig-static" data-embed="https://…/chart.html#embed=1"   the page to frame
 *          data-link="https://…/chart.html"       the full page, to open in a tab
 *          data-height="600"                      the frame's height in px, until the page says
 *          data-width="820">                      optional: the width the page is laid out for
 *       <img src="chart.svg"> … the figure's key, if any …
 *     </div>
 *
 * The static image shows until clicked, so nothing loads from the live page's host before
 * that. The click swaps the image for an iframe of `data-embed`; a note beside it (in the
 * margin, with popups.js; else under the frame) has "Open the full page" and "Back to the
 * static figure". The frame and the note are `data-doc-chrome`: not the document's text. With `data-width` the frame renders at that width and is scaled down to the
 * column, so the live figure matches the static one. The framed page can report its height
 * with `parent.postMessage({embedHeight: px}, '*')`. Without a side column (a phone) the live
 * figure opens in a screen-wide panel over the page instead.
 *
 * A preview of the figure (popups.js) shows the static image even while it is live.
 */
(function () {
  const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const notes = () => window.MarginNotes;  // popups.js, if loaded
  // what this script adds is not the document's text (review.js, popups.js)
  function chrome(el) {
    el.setAttribute('data-doc-chrome', '');
    el.setAttribute('contenteditable', 'false');
    return el;
  }
  const narrow = () => (notes() ? notes().narrow() : matchMedia('(width < 760px)').matches);
  function fit(wrap) {
    const frame = wrap.firstChild, width = Number(wrap.dataset.width);
    const scale = width ? Math.min(1, wrap.clientWidth / width) : 1;
    frame.style.width = width ? width + 'px' : '100%';
    frame.style.transform = scale < 1 ? 'scale(' + scale + ')' : '';
    wrap.style.height = Math.ceil(frame.height * scale) + 'px';
  }
  function liveFrame(fig) {
    const wrap = chrome(document.createElement('div'));
    wrap.className = 'interactive-wrap';
    if (fig.dataset.width) wrap.dataset.width = fig.dataset.width;
    const frame = document.createElement('iframe');
    frame.className = 'interactive-figure';
    frame.src = fig.dataset.embed;
    frame.height = fig.dataset.height || 600;
    frame.title = 'Interactive figure';
    wrap.append(frame);
    return wrap;
  }
  // Without a margin: the live figure in a screen-wide panel over the page, its buttons on top;
  // closing it leaves the static one.
  let sheet = null;
  function closeSheet() {
    if (!sheet) return;
    const opener = sheet.opener;
    sheet.close();
    sheet.remove();
    sheet = null;
    document.body.classList.remove('sheet-open');
    opener.focus({ preventScroll: true });
  }
  function openSheet(fig, opener) {
    closeSheet();
    sheet = document.createElement('dialog');
    sheet.opener = opener;
    sheet.className = 'figure-sheet';
    chrome(sheet);
    sheet.setAttribute('aria-label', 'Interactive figure');
    sheet.addEventListener('cancel', (event) => { event.preventDefault(); closeSheet(); });
    sheet.innerHTML = '<div class="sheet-bar"><a class="open-full" href="' + attr(fig.dataset.link || fig.dataset.embed) + '" target="_blank" rel="noopener">Open the full page ↗</a>'
      + '<button type="button" class="open-full sheet-close">Close</button></div>';
    sheet.querySelector('.sheet-close').addEventListener('click', closeSheet);
    const wrap = liveFrame(fig);
    sheet.append(wrap);
    const key = fig.querySelector('.fig-legend');
    if (key) sheet.append(key.cloneNode(true));
    document.body.append(sheet);
    document.body.classList.add('sheet-open');
    sheet.showModal();
    fit(wrap);
  }
  document.querySelectorAll('.fig-static[data-embed]').forEach((fig, i) => {
    const opener = chrome(document.createElement('button'));
    opener.type = 'button';
    opener.className = 'open-full live-open';
    opener.textContent = 'Open interactive figure';
    fig.append(opener);
    fig.classList.add('clickable');
    fig.title = 'Click for the interactive version';
    fig.addEventListener('click', (event) => {
      // The visible button and the image do the same thing; links in the key stay links.
      if (event.target.closest('a') || !event.target.closest('.live-open, img:not(.legend-glyph)') || !fig.classList.contains('clickable')) return;
      if (narrow()) { openSheet(fig, opener); return; }
      // only the image is swapped: a typeset key stays
      const img = fig.querySelector('img:not(.legend-glyph)');
      const wrap = liveFrame(fig);
      wrap.dataset.staticImg = img.outerHTML;  // for previews of this figure (below)
      img.replaceWith(wrap);
      opener.hidden = true;
      fig.classList.remove('clickable');
      fig.removeAttribute('title');
      fit(wrap);
      const html = '<a class="open-full" href="' + attr(fig.dataset.link || fig.dataset.embed) + '" target="_blank" rel="noopener">Open the full page ↗</a>'
        + '<button type="button" class="open-full static-again">Back to the static figure</button>';
      let bar;
      if (notes()) bar = notes().show('live:' + i, wrap, html);
      else {
        bar = chrome(document.createElement('div'));
        bar.className = 'live-bar';
        bar.innerHTML = html;
        wrap.after(bar);
      }
      bar.querySelector('.static-again').addEventListener('click', () => {
        wrap.replaceWith(img);
        opener.hidden = false;
        fig.classList.add('clickable');
        fig.title = 'Click for the interactive version';
        if (notes()) notes().hide('live:' + i); else bar.remove();
        opener.focus({ preventScroll: true });
      });
      bar.querySelector('.static-again').focus({ preventScroll: true });
    });
  });
  window.addEventListener('message', (event) => {
    // clmEmbedHeight: the name this message had before the script was shared
    const height = event.data && (event.data.embedHeight || event.data.clmEmbedHeight);
    if (!height) return;
    const frame = [...document.querySelectorAll('iframe.interactive-figure')].find((f) => f.contentWindow === event.source);
    if (frame) { frame.height = height; fit(frame.parentElement); notes()?.place(); }
  });
  window.addEventListener('resize', () => document.querySelectorAll('.interactive-wrap').forEach(fit));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSheet(); });
  // a preview (popups.js) of a figure: its static image even while live; nothing in the copy
  // is clickable but links
  document.addEventListener('popups:preview', (event) => {
    const box = event.detail.box;
    box.querySelectorAll('.interactive-wrap').forEach((w) => { w.outerHTML = w.dataset.staticImg || ''; });
    box.querySelectorAll('.live-bar, .live-open').forEach((e) => e.remove());
    box.querySelectorAll('.clickable').forEach((e) => { e.classList.remove('clickable'); e.removeAttribute('title'); });
  });
})();

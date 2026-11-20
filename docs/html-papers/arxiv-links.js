/**
 * Links in a pandoc --citeproc bibliography (`#refs`).
 * From https://github.com/mivanit/pandoc-utils, html-papers/.
 *
 *     <script src="arxiv-links.js" defer></script>
 *
 * A .bib file often names a paper only as "arXiv preprint arXiv:<id>": each such id becomes a
 * link to its arXiv page, and the entry's title becomes a link too (to the entry's own url if
 * it has one, else the arXiv page). Done on the bibliography itself, so popups.js's citation
 * notes, which copy it, get the links as well; load this before popups.js is used, i.e. in any
 * order with `defer`.
 */
(function () {
  for (const entry of document.querySelectorAll('#refs .csl-right-inline')) {
    const walker = document.createTreeWalker(entry, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('a')) texts.push(walker.currentNode);
    let arxiv = null;
    for (const t of texts) {
      const m = t.textContent.match(/arXiv:(\d{4}\.\d{4,5})(v\d+)?/);
      if (!m) continue;
      arxiv = 'https://arxiv.org/abs/' + m[1];
      const link = document.createElement('a');
      link.href = arxiv;
      link.textContent = m[0];
      const rest = t.splitText(m.index);
      rest.textContent = rest.textContent.slice(m[0].length);
      rest.before(link);
    }
    const href = entry.querySelector('a[href^="http"]:not([href^="https://arxiv.org/abs/"])')?.href || arxiv;
    const title = entry.querySelector(':scope > span, :scope > em');
    if (href && title && !title.closest('a')) {
      const link = document.createElement('a');
      link.href = href;
      title.replaceWith(link);
      link.append(title);
    }
  }
})();

/**
 * @fileoverview Review mode: comments and suggested edits on any web page
 * @module review
 * @license GPLv3
 * @see {@link https://github.com/mivanit/pandoc-utils} html-papers/ (moved there from
 * js-dev-toolkit at its 5ec127e, 2026-11-20)
 *
 * A drop-in, zero-dependency review layer for a static page, like comments and suggestion
 * mode in Google Docs or Overleaf. Readers press E (or open the page with `?review=1`),
 * select text, and leave comments or suggested edits. Everything stays in their browser
 * (localStorage) until they export it as JSON (copy, download or email) and send it to the
 * author. The author merges the files by annotation id, the newest `updated` winning, or
 * loads them back into the page (Import, or `?review-load=path`) to see them in place.
 *
 * Usage, one tag (attributes optional), with `defer` or placed after the content:
 *
 *     <script src="review.js" defer
 *       data-review-root="main"             content whose text is anchored (default: body)
 *       data-review-ignore="#margin-notes"  subtrees that are not part of that text (or
 *                                           mark them `data-doc-chrome`)
 *       data-review-email="me@example.org"  recipient for Export > Email (omit: no email)
 *       data-review-load="reviews.json"     reviews to show read-only (also ?review-load=path)
 *       data-review-start="1"></script>     enter review mode on load (for a bookmarklet)
 *
 * and optionally `<meta name="review-doc-version" content="<git sha>[-dirty]">` (the older
 * name `review-doc-commit` also works), which stamps every export with the page's version.
 *
 * Modes. Review mode starts in Comment mode: the page reads as usual (space scrolls, links
 * work) and selecting text offers Comment or Suggest edit. In Suggest mode (the header
 * switch, Suggest edit, or a double-click) the root is contenteditable, but every edit is
 * intercepted (`beforeinput`) and becomes a suggestion: deleted text is struck through with
 * the CSS Custom Highlight API, and inserted text is shown in a `<span class="rv-ins">`
 * placed after it. A composition (dead key, IME) cannot be cancelled, so it is undone when it
 * ends and its result applied instead. Those spans are the only change to the page's text,
 * and are removed on leaving. Ctrl/Cmd+Z undoes suggestions (never comments); a card's x
 * deletes it, with an Undo in the message that follows. Esc leaves Suggest mode; E or the x
 * button in the header leaves review mode.
 *
 * Layout. Each comment sits in a column at the right, level with its text and joined to it
 * by a line. While review mode is on, `<html>` has the class `review-on` and the property
 * `--review-width` (the column's width), so the page can move its own content clear of it.
 * A page with a side column of its own says where it is with `--doc-side-left` and
 * `--doc-side-width` on `<html>` (lengths; html-papers.css does): the comments then go in that
 * column, and `--review-width` is 0.
 * Lines pass behind the page's boxes marked `data-doc-avoid`, and cards keep clear of those
 * marked `data-doc-reserve` (both laid out again on a `doclayout` event on document). A page
 * that lays out its side column itself (`window.MarginNotes.column`) places the cards among
 * its own boxes: it asks for them with a `doccolumn` event (see `layout`). `lines-off` on
 * <html> hides the lines.
 * Below 760px the cards go in a bottom sheet instead. The panel lives in a shadow root, so
 * page styles do not reach it.
 *
 * Anchoring. Annotations are W3C-annotation-style selectors over the root's text with
 * whitespace collapsed: the quote with 32 chars of context either side, its offsets, and the
 * nearest heading. After the page changes, each re-attaches to: the same offsets, else the
 * quote elsewhere (best context match), provided the quote and the context touching it match
 * for 12 chars (a short quote alone occurs all over the text); else the closest fuzzy match
 * (character trigrams), else the text between its unchanged context, else nothing (listed as
 * "not found"). An insertion has an empty quote and re-attaches between its context.
 *
 * Browser support: highlights need the CSS Custom Highlight API (Chrome 105, Safari 17.2,
 * Firefox 140); without it the cards still work. On touch devices (coarse pointer) there is
 * no in-page typing, since touch keyboards type through compositions; a suggestion's new
 * text is typed in its card instead.
 *
 * API, on `window.ReviewMode`:
 * - `enter()`, `exit()`: review mode on and off (E and the x button do the same)
 * - `setMode(suggesting)`: Suggest mode (true) or Comment mode (false), while on
 * - `exportData()`: this reviewer's review/v1 object, or null until they have given a name
 * - `importData(data)`: show a review/v1 object's annotations read-only; returns
 *   `[added, skipped as malformed]`, and throws if it is not a review/v1 object
 */

/**
 * The quoted text of an annotation, with context either side (a W3C TextQuoteSelector).
 * @typedef {Object} Quote
 * @property {string} exact - the annotated text; '' for an insertion
 * @property {string} prefix - up to CONTEXT chars just before it
 * @property {string} suffix - up to CONTEXT chars just after it
 */

/**
 * One comment or suggested edit: an element of `annotations` in a `review/v1` file.
 * @typedef {Object} Annotation
 * @property {string} id - unique; merging keeps the newest copy of each id
 * @property {"comment"|"suggestion"} kind
 * @property {Quote} quote
 * @property {{start: number, end: number}} position - offsets into the root's text (a TextPositionSelector)
 * @property {{id: string, text: string}} section - the nearest heading before it
 * @property {string} body - the comment; '' for none
 * @property {string} [replacement] - suggestions: the new text; '' to delete
 * @property {"open"|"resolved"} status
 * @property {string} author
 * @property {string} created - ISO time
 * @property {string} updated - ISO time
 * @property {string} commit - the page version it was made on
 * @property {boolean} [deleted] - a tombstone: deleted after it was exported
 * @property {boolean} [_other] - imported from another reviewer: read-only, never saved
 * @property {number} [_color] - imported: its reviewer's color
 */

/**
 * Where an annotation is in the current text. An insertion has start === end.
 * @typedef {Object} Span
 * @property {number} [start]
 * @property {number} [end]
 * @property {"ok"|"fuzzy"|"orphan"} status - exact (or moved), approximate, or not found
 */

/**
 * The root's text with whitespace runs collapsed to one space, mapped back to the DOM:
 * character k is `nodes[nodeOf[k]].data[rawOf[k]]`.
 * @typedef {Object} TextIndex
 * @property {Element} root
 * @property {Text[]} nodes - the text nodes, in document order
 * @property {Map<Text, number>} pos - node -> its index in `nodes`
 * @property {number[]} nodeOf
 * @property {number[]} rawOf
 * @property {string} text
 * @property {string} lower - `text` lowercased, offsets kept
 */

/**
 * The two ends of a DOM range, as plain values (a StaticRange's fields).
 * @typedef {{sc: Node, so: number, ec: Node, eo: number}} Points
 */

/**
 * Where the caret goes after an edit: in a suggestion's inserted text (`s`, `j`), or just
 * before character `k`. `patch` marks an edit that changed only the inserted text.
 * @typedef {{s?: Annotation, j?: number, k?: number, id?: string, patch?: boolean}} Caret
 */

(() => {
	"use strict";
	if (window.ReviewMode) return; // included twice: one instance, or two panels overwriting each other's saves
	window.ReviewMode = {
		// set first, so a second copy loading now sees it
		enter: () => enter(),
		exit: () => exit(),
		setMode: (s) => {
			if (on) setMode(s);
		},
		exportData: () => exportData(),
		importData: (data) => {
			const result = addOthers(data);
			render();
			return result;
		},
	};

	// ==================================================================
	// configuration
	// ==================================================================
	const SCRIPT =
		document.currentScript ||
		document.querySelector('script[src*="review.js"]');
	const DATA = SCRIPT ? SCRIPT.dataset : {};
	const PARAMS = new URLSearchParams(location.search);
	const LINKED = PARAMS.get("review-load") || "";
	const CFG = {
		root: DATA.reviewRoot || "body",
		ignore: DATA.reviewIgnore || "",
		email: DATA.reviewEmail || "",
		// anyone can write a link, so ?review-load= takes only a path on this site: any URL
		// would let a link show a made-up review on this page
		load:
			(/^(?!\/\/)[\w.\/-]+$/.test(LINKED) ? LINKED : "") ||
			DATA.reviewLoad ||
			"",
	};
	const FORMAT = "review/v1"; // the export format; bump on an incompatible change
	const KEY = "review:v1:"; // localStorage key prefix
	const CONTEXT = 32; // chars of prefix/suffix kept around a quote
	const ANCHOR_MIN = 12; // chars of quote + adjacent context that must match to trust a place
	const FUZZY_MIN = 0.5; // trigram similarity a changed quote needs to re-attach
	const MAILTO_MAX = 1800; // some mail clients truncate longer mailto URLs
	const COLUMN = 300; // px: the comment column on wide screens
	const NARROW = 760; // px: below this the cards go in a bottom sheet instead
	// The page's own scripts can mark what they add without configuring this one:
	// `data-doc-chrome` on an element = not document text (as data-review-ignore);
	// `data-doc-avoid` = a box (a margin note, say) that comment lines pass behind, not
	// through; `data-doc-reserve` = a box that cards keep clear of (a note in the
	// column the cards share). A page that moves such boxes dispatches `doclayout` on document.
	const OUTSIDE =
		"script,style,noscript,template,annotation,#rv-host,[data-doc-chrome],.margin-note" +
		(CFG.ignore ? "," + CFG.ignore : "");
	const AVOID = "[data-doc-avoid]";
	const RESERVE = "[data-doc-reserve]";
	const SKIP = OUTSIDE + ",.rv-ins"; // not document text: also our own inserted-text spans
	const OTHER_COLORS = [
		"#7fb3ff",
		"#b49cff",
		"#6fd39b",
		"#ffb07a",
		"#ff8fc8",
		"#6fd3dc",
	];
	const VERSION =
		document.querySelector(
			'meta[name="review-doc-version"], meta[name="review-doc-commit"]',
		)?.content || "";
	const HIGHLIGHTS = !!(window.CSS && CSS.highlights && window.Highlight);
	// touch keyboards type through composition events: no in-page typing there
	const TOUCH = matchMedia("(pointer: coarse)").matches;
	// non-ASCII as char codes: the host page may not declare a charset
	const chr = String.fromCharCode;
	const DOT = " " + chr(0xb7) + " ",
		TIMES = chr(0xd7),
		NBSP = chr(0xa0),
		LQ = chr(0x201c),
		RQ = chr(0x201d),
		ELL = chr(0x2026);

	// ==================================================================
	// storage: everything goes through `store`, so a server-backed one can replace it
	// ==================================================================
	// Some embedded views block localStorage (VS Code's preview frames the page in a webview,
	// where access can throw). Then everything lives in memory: kept for this tab, lost on
	// reload, and the panel says so.
	const STORAGE = (() => {
		try {
			localStorage.setItem(KEY + "probe", "1");
			localStorage.removeItem(KEY + "probe");
			return true;
		} catch {
			return false;
		}
	})();
	const memory = new Map();

	/**
	 * Read a stored value.
	 * @param {string} key - without the KEY prefix
	 * @returns {string|null}
	 */
	function lsGet(key) {
		if (!STORAGE) return memory.has(key) ? memory.get(key) : null;
		try {
			return localStorage.getItem(KEY + key);
		} catch {
			return null;
		}
	}

	/**
	 * Store a value.
	 * @param {string} key - without the KEY prefix
	 * @param {string} value
	 * @returns {boolean} false if storage refused it (quota, say)
	 */
	function lsSet(key, value) {
		if (!STORAGE) {
			memory.set(key, value);
			return true;
		}
		try {
			localStorage.setItem(KEY + key, value);
			return true;
		} catch {
			return false;
		}
	}

	/** This page's own annotations and when they were last exported, per page path. */
	const store = {
		key: "doc:" + location.pathname,
		/** @returns {{annotations: Annotation[], exported: string|null}} */
		load() {
			try {
				const s = JSON.parse(lsGet(this.key));
				if (s && Array.isArray(s.annotations)) return s;
			} catch {
				/* empty or corrupt: start over */
			}
			return { annotations: [], exported: null };
		},
		/** @param {{annotations: Annotation[], exported: string|null}} s */
		save(s) {
			if (!lsSet(this.key, JSON.stringify(s)))
				toast(
					"Could not save: browser storage is unavailable. Export before leaving.",
				);
		},
	};
	const ON_KEY = "on:" + location.pathname; // review mode stays on across reloads

	// ==================================================================
	// state
	// ==================================================================
	/** own annotations (deleted ones kept as tombstones once exported), and the last export's time */
	let state = store.load();
	/** @type {Annotation[]} imported annotations: read-only, never saved */
	let others = [];
	let on = false;
	// Comment mode (the default): the page reads as usual. Suggest mode: the root is
	// contenteditable and edits become suggestions.
	let suggesting = false;
	/** @type {TextIndex|null} rebuilt by render() */
	let idx = null;
	/** @type {Map<string, Span>} */
	let spans = new Map();
	/** @type {Map<string, Range>} live Range of each painted annotation's text (none for an insertion or a resolved one) */
	let ranges = new Map();
	/** @type {Map<string, Range>} live Range each placed card sits level with, resolved ones included */
	let anchors = new Map();
	/** @type {Map<string, HTMLElement>} */
	let cards = new Map();
	let active = null; // id of the focused annotation
	let typingInto = null; // id of the suggestion being typed into
	let undoStack = [],
		redoStack = [],
		lastEdit = { id: null, t: 0 };
	let loaded = false; // the data-review-load file, fetched on first entry
	const colors = new Map(); // other reviewer -> color index

	/** @returns {{name: string, email: string}} who this reviewer says they are */
	const me = () => ({
		name: lsGet("name") || "",
		email: lsGet("email") || "",
	});
	const now = () => new Date().toISOString();
	/** @param {Annotation} a @returns {boolean} a comment not yet written */
	const isDraft = (a) =>
		a.kind === "comment" && !a.deleted && !(a.body || "").trim();
	/** @returns {Annotation[]} own annotations, without tombstones */
	const mine = () => state.annotations.filter((a) => !a.deleted);
	const all = () => [...mine(), ...others.filter((a) => !a.deleted)];
	const openSuggestions = () =>
		mine().filter(
			(a) =>
				a.kind === "suggestion" &&
				a.status !== "resolved" &&
				spans.get(a.id)?.status !== "orphan",
		);
	/** @returns {number} own annotations changed since the last export */
	const unsent = () =>
		state.annotations.filter(
			(a) =>
				!isDraft(a) && (!state.exported || a.updated > state.exported),
		).length;
	// not crypto.randomUUID: that needs a secure context, and plain http on a LAN is not one
	const newId = () =>
		Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	const persist = () => store.save(state);

	// ==================================================================
	// text index: the root's text, whitespace runs collapsed, mapped back to DOM points
	// ==================================================================
	const isSpace = (c) =>
		c === " " ||
		c === "\n" ||
		c === "\t" ||
		c === "\r" ||
		c === "\f" ||
		c === NBSP;

	/**
	 * Index the root's text: every text node outside SKIP, whitespace runs collapsed to one
	 * space (so a reflowed source, or re-wrapped HTML, keeps its offsets).
	 * @returns {TextIndex}
	 */
	function buildIndex() {
		const root = document.querySelector(CFG.root) || document.body;
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: (n) =>
				n.parentElement && !n.parentElement.closest(SKIP)
					? NodeFilter.FILTER_ACCEPT
					: NodeFilter.FILTER_REJECT,
		});
		const nodes = [],
			pos = new Map(),
			chars = [],
			lower = [],
			nodeOf = [],
			rawOf = [];
		let space = true;
		for (let n; (n = walker.nextNode());) {
			const i = nodes.length;
			nodes.push(n);
			pos.set(n, i);
			const d = n.data;
			for (let j = 0; j < d.length; j++) {
				const s = isSpace(d[j]);
				if (s && space) continue;
				const c = s ? " " : d[j],
					l = c.toLowerCase();
				chars.push(c);
				lower.push(l.length === 1 ? l : c); // keep offsets aligned
				nodeOf.push(i);
				rawOf.push(j);
				space = s;
			}
		}
		return {
			root,
			nodes,
			pos,
			nodeOf,
			rawOf,
			text: chars.join(""),
			lower: lower.join(""),
		};
	}

	/**
	 * The index of the first character at or after a DOM boundary point.
	 * @param {Node} container
	 * @param {number} offset
	 * @returns {number}
	 */
	function toIndex(container, offset) {
		let i = idx.pos.get(container),
			raw = offset;
		if (i === undefined) {
			// an element boundary (or skipped text): the first indexed node after it
			const r = document.createRange();
			r.setStart(container, offset);
			let lo = 0,
				hi = idx.nodes.length;
			while (lo < hi) {
				const m = (lo + hi) >> 1;
				if (r.comparePoint(idx.nodes[m], 0) < 0) lo = m + 1;
				else hi = m;
			}
			i = lo;
			raw = 0;
		}
		let lo = 0,
			hi = idx.text.length;
		while (lo < hi) {
			const m = (lo + hi) >> 1;
			if (
				idx.nodeOf[m] < i ||
				(idx.nodeOf[m] === i && idx.rawOf[m] < raw)
			)
				lo = m + 1;
			else hi = m;
		}
		return lo;
	}

	/**
	 * The DOM point just before character k (k = the text's length: just after the last one).
	 * @param {number} k
	 * @returns {[Text, number]}
	 */
	function pointAt(k) {
		if (!idx.text) return [idx.root, 0];
		if (k < idx.text.length)
			return [idx.nodes[idx.nodeOf[k]], idx.rawOf[k]];
		const last = idx.text.length - 1;
		return [idx.nodes[idx.nodeOf[last]], idx.rawOf[last] + 1];
	}

	/**
	 * Where text inserted at k is shown: just after character k - 1, so an insertion at a
	 * paragraph's end stays in that paragraph; before character k when k - 1 is a space
	 * (which may be the gap between two blocks).
	 * @param {number} k
	 * @returns {[Text, number]}
	 */
	function insertPoint(k) {
		const t = idx.text;
		if (
			k === 0 ||
			(t[k - 1] === " " && k < t.length) ||
			inMath(idx.nodes[idx.nodeOf[k - 1]]) // a formula holds no HTML
		)
			return pointAt(k);
		return [idx.nodes[idx.nodeOf[k - 1]], idx.rawOf[k - 1] + 1];
	}

	/** @param {number} end @returns {[Text, number]} the DOM point just after character end - 1 */
	const toRangeEnd = (end) => [
		idx.nodes[idx.nodeOf[end - 1]],
		idx.rawOf[end - 1] + 1,
	];

	/**
	 * @param {number} start
	 * @param {number} end - exclusive, > start
	 * @returns {Range} characters [start, end)
	 */
	function toRange(start, end) {
		const r = document.createRange();
		r.setStart(...pointAt(start));
		r.setEnd(...toRangeEnd(end));
		return r;
	}

	/**
	 * The nearest heading at or before character k.
	 * @param {number} k
	 * @returns {{id: string, text: string}} its id (or its section's), and its text; '' if none
	 */
	function sectionAt(k) {
		const node = idx.nodes[idx.nodeOf[Math.min(k, idx.text.length - 1)]];
		let head = null;
		for (const h of idx.root.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
			if (
				h.compareDocumentPosition(node) &
				Node.DOCUMENT_POSITION_FOLLOWING
			)
				head = h;
			else break;
		}
		if (!head) return { id: "", text: "" };
		return {
			id: head.id || head.closest("section[id]")?.id || "",
			text: head.textContent.replace(/\s+/g, " ").trim(),
		};
	}

	/**
	 * The anchor fields of an annotation on characters [start, end).
	 * @param {number} start
	 * @param {number} end
	 * @returns {{quote: Quote, position: {start: number, end: number}, section: {id: string, text: string}}}
	 */
	function anchorFor(start, end) {
		const t = idx.text;
		return {
			quote: {
				exact: t.slice(start, end),
				prefix: t.slice(Math.max(0, start - CONTEXT), start),
				suffix: t.slice(end, end + CONTEXT),
			},
			position: { start, end },
			section: sectionAt(start),
		};
	}

	/**
	 * A selection's characters, edge spaces dropped.
	 * @param {Range} range
	 * @returns {[number, number]|null} [start, end), or null if it holds no text
	 */
	function trimmed(range) {
		const t = idx.text;
		let start = toIndex(range.startContainer, range.startOffset),
			end = toIndex(range.endContainer, range.endOffset);
		while (start < end && t[start] === " ") start++;
		while (end > start && t[end - 1] === " ") end--;
		return end > start ? [start, end] : null;
	}

	// ==================================================================
	// re-attaching an anchor to the current text
	// ==================================================================
	/** @returns {number} length of the common start of two strings */
	function commonHead(a, b) {
		let n = 0;
		while (n < a.length && n < b.length && a[n] === b[n]) n++;
		return n;
	}
	/** @returns {number} length of the common end of two strings */
	function commonTail(a, b) {
		let n = 0;
		while (
			n < a.length &&
			n < b.length &&
			a[a.length - 1 - n] === b[b.length - 1 - n]
		)
			n++;
		return n;
	}

	/**
	 * How much of a quote's stored context surrounds [s, e) in t.
	 * @param {Quote} q
	 * @param {string} t - lowercased text
	 * @param {number} s
	 * @param {number} e
	 * @returns {number} matching chars: 0..(prefix + suffix length)
	 */
	function contextMatch(q, t, s, e) {
		const pre = q.prefix.toLowerCase(),
			suf = q.suffix.toLowerCase();
		return (
			commonTail(t.slice(Math.max(0, s - pre.length), s), pre) +
			commonHead(t.slice(e, e + suf.length), suf)
		);
	}

	/**
	 * Find an annotation in the current text: where it was if nothing around it changed, else
	 * the occurrence of its quote with the most matching context (then the nearest). That is
	 * trusted only if the quote and the context touching it match for ANCHOR_MIN chars (or all
	 * there is): a short quote, one struck letter say, occurs all over the text. Failing that,
	 * a fuzzy match, else nothing.
	 * @param {Annotation} a
	 * @returns {Span}
	 */
	function resolve(a) {
		const t = idx.text,
			{ exact, prefix, suffix } = a.quote,
			L = exact.length,
			all = prefix.length + suffix.length,
			old = a.position ? a.position.start : 0;
		if (!exact) return resolvePoint(a);
		const ctx = (i) => contextMatch(a.quote, idx.lower, i, i + L);
		let best = -1,
			top = -1;
		if (t.startsWith(exact, old) && ctx(old) === all) best = old;
		else
			for (
				let i = t.indexOf(exact);
				i >= 0;
				i = t.indexOf(exact, i + 1)
			) {
				const m = ctx(i) - Math.abs(i - old) / 1e9;
				if (m > top) [top, best] = [m, i];
			}
		if (best >= 0 && L + ctx(best) >= Math.min(ANCHOR_MIN, L + all))
			return { start: best, end: best + L, status: "ok" };
		return fuzzy(a) || { status: "orphan" };
	}

	/**
	 * Find an insertion (an empty quote): the point between its prefix and suffix, nearest its
	 * old offset; else just after its prefix, or just before its suffix (fuzzy).
	 * @param {Annotation} a
	 * @returns {Span}
	 */
	function resolvePoint(a) {
		const t = idx.text,
			{ prefix, suffix } = a.quote,
			k = a.position ? a.position.start : 0;
		if (
			k <= t.length &&
			t.slice(Math.max(0, k - prefix.length), k) === prefix &&
			t.slice(k, k + suffix.length) === suffix
		) {
			return { start: k, end: k, status: "ok" };
		}
		let best = null;
		const both = prefix + suffix;
		for (
			let i = both ? t.indexOf(both) : -1;
			i >= 0;
			i = t.indexOf(both, i + 1)
		) {
			const d = Math.abs(i + prefix.length - k);
			if (!best || d < best.d) best = { d, k: i + prefix.length };
		}
		if (best) return { start: best.k, end: best.k, status: "ok" };
		if (prefix.length >= 8 && t.indexOf(prefix) >= 0) {
			const q = t.indexOf(prefix) + prefix.length;
			return { start: q, end: q, status: "fuzzy" };
		}
		if (suffix.length >= 8 && t.indexOf(suffix) >= 0) {
			const q = t.indexOf(suffix);
			return { start: q, end: q, status: "fuzzy" };
		}
		return { status: "orphan" };
	}

	/** @param {string} s @returns {Map<string, number>} its character trigrams, with counts */
	function grams(s) {
		const g = new Map();
		for (let i = 0; i + 3 <= s.length; i++) {
			const k = s.slice(i, i + 3);
			g.set(k, (g.get(k) || 0) + 1);
		}
		return g;
	}

	/**
	 * Dice coefficient of two strings' trigram multisets.
	 * @param {Map<string, number>} ga - the first string's grams()
	 * @param {string} b
	 * @returns {number} 0..1
	 */
	function similarity(ga, b) {
		const gb = grams(b);
		let both = 0,
			na = 0,
			nb = 0;
		for (const v of ga.values()) na += v;
		for (const [k, v] of gb) {
			nb += v;
			both += Math.min(v, ga.get(k) || 0);
		}
		return na + nb ? (2 * both) / (na + nb) : 0;
	}
	const isWord = (c) => c !== undefined && /[\p{L}\p{N}_]/u.test(c);

	/**
	 * Widen [s, e) to whole words, then drop edge spaces.
	 * @returns {[number, number]}
	 */
	function wordBounds(s, e) {
		const t = idx.text;
		while (s > 0 && isWord(t[s - 1]) && isWord(t[s])) s--;
		while (e < t.length && isWord(t[e - 1]) && isWord(t[e])) e++;
		while (s < e && t[s] === " ") s++;
		while (e > s && t[e - 1] === " ") e--;
		return [s, e];
	}

	/**
	 * Find a quote whose text changed. Each of its trigrams votes for where the quote would
	 * start; windows of +-20% its length around the most-voted starts are scored by trigram
	 * similarity, plus a little for surrounding context and nearness to the old position.
	 * Failing that, the text between its (unchanged) prefix and suffix.
	 * @param {Annotation} a
	 * @returns {Span|null} status 'fuzzy', or null if nothing is close enough
	 */
	function fuzzy(a) {
		const t = idx.lower,
			q = a.quote.exact.toLowerCase(),
			L = q.length,
			old = a.position ? a.position.start : 0;
		let best = null;
		if (L >= 6) {
			const gq = grams(q),
				votes = new Map(),
				BIN = 8,
				stride = Math.max(1, Math.floor(L / 150));
			for (let j = 0; j + 3 <= L; j += stride) {
				const g = q.slice(j, j + 3),
					hits = [];
				for (
					let p = t.indexOf(g);
					p >= 0 && hits.length <= 200;
					p = t.indexOf(g, p + 1)
				)
					hits.push(p);
				if (hits.length > 200) continue; // too common to locate anything
				for (const p of hits) {
					const b = Math.round((p - j) / BIN);
					votes.set(b, (votes.get(b) || 0) + 1);
				}
			}
			const top = [...votes].sort((x, y) => y[1] - x[1]).slice(0, 8);
			for (const [b] of top) {
				for (let s0 = (b - 1) * BIN; s0 <= (b + 1) * BIN; s0 += 2) {
					for (let f = 0.8; f < 1.25; f += 0.1) {
						const [s, e] = wordBounds(
							Math.max(0, s0),
							Math.min(t.length, s0 + Math.round(L * f)),
						);
						if (e <= s) continue;
						const sim = similarity(gq, t.slice(s, e));
						const score =
							sim +
							(0.1 * contextMatch(a.quote, t, s, e)) /
								(2 * CONTEXT) -
							0.05 * Math.min(1, Math.abs(s - old) / t.length);
						if (sim >= FUZZY_MIN && (!best || score > best.score))
							best = { score, start: s, end: e };
					}
				}
			}
		}
		const pre = a.quote.prefix.toLowerCase(),
			suf = a.quote.suffix.toLowerCase();
		if (!best && pre.length >= 8 && suf.length >= 8) {
			for (
				let p = t.indexOf(pre);
				p >= 0 && !best;
				p = t.indexOf(pre, p + 1)
			) {
				const e0 = t.indexOf(suf, p + pre.length);
				if (e0 <= p + pre.length || e0 - p - pre.length > 3 * L + 40)
					continue;
				const [s, e] = wordBounds(p + pre.length, e0);
				if (e > s) best = { start: s, end: e };
			}
		}
		return best && { start: best.start, end: best.end, status: "fuzzy" };
	}

	// ==================================================================
	// rendering: highlights, inserted-text spans, cards
	// ==================================================================
	function clearHighlights() {
		if (!HIGHLIGHTS) return;
		for (const name of [...CSS.highlights.keys()])
			if (name.startsWith("rv-")) CSS.highlights.delete(name);
	}

	/** Remove every inserted-text span, rejoining the text nodes they split. */
	function clearInserts() {
		for (const el of document.querySelectorAll(".rv-ins")) {
			const parent = el.parentNode;
			el.remove();
			parent.normalize();
		}
	}

	/**
	 * Redraw everything: re-index the text, re-attach every annotation, insert the
	 * inserted-text spans, paint the highlights, rebuild the cards, lay them out.
	 */
	let renderDeferred = false;
	function render() {
		clearTimeout(pending);
		pending = 0;
		if (!on) return;
		if (composing) {
			renderDeferred = true;
			return;
		}
		renderDeferred = false;
		clearInserts();
		idx = buildIndex();
		spans = new Map(all().map((a) => [a.id, resolve(a)]));
		for (const a of mine()) {
			// keep own anchors current as the page moves
			const sp = spans.get(a.id);
			if (
				sp.status === "ok" &&
				(sp.start !== a.position.start || sp.end !== a.position.end)
			)
				a.position = { start: sp.start, end: sp.end };
		}
		// live Ranges first: they follow the text nodes that inserting the spans splits
		ranges = new Map();
		anchors = new Map();
		const inserts = [];
		for (const a of all()) {
			const sp = spans.get(a.id);
			if (sp.status === "orphan") continue;
			const anchor = document.createRange();
			if (sp.end > sp.start) {
				anchor.setStart(...pointAt(sp.start));
				anchor.setEnd(...toRangeEnd(sp.end));
			} else anchor.setStart(...insertPoint(sp.end));
			anchors.set(a.id, anchor);
			if (a.status === "resolved") continue; // placed, but not painted
			if (sp.end > sp.start) ranges.set(a.id, toRange(sp.start, sp.end));
			if (a.kind === "suggestion" && a.replacement) {
				const r = document.createRange();
				r.setStart(...insertPoint(sp.end));
				inserts.push([a, r]);
			}
		}
		for (const [a, r] of inserts) {
			r.insertNode(
				h(
					"span",
					{
						class: "rv-ins" + (a.id === active ? " active" : ""),
						"data-id": a.id,
						contenteditable: a._other || TOUCH ? "false" : null,
						style: a._other
							? `--c:${OTHER_COLORS[a._color]}`
							: null,
					},
					a.replacement,
				),
			);
		}
		observer.takeRecords(); // our own changes
		if (inserts.length) idx = buildIndex();
		paint();
		renderCards();
		layout();
	}

	/** Paint the highlights from `ranges`, and mark the active inserted-text span. */
	function paint() {
		if (!HIGHLIGHTS) return;
		const groups = {};
		const add = (name, r) => (groups[name] ||= []).push(r);
		for (const a of all()) {
			const r = ranges.get(a.id);
			if (!r) continue;
			add(
				a._other
					? "rv-o" + a._color
					: a.kind === "suggestion"
						? "rv-del"
						: "rv-comment",
				r,
			);
			if (a.kind === "suggestion") add("rv-strike", r);
			if (spans.get(a.id).status === "fuzzy") add("rv-fuzzy", r);
			if (a.id === active) add("rv-active", r);
		}
		clearHighlights();
		for (const [name, rs] of Object.entries(groups)) {
			const hl = new Highlight(...rs);
			hl.priority =
				name === "rv-active"
					? 3
					: name === "rv-fuzzy"
						? 2
						: name === "rv-strike"
							? 1
							: 0;
			CSS.highlights.set(name, hl);
		}
		for (const el of document.querySelectorAll(".rv-ins"))
			el.classList.toggle("active", el.dataset.id === active);
	}

	// ==================================================================
	// UI: a shadow root holding the header, the card column, toolbar, help and toasts
	// ==================================================================
	// in the page itself: highlight styles, inserted-text spans, the editable root
	const PAGE_CSS = `
::highlight(rv-comment) { background-color: rgba(255, 210, 0, 0.38); }
::highlight(rv-del) { background-color: rgba(255, 90, 90, 0.16); color: #a12020; }
::highlight(rv-strike) { text-decoration: line-through; text-decoration-color: #c62828; }
::highlight(rv-fuzzy) { text-decoration: underline dashed #8a6d00; }
::highlight(rv-active) { background-color: rgba(255, 160, 0, 0.5); }
${OTHER_COLORS.map((c, i) => `::highlight(rv-o${i}) { background-color: ${c}66; }`).join("\n")}
.rv-ins { color: #17703a; background: rgba(40, 160, 80, 0.12); text-decoration: underline; text-decoration-color: #17703a; white-space: pre-wrap; }
.rv-ins[contenteditable="false"] { color: inherit; text-decoration-color: var(--c, #17703a); text-decoration-thickness: 2px; }
.rv-ins.active { background: rgba(255, 160, 0, 0.4); }
[data-rv-root] { outline: none; caret-color: #c62828; }`;

	// in the shadow root
	const UI_CSS = `
* { box-sizing: border-box; }
.panel, .layer, .toolbar, .backdrop, .toast { font: 13.5px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #222; }
button { font: inherit; cursor: pointer; border: 1px solid #c8c8c8; background: #fff; border-radius: 5px; padding: 3px 9px; color: #222; }
button:hover { background: #f0f0f0; }
button.primary { background: #3b5a8c; border-color: #3b5a8c; color: #fff; }
button.link { border: 0; background: none; padding: 0 3px; color: #3b5a8c; }
[hidden] { display: none !important; }
input, textarea { font: inherit; color: #222; border: 1px solid #ccc; border-radius: 5px; padding: 4px 7px; width: 100%; background: #fff; }
.panel { position: fixed; top: 8px; right: 8px; width: ${COLUMN - 16}px; pointer-events: auto; background: #fff;
  border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 3px 14px rgba(0,0,0,.12); padding: 9px 10px; z-index: 2; }
.panel.drop { outline: 3px dashed #3b5a8c; }
/* in the page's own side column (layout): only its title row, so it does not cover the cards
   under it; the rest while the pointer or the focus is in it, in Suggest mode, or after a
   click on the title row (.open) */
.panel.compact:not(.sheet, .open, .suggesting, .drop, :hover, :focus-within) > :not(.title) { display: none; }
.panel.compact:not(.sheet) .title { cursor: pointer; }
.title { display: flex; align-items: center; gap: 4px; }
.title b { font-size: 14.5px; }
.count { flex: 1; color: #666; font-size: 12px; margin-left: 4px; }
.count .unsent { color: #b00020; font-weight: 600; }
.who { display: flex; gap: 6px; margin: 7px 0; }
.who input.missing { border-color: #b00020; box-shadow: 0 0 0 2px #fdecee; }
.modes { display: flex; margin: 0 0 7px; }
.modes button { flex: 1; border-radius: 0; }
.modes button:first-child { border-radius: 5px 0 0 5px; }
.modes button:last-child { border-radius: 0 5px 5px 0; border-left: 0; }
.modes button[aria-pressed="true"] { background: #e8eef7; border-color: #3b5a8c; color: #1f3a66; font-weight: 600; }
.actions { display: flex; gap: 6px; position: relative; flex-wrap: wrap; align-items: center; }
.hint { color: #888; font-size: 11.5px; margin-top: 6px; }
.menu { position: absolute; top: 100%; left: 0; margin-top: 4px; z-index: 3; background: #fff; border: 1px solid #ccc;
  border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,.12); padding: 4px; display: flex; flex-direction: column; min-width: 220px; }
.menu button { border: 0; text-align: left; padding: 6px 10px; }
.lost { max-height: 40vh; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.list { display: none; }
.panel.sheet { top: auto; left: 0; right: 0; bottom: 0; width: auto; height: 45vh; border-radius: 0; display: flex; flex-direction: column; }
.panel.sheet .list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1; padding-top: 8px; }
.layer { position: absolute; left: 0; top: 0; pointer-events: none; will-change: transform; }
.layer svg { position: absolute; left: 0; top: 0; overflow: visible; }
.layer path { fill: none; stroke: #c9c9c9; stroke-width: 1; }
.layer path.active { stroke: #f0a000; stroke-width: 1.5; }
.layer circle { fill: #c9c9c9; } .layer circle.active { fill: #f0a000; }
.layer .card { position: absolute; left: var(--x0); width: var(--cw, ${COLUMN - 16}px); }
.card { pointer-events: auto; background: #fff; border: 1px solid #e0e0e0; border-left: 4px solid #f2c200; border-radius: 6px;
  padding: 6px 8px; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.card.suggestion { border-left-color: #e05252; }
.card.other { border-left-color: var(--c); }
.card.active { box-shadow: 0 0 0 2px #f0a000, 0 3px 10px rgba(0,0,0,.12); z-index: 1; }
.card.resolved { opacity: .55; }
.meta { font-size: 12px; color: #666; display: flex; gap: 2px; align-items: center; flex-wrap: wrap; }
.meta b { color: #222; }
.meta .acts { margin-left: auto; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: var(--c); margin-right: 3px; }
.change { margin: 3px 0; font-size: 12.5px; color: #555; }
ins { color: #17703a; text-decoration: none; background: #e6f6ea; padding: 0 2px; }
.body { white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 3px; }
.card textarea { border: 0; padding: 2px 0; resize: none; overflow: hidden; min-height: 1.6em; outline: none; display: block; }
.card textarea:focus { box-shadow: 0 1px 0 #3b5a8c; }
.card input { margin-top: 3px; }
.note { font-size: 11.5px; color: #8a6d00; background: #fff8e0; border-radius: 4px; padding: 3px 6px; margin: 4px 0; }
.note.orphan { color: #b00020; background: #fdecee; }
.toolbar { position: fixed; display: flex; gap: 4px; background: #222; padding: 4px; border-radius: 7px;
  box-shadow: 0 3px 12px rgba(0,0,0,.25); pointer-events: auto; z-index: 4; }
.toolbar button { background: #222; color: #fff; border: 0; }
.toolbar button:hover { background: #444; }
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center;
  padding: 16px; pointer-events: auto; z-index: 5; }
.modal { background: #fff; border-radius: 10px; max-width: 460px; padding: 18px 22px; box-shadow: 0 10px 40px rgba(0,0,0,.3); font-size: 14px; }
.modal h2 { margin: 0 0 8px; font-size: 18px; }
.modal ol { padding-left: 20px; margin: 8px 0; }
.modal li { margin: 5px 0; }
.warn { background: #fdecee; border-radius: 6px; padding: 8px 10px; color: #6a0010; }
.row { display: flex; justify-content: flex-end; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: #222; color: #fff; padding: 8px 14px;
  border-radius: 6px; max-width: 90vw; box-shadow: 0 4px 14px rgba(0,0,0,.25); pointer-events: auto; z-index: 6; }
.toast .link { color: #9cc2ff; margin-left: 10px; }`;

	/**
	 * Make an element. Text children become text nodes, never HTML, so imported text is safe.
	 * @param {string} tag
	 * @param {Object<string, *>} [attrs] - `on<event>` keys add listeners; true sets a bare
	 *   attribute; false, null and undefined skip it
	 * @param {...(Node|string|null|false|Array)} kids - nested arrays flatten; null and false skip
	 * @returns {HTMLElement}
	 */
	function h(tag, attrs = {}, ...kids) {
		const el = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs)) {
			if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
			else if (v === true) el.setAttribute(k, "");
			else if (v !== false && v != null) el.setAttribute(k, v);
		}
		el.append(...kids.flat().filter((k) => k != null && k !== false));
		return el;
	}

	let host,
		shadow,
		panel,
		list,
		lostBox,
		lostToggle,
		countEl,
		menu,
		toolbar,
		help,
		toastEl,
		toastTimer,
		fileInput,
		nameInput,
		emailInput,
		layer,
		svg,
		modeButtons,
		hint;
	let reviewFocus, helpFocus, exportButton;

	/** Build the UI (once, on first entry): page styles, and the shadow root with everything else. */
	function mount() {
		document.head.append(h("style", { id: "rv-page-style" }, PAGE_CSS));
		host = h("div", {
			id: "rv-host",
			contenteditable: "false",
			style: "position:fixed;inset:0;pointer-events:none;z-index:2147483000;overflow:hidden;",
		});
		shadow = host.attachShadow({ mode: "open" });
		toolbar = h(
			"div",
			{
				class: "toolbar",
				hidden: true,
				onmousedown: (e) => e.preventDefault(),
			}, // keep the selection
			h("button", { onclick: commentOnSelection }, "Comment"),
			h("button", { onclick: suggestOnSelection }, "Suggest edit"),
		);
		menu = h(
			"div",
			{ class: "menu", hidden: true },
			h("button", { onclick: copyJson }, "Copy JSON to clipboard"),
			h(
				"button",
				{
					onclick: () => {
						if (download())
							toast(
								"Downloaded " +
									fileName() +
									". Send it to the author.",
							);
					},
				},
				"Download file",
			),
			CFG.email
				? h("button", { onclick: email }, "Email to " + CFG.email)
				: null,
		);
		fileInput = h("input", {
			type: "file",
			accept: ".json,application/json",
			multiple: true,
			hidden: true,
			onchange: () => {
				importFiles([...fileInput.files]);
				fileInput.value = "";
			},
		});
		const who = (key, el) => {
			el.value = lsGet(key) || "";
			el.addEventListener("input", () => {
				lsSet(key, el.value.trim());
				el.classList.remove("missing");
				renderCards();
				layout();
			});
			return el;
		};
		nameInput = who(
			"name",
			h("input", { placeholder: "Your name", "aria-label": "Your name" }),
		);
		emailInput = who(
			"email",
			h("input", {
				type: "email",
				placeholder: "Email",
				"aria-label": "Your email",
			}),
		);
		countEl = h("span", { class: "count" });
		lostToggle = h("button", {
			class: "link",
			hidden: true,
			onclick: () => {
				lostBox.hidden = !lostBox.hidden;
			},
		});
		lostBox = h("div", { class: "lost", hidden: true });
		list = h("div", { class: "list" });
		modeButtons = {
			comment: h(
				"button",
				{ title: "Read and comment", onclick: () => setMode(false) },
				"Comment",
			),
			suggest: h(
				"button",
				{
					title: "Edit the text: edits become suggestions",
					onclick: () => setMode(true),
				},
				"Suggest",
			),
		};
		hint = h("div", { class: "hint" });
		panel = h(
			"aside",
			{ class: "panel" },
			h(
				"div",
				{
					class: "title",
					onclick: (e) => {
						if (!e.target.closest("button")) panel.classList.toggle("open");
					},
				},
				h("b", {}, "Review"),
				countEl,
				h(
					"button",
					{
						class: "link",
						title: "How this works",
						onclick: showHelp,
					},
					"?",
				),
				h(
					"button",
					{
						class: "link",
						title: "Leave review mode",
						onclick: exit,
					},
					TIMES,
				),
			),
			h("div", { class: "who" }, nameInput, emailInput),
			TOUCH
				? null
				: h(
						"div",
						{ class: "modes", role: "group", "aria-label": "Mode" },
						modeButtons.comment,
						modeButtons.suggest,
					),
			h(
				"div",
				{ class: "actions" },
				h(
					"button",
					{
						class: "primary",
						onclick: (e) => {
							e.stopPropagation();
							if (menu.hidden) {
								menu.hidden = false;
								menu.querySelector("button").focus({ preventScroll: true });
							} else closeExport();
						},
					},
					"Export " + chr(0x25be),
				),
				h(
					"button",
					{
						onclick: () => fileInput.click(),
						title: "Show files other reviewers exported (read-only)",
					},
					"Import",
				),
				lostToggle,
				menu,
				fileInput,
			),
			STORAGE
				? null
				: h(
						"div",
						{ class: "note orphan" },
						h("b", {}, "This view blocks browser storage:"),
						" your comments are lost if the page reloads. Open the page in a regular browser tab, or export before closing.",
					),
			hint,
			lostBox,
			list,
		);
		exportButton = panel.querySelector(".actions .primary");
		panel.addEventListener("dragover", (e) => {
			e.preventDefault();
			panel.classList.add("drop");
		});
		panel.addEventListener("dragleave", () =>
			panel.classList.remove("drop"),
		);
		panel.addEventListener("drop", (e) => {
			e.preventDefault();
			panel.classList.remove("drop");
			importFiles(e.dataTransfer.files);
		});
		shadow.addEventListener("click", (e) => {
			if (!e.composedPath().includes(menu)) menu.hidden = true;
		});
		svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		layer = h("div", { class: "layer" }, svg);
		toastEl = h("div", { class: "toast", hidden: true });
		shadow.append(h("style", {}, UI_CSS), layer, panel, toolbar, toastEl);
		document.body.append(host);
	}

	/**
	 * @param {string} msg - shown for a few seconds at the bottom of the screen
	 * @param {function(): void} [onUndo] - adds an Undo button that calls it
	 */
	function toast(msg, onUndo) {
		if (!toastEl) return; // not mounted yet: only the API is in use
		const hide = () => (toastEl.hidden = true);
		const button =
			onUndo &&
			h(
				"button",
				{
					class: "link",
					onclick: () => {
						hide();
						onUndo();
					},
				},
				"Undo",
			);
		toastEl.replaceChildren(msg, button || "");
		toastEl.hidden = false;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(hide, onUndo ? 8000 : 4500);
	}

	const when = (iso) =>
		new Date(iso).toLocaleString([], {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	const short = (s, n = 60) =>
		LQ + (s.length > n ? s.slice(0, n - 1) + ELL : s) + RQ;

	/** The header's counts: own and imported annotations, and how many are unsent. */
	function renderCount() {
		const n = mine().filter((a) => !isDraft(a)).length,
			otherCount = others.filter((a) => !a.deleted).length,
			u = unsent();
		countEl.replaceChildren(
			`${n} yours` + (otherCount ? `, ${otherCount} others` : ""),
			u ? DOT : "",
			u
				? h(
						"span",
						{
							class: "unsent",
							title: "Changed since your last export",
						},
						`${u} unsent`,
					)
				: "",
			HIGHLIGHTS ? "" : DOT + "no highlights in this browser",
		);
	}

	/**
	 * Rebuild every card: placed ones into the column (or the bottom sheet), not-found ones
	 * into the header's list. A field being typed in survives the rebuild, with its cursor.
	 */
	function renderCards() {
		const f = shadow.activeElement;
		const keep =
			f && f.dataset && f.dataset.id
				? { el: f, s: f.selectionStart, e: f.selectionEnd }
				: null;
		const items = all().map((a) => ({ a, sp: spans.get(a.id) }));
		cards = new Map(items.map((x) => [x.a.id, card(x, keep)]));
		const lost = items.filter((x) => x.sp.status === "orphan");
		const placed = items
			.filter((x) => x.sp.status !== "orphan")
			.sort((x, y) => x.sp.start - y.sp.start);
		lostToggle.hidden = !lost.length;
		lostToggle.textContent = `${lost.length} not found ` + chr(0x25be);
		lostBox.replaceChildren(...lost.map((x) => cards.get(x.a.id)));
		if (!lost.length) lostBox.hidden = true;
		const wide = innerWidth >= NARROW;
		layer.replaceChildren(
			svg,
			...(wide ? placed.map((x) => cards.get(x.a.id)) : []),
		);
		list.replaceChildren(
			...(wide ? [] : placed.map((x) => cards.get(x.a.id))),
		);
		if (keep && keep.el.isConnected) {
			keep.el.focus({ preventScroll: true });
			if (keep.s != null) keep.el.setSelectionRange(keep.s, keep.e);
		}
		renderCount();
	}

	/**
	 * An own card's Resolve/Reopen and delete buttons.
	 * @param {Annotation} a
	 * @returns {HTMLElement}
	 */
	function cardActions(a) {
		const resolved = a.status === "resolved";
		const toggle = () =>
			setFields(a, { status: resolved ? "open" : "resolved" });
		// no "are you sure": the message that follows offers Undo instead
		const del = () => {
			if (isDraft(a)) return remove(a);
			if (a.kind === "suggestion") {
				// an undo step, so Ctrl+Z brings it back too
				undoStack.push(JSON.stringify(state.annotations));
				redoStack = [];
				lastEdit = { id: null, t: 0 };
			}
			const copy = { ...a };
			remove(a);
			toast("Deleted.", () => restore(copy));
		};
		return h(
			"span",
			{ class: "acts" },
			h(
				"button",
				{ class: "link", onclick: toggle },
				resolved ? "Reopen" : "Resolve",
			),
			h(
				"button",
				{ class: "link", title: "Delete", onclick: del },
				TIMES,
			),
		);
	}

	/**
	 * Touch devices only (no in-page typing there): a suggestion's new text, typed in its card.
	 * @param {Annotation} a
	 * @returns {HTMLInputElement}
	 */
	function replacementField(a) {
		return h("input", {
			"data-id": a.id,
			"data-field": "replacement",
			placeholder: "Replace with",
			value: a.replacement || "",
			oninput: (e) => {
				a.replacement = e.target.value;
				a.updated = now();
				persist();
				render();
			},
		});
	}

	/**
	 * One annotation's card.
	 * @param {{a: Annotation, sp: Span}} item
	 * @param {{el: HTMLElement}|null} keep - a focused field to reuse instead of a new one
	 * @returns {HTMLElement}
	 */
	function card({ a, sp }, keep) {
		const own = !a._other;
		const cls = [
			"card",
			a.kind,
			own ? "" : "other",
			a.status === "resolved" ? "resolved" : "",
			a.id === active ? "active" : "",
		];
		const field = (name, make) =>
			keep &&
			keep.el.dataset.id === a.id &&
			keep.el.dataset.field === name
				? keep.el
				: make();
		let change = null;
		if (a.kind === "suggestion") {
			change = !a.quote.exact
				? ["Insert ", h("ins", {}, a.replacement)]
				: !a.replacement
					? "Delete"
					: ["Replace with ", h("ins", {}, a.replacement)];
		}
		const where = () =>
			short(
				a.quote.exact ||
					a.quote.prefix.slice(-20) +
						"|" +
						a.quote.suffix.slice(0, 20),
			);
		return h(
			"div",
			{
				class: cls.join(" "),
				"data-id": a.id,
				style: own ? null : `--c:${OTHER_COLORS[a._color]}`,
				onclick: (e) => {
					if (!e.composedPath()[0].closest("button,textarea,input"))
						focusAnnotation(a.id, true);
				},
			},
			h(
				"div",
				{ class: "meta" },
				own ? null : h("span", { class: "dot" }),
				h("b", {}, (own ? me().name : "") || a.author || "You"),
				DOT + when(a.updated),
				a.status === "resolved" ? DOT + "resolved" : "",
				own ? cardActions(a) : null,
			),
			change && (!TOUCH || !own)
				? h("div", { class: "change" }, change)
				: null,
			own && TOUCH && a.kind === "suggestion"
				? field("replacement", () => replacementField(a))
				: null,
			sp.status === "fuzzy"
				? h(
						"div",
						{ class: "note" },
						"The text changed since; it was " + where(),
					)
				: null,
			sp.status === "orphan"
				? h(
						"div",
						{ class: "note orphan" },
						"No longer on the page: " + where(),
					)
				: null,
			own
				? field("body", () => commentField(a))
				: a.body
					? h("div", { class: "body" }, a.body)
					: null,
		);
	}

	/**
	 * An own annotation's comment field: saves as it is typed, grows with its text. Enter
	 * finishes, Shift+Enter is a newline; a comment left empty is dropped when it loses focus.
	 * @param {Annotation} a
	 * @returns {HTMLTextAreaElement}
	 */
	function commentField(a) {
		const t = h("textarea", {
			rows: 1,
			"data-id": a.id,
			"data-field": "body",
			placeholder:
				a.kind === "suggestion"
					? "Add a comment (optional)"
					: "Comment",
		});
		t.value = a.body || "";
		const grow = () => {
			t.style.height = "auto";
			t.style.height = t.scrollHeight + "px";
		};
		t.addEventListener("input", () => {
			a.body = t.value;
			a.updated = now();
			persist();
			grow();
			renderCount();
			layout();
		});
		t.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
				e.preventDefault();
				t.blur();
			}
		});
		t.addEventListener("focus", () => {
			if (active !== a.id) focusAnnotation(a.id, false);
		});
		t.addEventListener("blur", () => {
			persist();
			if (isDraft(a))
				setTimeout(() => {
					if (isDraft(a) && shadow.activeElement !== t) remove(a);
				}, 0);
		});
		requestAnimationFrame(grow);
		return t;
	}

	// ==================================================================
	// the comment column: cards level with their text, a line from each to it
	// ==================================================================
	/**
	 * The first line box of an annotation's text (its inserted text, for an insertion).
	 * @param {string} id
	 * @returns {DOMRect|null} null when that is not laid out (hidden, say)
	 */
	function anchorBox(id) {
		const ins =
			!ranges.has(id) &&
			document.querySelector(`.rv-ins[data-id="${CSS.escape(id)}"]`);
		const r = ins || anchors.get(id);
		if (!r) return null;
		const rects = r.getClientRects();
		if (rects.length) return rects[0];
		const b = r.getBoundingClientRect(); // a collapsed range has no client rects, but a caret box
		return b.height ? b : null;
	}

	/**
	 * The page's own side column, if it declares one (`--doc-side-left`, `--doc-side-width` on
	 * <html>): measured with an empty box placed by those properties.
	 * @returns {{left: number, width: number}|null} in page coordinates; null without one
	 */
	let sideProbe = null;
	function sideColumn() {
		if (!sideProbe) {
			sideProbe = document.createElement("div");
			sideProbe.setAttribute("data-doc-chrome", "");
			sideProbe.setAttribute("aria-hidden", "true");
			sideProbe.style.cssText =
				"position:absolute;top:0;height:0;visibility:hidden;pointer-events:none;" +
				"left:var(--doc-side-left);width:var(--doc-side-width)";
		}
		if (!sideProbe.isConnected) document.documentElement.append(sideProbe);
		const r = sideProbe.getBoundingClientRect();
		return r.width >= 120 ? { left: r.left + scrollX, width: r.width } : null;
	}
	/** Tell the page how much room the comments need beside it: none in its own side column. */
	function reserveWidth() {
		const own = innerWidth >= NARROW && !sideColumn();
		document.documentElement.style.setProperty(
			"--review-width",
			own ? COLUMN + "px" : "0px",
		);
	}

	/**
	 * Place the cards in the column: each level with its text, pushed down past the card above
	 * and clear of the page's reserved boxes, with a line from the text's line to it. Narrow
	 * screens: the bottom sheet, no lines.
	 *
	 * A page whose own script lays out the side column (`window.MarginNotes.column`) places the
	 * cards instead, in one order with its own boxes: its `doccolumn` event collects them
	 * (`{top, left, height, place(top)}`, page coordinates), and the `doclayout` event after it
	 * draws them where it put them.
	 */
	function layout() {
		if (!on) return;
		const wide = innerWidth >= NARROW;
		panel.classList.toggle("sheet", !wide);
		panel.classList.toggle("compact", wide && !!sideColumn());
		layer.hidden = !wide;
		reserveWidth();
		if (!wide) return;
		if (managed()) {
			window.MarginNotes.place(); // asks for the cards (measure), then draws (doclayout)
			return;
		}
		measure();
		const { x0, cardWidth } = column();
		// the page's boxes in the cards' column that cards keep clear of (RESERVE)
		const sy = scrollY;
		const reserved = [...document.querySelectorAll(RESERVE)]
			.map((el) => el.getBoundingClientRect())
			.filter((r) => r.height && r.right > x0 && r.left < x0 + cardWidth)
			.map((r) => ({ t: r.top + sy - 6, b: r.bottom + sy + 6 }))
			.sort((a, b) => a.t - b.t);
		let floor = 0;
		for (const p of placed) {
			let y = Math.max(p.top, floor);
			// below any reserved box it would lie on (sorted, so one pass)
			for (const r of reserved) if (y < r.b && y + p.height > r.t) y = r.b;
			p.y = y;
			floor = y + p.height + 8;
		}
		draw();
	}
	/** @returns {boolean} whether the page's own script places the cards in its side column */
	const managed = () =>
		!!(
			window.MarginNotes &&
			window.MarginNotes.column &&
			!window.MarginNotes.narrow() &&
			sideColumn()
		);
	/** @returns {{x0: number, cardWidth: number}} where the cards go: the page's side column, or the window's right edge */
	function column() {
		const side = sideColumn();
		return {
			x0: side ? side.left : document.documentElement.clientWidth - COLUMN + 8,
			cardWidth: side ? side.width - 4 : COLUMN - 16,
		};
	}
	/** The cards that have a place in the text, in its order: `placed`, with where each wants to be. */
	let placed = [];
	function measure() {
		const { x0, cardWidth } = column();
		layer.style.setProperty("--x0", x0 + "px");
		layer.style.setProperty("--cw", cardWidth + "px"); // before the heights are read
		const sy = scrollY;
		// all reads, then all writes: a read after a write costs a full reflow, once per card
		const items = [...layer.querySelectorAll(".card")].map((el) => ({
			el,
			box: anchorBox(el.dataset.id),
		}));
		for (const it of items) it.el.hidden = !it.box; // nowhere to sit: hidden, not stranded at the corner
		placed = items.filter((it) => it.box);
		for (const p of placed) {
			p.top = p.box.top + sy - 4;
			p.height = p.el.offsetHeight;
		}
		placed.sort((a, b) => a.top - b.top || a.box.left - b.box.left);
	}
	document.addEventListener("doccolumn", (e) => {
		if (!on || innerWidth < NARROW || !managed()) return;
		measure();
		// the panel stays at the window's top (its title row, while compact): at the top of the
		// page, the column starts below it
		const box = panel.firstElementChild.getBoundingClientRect(),
			{ x0, cardWidth } = column();
		if (box.right > x0 && box.left < x0 + cardWidth)
			e.detail.items.push({
				top: 0,
				left: 0,
				height: box.bottom + 10,
				place: () => {},
			});
		for (const p of placed)
			e.detail.items.push({
				top: p.top,
				left: p.box.left,
				height: p.height,
				place: (y) => {
					p.y = y;
				},
			});
	});
	/**
	 * Put each card where it was placed (`y`), with its line: a dot at the end of the text's
	 * line, straight across towards the column, then a curve to the card's edge.
	 */
	function draw() {
		const { x0 } = column();
		const cw = document.documentElement.clientWidth,
			sy = scrollY;
		const rootBox = idx.root.getBoundingClientRect(),
			rootPad = parseFloat(getComputedStyle(idx.root).paddingRight) || 0;
		const textRight = Math.min(rootBox.right - rootPad, x0 - 24);
		const lines = !document.documentElement.classList.contains("lines-off");
		// the page's boxes that lines pass behind (AVOID), in page coordinates
		const avoid = [...document.querySelectorAll(AVOID)].map((el) => {
			const r = el.getBoundingClientRect();
			return {
				l: r.left - 4,
				r: r.right + 4,
				t: r.top + sy - 2,
				b: r.bottom + sy + 2,
			};
		});
		/** @returns {string} path segments along y from x to x1, broken where an avoid box is */
		const across = (x, x1, y) => {
			const cuts = avoid
				.filter((a) => a.t <= y && y <= a.b && a.r > x && a.l < x1)
				.sort((a, b) => a.l - b.l);
			let d = "";
			for (const c of cuts) {
				if (c.l > x) d += `M${x},${y} H${c.l}`;
				x = Math.max(x, c.r);
			}
			return x < x1 ? d + `M${x},${y} H${x1}` : d + `M${x1},${y}`;
		};
		let floor = 0,
			paths = "";
		for (const p of placed) {
			if (p.y === undefined) continue; // not placed yet
			p.el.style.top = p.y + "px";
			floor = Math.max(floor, p.y + p.height + 8);
			if (!lines) continue;
			const cls = p.el.dataset.id === active ? ' class="active"' : "";
			// the anchor's line was measured at p.top + 4 (page coordinates)
			const ay = p.top + 4 + p.box.height / 2,
				sx = Math.max(p.box.right, Math.min(textRight, x0 - 24)) + 6,
				bend = Math.max(sx, x0 - 52), // where the straight part ends
				mid = (bend + x0) / 2,
				to = p.y + 14;
			paths += `<circle${cls} cx="${sx}" cy="${ay}" r="2.2"/><path${cls} d="${across(sx, bend, ay)} C${mid},${ay} ${mid},${to} ${x0},${to}"/>`;
		}
		svg.setAttribute("width", cw);
		svg.setAttribute(
			"height",
			Math.max(floor, document.documentElement.scrollHeight),
		);
		svg.innerHTML = paths; // numbers and a fixed class only
		layer.style.width = cw + "px";
		layer.style.transform = `translateY(${-sy}px)`;
	}
	let layoutFrame = 0;
	const layoutSoon = () => {
		cancelAnimationFrame(layoutFrame);
		layoutFrame = requestAnimationFrame(layout);
	};
	const resizeObserver = new ResizeObserver(layoutSoon);
	document.addEventListener("doclayout", () => {
		if (!on) return;
		if (innerWidth >= NARROW && managed())
			draw(); // the page has just placed the cards
		else layoutSoon();
	});

	// ==================================================================
	// annotations: create, change, remove
	// ==================================================================
	/**
	 * @param {"comment"|"suggestion"} kind
	 * @param {number} start
	 * @param {number} end
	 * @returns {Annotation} a new own annotation on [start, end), not yet added
	 */
	function newAnnotation(kind, start, end) {
		const t = now();
		return {
			id: newId(),
			kind,
			...anchorFor(start, end),
			body: "",
			...(kind === "suggestion" ? { replacement: "" } : {}),
			status: "open",
			author: me().name,
			created: t,
			updated: t,
			commit: VERSION,
		};
	}

	/** Set some fields of an annotation, then save and redraw. */
	function setFields(a, fields) {
		Object.assign(a, fields, { updated: now() });
		persist();
		render();
	}

	/**
	 * Delete an annotation, without saving or redrawing. Once exported it stays as a tombstone,
	 * so the author's merge drops the copy they already have.
	 * @param {Annotation} a
	 */
	function drop(a) {
		if (!state.exported || a.created > state.exported)
			state.annotations = state.annotations.filter((x) => x !== a);
		else Object.assign(a, { deleted: true, updated: now() });
		if (active === a.id) active = null;
	}

	/** @param {Annotation} a - deleted, then save and redraw */
	function remove(a) {
		drop(a);
		persist();
		render();
	}

	/**
	 * Bring back a deleted annotation, by id: nothing to do if it is back already (Ctrl+Z).
	 * @param {Annotation} a - a copy from before it was deleted
	 */
	function restore(a) {
		const cur = state.annotations.find((x) => x.id === a.id);
		if (cur && !cur.deleted) return;
		if (cur) delete cur.deleted;
		else state.annotations.push(a);
		(cur || a).updated = now(); // newer than a tombstone already exported
		persist();
		render();
	}

	/** The toolbar's Comment: a comment on the selection, its field focused. */
	function commentOnSelection() {
		const sel = getSelection();
		toolbar.hidden = true;
		if (!sel.rangeCount) return;
		const span = trimmed(sel.getRangeAt(0));
		if (!span) return;
		const a = newAnnotation("comment", ...span);
		state.annotations.push(a);
		active = a.id;
		sel.removeAllRanges();
		render();
		cards.get(a.id)?.querySelector("textarea")?.focus();
	}

	/** The toolbar's Suggest edit: strike the selection, and (in Suggest mode) put the caret after it. */
	function suggestOnSelection() {
		const sel = getSelection();
		toolbar.hidden = true;
		if (!sel.rangeCount) return;
		const r = sel.getRangeAt(0);
		const span = trimmed(r);
		if (!span || refuseMath({ sc: r.startContainer, ec: r.endContainer }))
			return;
		if (!TOUCH && !suggesting) {
			setMode(true);
			idx.root.focus({ preventScroll: true });
		}
		edit(() => {
			const s = strike(...span);
			return { s, j: s.replacement.length };
		});
		if (TOUCH) cards.get(typingInto)?.querySelector("input")?.focus();
	}

	// a double-click in Comment mode starts suggesting there, its word selected (typing replaces it)
	document.addEventListener("dblclick", (e) => {
		if (!on || suggesting || TOUCH || e.composedPath().includes(host))
			return;
		const t = e.target.nodeType === 1 ? e.target : e.target.parentElement;
		if (
			!t ||
			!idx.root.contains(t) ||
			t.closest(SKIP + ",a,button,input,textarea,select,math")
		)
			return;
		setMode(true);
		idx.root.focus({ preventScroll: true });
	});

	// ==================================================================
	// suggesting by typing: each edit to the page becomes a change to a suggestion
	// ==================================================================
	/**
	 * The own suggestion whose inserted-text span holds a DOM point.
	 * @param {Node} node
	 * @param {number} offset
	 * @returns {{s: Annotation, j: number}|null} the suggestion, and the offset in its new text
	 */
	function insAt(node, offset) {
		const el = (node.nodeType === 1 ? node : node.parentElement)?.closest(
			".rv-ins",
		);
		const s = el && mine().find((a) => a.id === el.dataset.id);
		if (!s) return null;
		return {
			s,
			j: node === el ? (offset === 0 ? 0 : s.replacement.length) : offset,
		};
	}

	/**
	 * @param {number} k
	 * @returns {Annotation|null} the suggestion an edit at k joins: one whose struck text k is in
	 *   or next to (the one being typed into, if several)
	 */
	function touching(k) {
		const hits = openSuggestions().filter(
			(s) => spans.get(s.id).start <= k && k <= spans.get(s.id).end,
		);
		return hits.find((s) => s.id === typingInto) || hits[0] || null;
	}

	/**
	 * Strike characters [a, b), merging with the suggestions that overlap or touch them.
	 * @returns {Annotation} the suggestion now holding them
	 */
	function strike(a, b) {
		const hit = openSuggestions()
			.filter(
				(s) => spans.get(s.id).start <= b && a <= spans.get(s.id).end,
			)
			.sort((x, y) => spans.get(x.id).start - spans.get(y.id).start);
		let start = a,
			end = b;
		for (const s of hit) {
			start = Math.min(start, spans.get(s.id).start);
			end = Math.max(end, spans.get(s.id).end);
		}
		const keep = hit[0] || newAnnotation("suggestion", start, end);
		if (!hit.length) state.annotations.push(keep);
		keep.replacement = hit.map((s) => s.replacement).join("");
		keep.body = hit
			.map((s) => s.body)
			.filter(Boolean)
			.join("\n");
		for (const s of hit.slice(1)) drop(s);
		Object.assign(keep, anchorFor(start, end));
		spans.set(keep.id, { start, end, status: "ok" });
		return keep;
	}

	/**
	 * Typing: into a suggestion's inserted text; over a selection (struck, the text inserted
	 * after it); next to a suggestion (joining it); else a new insertion.
	 * @param {Points} r - where the text goes
	 * @param {string} text
	 * @returns {Caret}
	 */
	function insertText(r, text) {
		const a = insAt(r.sc, r.so),
			b = insAt(r.ec, r.eo);
		if (a && b && a.s === b.s) {
			a.s.replacement =
				a.s.replacement.slice(0, a.j) +
				text +
				a.s.replacement.slice(b.j);
			return { s: a.s, j: a.j + text.length, patch: true };
		}
		const start = toIndex(r.sc, r.so),
			end = toIndex(r.ec, r.eo);
		if (end > start) {
			const s = strike(start, end);
			s.replacement += text;
			return { s, j: s.replacement.length };
		}
		let s = touching(start);
		if (s) {
			const sp = spans.get(s.id),
				j =
					start === sp.start && sp.start < sp.end
						? 0
						: s.replacement.length;
			const shown = !!s.replacement; // its inserted-text span exists to patch
			s.replacement =
				s.replacement.slice(0, j) + text + s.replacement.slice(j);
			return { s, j: j + text.length, patch: shown };
		}
		s = newAnnotation("suggestion", start, start);
		s.replacement = text;
		state.annotations.push(s);
		return { s, j: text.length };
	}

	/**
	 * Deleting: from a suggestion's inserted text, or striking page text. Text already struck
	 * is skipped: the character just past it is struck instead.
	 * @param {Points} r - the browser's target range (or the selection)
	 * @param {number} dir - -1 backward, 1 forward
	 * @returns {Caret|null} null if there is nothing to delete
	 */
	function deleteText(r, dir) {
		const a = insAt(r.sc, r.so),
			b = insAt(r.ec, r.eo);
		if (a && b && a.s === b.s) {
			let [i, j] = [a.j, b.j];
			if (i === j) [i, j] = dir < 0 ? [i - 1, i] : [i, i + 1]; // no target range: the char beside the caret
			if (i >= 0 && j <= a.s.replacement.length) {
				a.s.replacement =
					a.s.replacement.slice(0, i) + a.s.replacement.slice(j);
				return { s: a.s, j: i, patch: true };
			}
		}
		const n = idx.text.length;
		let start = toIndex(r.sc, r.so),
			end = toIndex(r.ec, r.eo);
		const caret = end <= start;
		if (caret) {
			if (dir < 0) start = Math.max(0, start - 1);
			else end = Math.min(n, end + 1);
		}
		const inside = openSuggestions().find(
			(s) =>
				spans.get(s.id).start <= start &&
				end <= spans.get(s.id).end &&
				spans.get(s.id).end > spans.get(s.id).start,
		);
		if (inside) {
			if (!caret) return null; // a selection of struck text: nothing left to strike
			const sp = spans.get(inside.id);
			[start, end] =
				dir < 0 ? [sp.start - 1, sp.start] : [sp.end, sp.end + 1];
		}
		if (start < 0 || end > n || end <= start) return null;
		const s = strike(start, end);
		return { k: dir < 0 ? s.position.start : s.position.end, id: s.id };
	}

	/**
	 * Apply one edit: record an undo step (a run of keystrokes into one suggestion is one step),
	 * drop suggestions left empty, save, redraw (or just patch the inserted text), place the caret.
	 * @param {function(): (Caret|null)} fn - makes the change
	 */
	function edit(fn) {
		const before = JSON.stringify(state.annotations);
		const caret = fn();
		if (!caret) return;
		const id = caret.s ? caret.s.id : caret.id,
			t = Date.now();
		if (!(lastEdit.id === id && t - lastEdit.t < 1000))
			undoStack.push(before);
		lastEdit = { id, t };
		if (undoStack.length > 200) undoStack.shift();
		redoStack = [];
		const s0 = mine().find((a) => a.id === id);
		const wasActive = active;
		if (s0) {
			s0.updated = now();
			typingInto = active = id;
		}
		let dropped = false;
		for (const s of mine()) {
			// nothing struck, nothing inserted, nothing said: gone
			if (
				s.kind === "suggestion" &&
				s.position.start === s.position.end &&
				!s.replacement &&
				!s.body
			) {
				drop(s);
				dropped = true;
			}
		}
		persist();
		if (!(
			caret.patch &&
			!renderDeferred &&
			!dropped &&
			patchInsert(caret.s, wasActive !== active)
		))
			render();
		placeCaret(caret);
	}

	/**
	 * After an edit that changed only a suggestion's inserted text (not its anchor): update that
	 * span's text and its card, and lay out. The page's own text, so the index and every anchor,
	 * is unchanged; a full render costs far more with many annotations.
	 * @param {Annotation} s
	 * @param {boolean} activeChanged
	 * @returns {boolean} false when there is no span to update (its text became empty): render instead
	 */
	function patchInsert(s, activeChanged) {
		const el = document.querySelector(
			`.rv-ins[data-id="${CSS.escape(s.id)}"]`,
		);
		if (!el || !el.firstChild || !s.replacement) return false;
		el.firstChild.data = s.replacement;
		observer.takeRecords(); // our own change
		const old = cards.get(s.id),
			fresh = card({ a: s, sp: spans.get(s.id) }, null);
		fresh.style.cssText = old.style.cssText;
		fresh.hidden = old.hidden;
		old.replaceWith(fresh);
		cards.set(s.id, fresh);
		if (activeChanged) {
			paint();
			for (const [id, c] of cards)
				c.classList.toggle("active", id === active);
		}
		renderCount();
		layoutSoon();
		return true;
	}

	/** @param {Caret} c - put the caret there */
	function placeCaret(c) {
		const r = document.createRange();
		const el =
			c.s &&
			document.querySelector(`.rv-ins[data-id="${CSS.escape(c.s.id)}"]`);
		if (el && el.firstChild)
			r.setStart(el.firstChild, Math.min(c.j, el.firstChild.length));
		else if (c.s)
			r.setStart(
				...pointAt(
					Math.min(
						(spans.get(c.s.id) || c.s.position).end, // dropped just now: where it was
						idx.text.length,
					),
				),
			);
		else r.setStart(...pointAt(Math.min(c.k, idx.text.length)));
		const sel = getSelection();
		sel.removeAllRanges();
		sel.addRange(r);
	}

	/**
	 * Undo (or redo, with the stacks swapped) the typing of suggestions. Only suggestions are
	 * restored from the snapshot: comments stay as they are now, and so do a suggestion's note
	 * and resolved state, none of which typing made. The snapshot's `updated` stamps are older
	 * than copies already exported, and the merge keeps the newest copy, so it would bring the
	 * undone change back: everything the swap changes is stamped now instead, and an exported
	 * suggestion it removes becomes a tombstone.
	 * @param {string[]} from - snapshots to restore from
	 * @param {string[]} to - where the current state goes
	 */
	function undo(from, to) {
		if (!from.length) return;
		to.push(JSON.stringify(state.annotations));
		const next = JSON.parse(from.pop()).filter(
				(a) => a.kind === "suggestion",
			),
			t = now();
		const prev = new Map(state.annotations.map((a) => [a.id, a]));
		const same = (x, y) =>
			JSON.stringify({ ...x, updated: 0, position: 0 }) ===
			JSON.stringify({ ...y, updated: 0, position: 0 });
		for (const a of next) {
			const p = prev.get(a.id);
			if (p && !p.deleted)
				Object.assign(a, { body: p.body, status: p.status });
			if (!p || !same(p, a)) a.updated = t;
		}
		const kept = new Set(next.map((a) => a.id));
		for (const a of prev.values()) {
			if (kept.has(a.id)) continue;
			if (a.kind !== "suggestion" || a.deleted) next.push(a);
			else if (state.exported && a.created <= state.exported)
				next.push({ ...a, deleted: true, updated: t });
		}
		state.annotations = next;
		lastEdit = { id: null, t: 0 };
		persist();
		render();
	}

	const inMath = (n) =>
		!!(n.nodeType === 1 ? n : n.parentElement)?.closest("math");

	/**
	 * Inserted text cannot be shown inside a formula (MathML holds no HTML).
	 * @param {Points} pts
	 * @returns {boolean} true (and a toast) if the edit touches math
	 */
	function refuseMath(pts) {
		if (!inMath(pts.sc) && !inMath(pts.ec)) return false;
		toast(
			"Suggested edits cannot go inside math. Select the formula and comment on it instead.",
		);
		return true;
	}

	// every edit in Suggest mode: cancelled, and made a suggestion instead
	document.addEventListener(
		"beforeinput",
		(e) => {
			if (!on || !suggesting || e.composedPath().includes(host)) return;
			const target =
				e.target.nodeType === 1 ? e.target : e.target.parentElement;
			if (target && target.closest("input,textarea,select")) return; // the page's own form fields
			// a composition (dead key, IME) cannot be cancelled: it is undone and applied at its end
			if (composing || e.isComposing || /Composition/.test(e.inputType))
				return;
			e.preventDefault();
			toolbar.hidden = true;
			if (target && target.closest(OUTSIDE)) return;
			const type = e.inputType;
			if (type === "historyUndo") return undo(undoStack, redoStack);
			if (type === "historyRedo") return undo(redoStack, undoStack);
			let text = null,
				dir = 0;
			if (type.startsWith("insert")) {
				text = e.data ?? e.dataTransfer?.getData("text/plain") ?? "";
				text =
					type === "insertParagraph" || type === "insertLineBreak"
						? ""
						: text.replace(/\s+/g, " ");
				if (!text) return;
			} else if (type.startsWith("delete"))
				dir = type.includes("Backward") ? -1 : 1;
			else return; // formatting, drag-moves, ...
			const tr = e.getTargetRanges()[0],
				sel = getSelection();
			const r = tr || (sel.rangeCount && sel.getRangeAt(0));
			if (!r) return;
			const pts = {
				sc: r.startContainer,
				so: r.startOffset,
				ec: r.endContainer,
				eo: r.endOffset,
			};
			if (refuseMath(pts)) return;
			edit(() =>
				text !== null ? insertText(pts, text) : deleteText(pts, dir),
			);
		},
		true,
	);

	// ==================================================================
	// compositions: let the browser compose, then put the page back and apply the result
	// ==================================================================
	/** @type {{records: MutationRecord[], pts: Points}|null} from compositionstart to compositionend */
	let composing = null;
	const compObserver = new MutationObserver((rs) => {
		if (composing) composing.records.push(...rs);
	});
	document.addEventListener(
		"compositionstart",
		(e) => {
			if (!on || !suggesting || e.composedPath().includes(host)) return;
			if (e.target.closest?.("input,textarea,select")) return; // the page's own form fields
			const sel = getSelection();
			if (!sel.rangeCount) return;
			const r = sel.getRangeAt(0);
			composing = {
				records: [],
				pts: {
					sc: r.startContainer,
					so: r.startOffset,
					ec: r.endContainer,
					eo: r.endOffset,
				},
			};
			// Disconnecting the observer does not cancel a redraw it already scheduled.
			renderDeferred ||= !!pending;
			clearTimeout(pending);
			pending = 0;
			observer.disconnect(); // a re-render mid-composition would break the IME
			compObserver.observe(idx.root, {
				childList: true,
				subtree: true,
				characterData: true,
				characterDataOldValue: true,
			});
		},
		true,
	);
	document.addEventListener(
		"compositionend",
		(e) => {
			if (!composing) return;
			composing.records.push(...compObserver.takeRecords());
			compObserver.disconnect();
			for (const r of composing.records.reverse()) {
				// newest first, back to the page as it was
				if (r.type === "characterData") r.target.data = r.oldValue;
				else {
					for (const n of r.addedNodes) n.remove();
					for (const n of r.removedNodes)
						r.target.insertBefore(n, r.nextSibling);
				}
			}
			const { pts } = composing;
			composing = null;
			observer.observe(idx.root, {
				childList: true,
				subtree: true,
				characterData: true,
			});
			const text = (e.data || "").replace(/\s+/g, " ");
			if (text && !refuseMath(pts)) edit(() => insertText(pts, text));
			else render();
		},
		true,
	);

	/**
	 * Focus an annotation: highlight it and its card, and bring them into view.
	 * @param {string} id
	 * @param {boolean} scroll - scroll the page to its text, if that is out of view
	 */
	function focusAnnotation(id, scroll) {
		active = id;
		paint();
		for (const [cid, el] of cards)
			el.classList.toggle("active", cid === id);
		layout();
		const el = cards.get(id);
		if (innerWidth < NARROW || el?.closest(".lost"))
			el?.scrollIntoView({ block: "nearest" });
		const box = anchorBox(id);
		if (scroll && box && (box.top < 0 || box.bottom > innerHeight * 0.7))
			scrollBy({ top: box.top - innerHeight / 3, behavior: "smooth" });
	}

	// ==================================================================
	// help
	// ==================================================================
	/** The how-to window (shown on first entry, and from the ? button). */
	function showHelp() {
		lsSet("help-seen", "1");
		closeHelp();
		helpFocus = shadow.activeElement;
		help = h(
			"div",
			{
				class: "backdrop",
				onkeydown: (e) => {
					// Got it is the dialog's only control; Tab stays inside the modal.
					if (e.key === "Tab") e.preventDefault();
				},
				onclick: (e) => {
					if (e.target === help) closeHelp();
				},
			},
			h(
				"div",
				{
					class: "modal",
					role: "dialog",
					"aria-modal": "true",
					"aria-label": "Reviewing this page",
				},
				h("h2", {}, "Reviewing this page"),
				h(
					"ol",
					{},
					h(
						"li",
						{},
						"Fill in your name and email in the box at the top right.",
					),
					h(
						"li",
						{},
						"Select any text, then click ",
						h("b", {}, "Comment"),
						" or ",
						h("b", {}, "Suggest edit"),
						".",
					),
				),
				h(
					"p",
					{ class: "warn" },
					h("b", {}, "Your comments are saved only in this browser."),
					" Nobody else can see them until you send them: use the ",
					h("b", {}, "Export"),
					" button at the top right and send to the author.",
				),
				h(
					"p",
					{ class: "row" },
					h(
						"button",
						{ class: "primary", onclick: closeHelp },
						"Got it",
					),
				),
			),
		);
		shadow.append(help);
		help.querySelector("button").focus({ preventScroll: true });
	}
	function closeHelp() {
		if (!help) return;
		help.remove();
		help = null;
		helpFocus?.focus({ preventScroll: true });
	}

	// ==================================================================
	// export / import
	// ==================================================================
	const slug = (s) =>
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "anonymous";
	const fileName = () =>
		`review-${slug(me().name)}-${new Date().toISOString().slice(0, 10)}.json`;

	/**
	 * This reviewer's export (format review/v1): the page, who they are, and their annotations,
	 * tombstones included so the author's merge drops copies sent earlier. All are this
	 * reviewer's, so all go under the name they use now.
	 * @returns {Object|null} null (and a nudge to the name box) until they have given a name
	 */
	function exportData() {
		const { name, email: contact } = me();
		if (!name) {
			if (host) {
				toast("Fill in your name at the top right first.");
				nameInput.classList.add("missing");
				panel.classList.add("open"); // compact: the field has to be there to take the focus
				nameInput.focus();
				menu.hidden = true;
			}
			return null;
		}
		return {
			format: FORMAT,
			doc: {
				url: location.origin + location.pathname,
				path: location.pathname,
				title: document.title,
				commit: VERSION.replace(/-dirty$/, ""),
				dirty: VERSION.endsWith("-dirty"),
				text_length: (idx || buildIndex()).text.length,
			},
			reviewer: name,
			contact,
			exported_at: now(),
			annotations: state.annotations
				.filter((a) => !isDraft(a))
				.map((a) => ({ ...a, author: name })),
		};
	}
	function closeExport() {
		const focused = menu.contains(shadow.activeElement);
		menu.hidden = true;
		if (focused) exportButton.focus({ preventScroll: true });
	}
	function markExported() {
		state.exported = now();
		persist();
		renderCount();
		closeExport();
	}

	/** Export > Copy: the JSON to the clipboard. */
	async function copyJson() {
		const data = exportData();
		if (!data) return;
		const s = JSON.stringify(data, null, 2);
		try {
			await navigator.clipboard.writeText(s);
		} catch {
			// no async clipboard outside a secure context
			const ta = h("textarea", {}, s);
			shadow.append(ta);
			ta.select();
			const ok = document.execCommand("copy");
			ta.remove();
			if (!ok) return toast("Could not copy. Use Download file instead.");
		}
		markExported();
		toast("Copied. Paste it into an email or message to the author.");
	}

	/**
	 * Export > Download: the JSON as a file.
	 * @returns {boolean} false if there was nothing to export yet (no name)
	 */
	function download() {
		const data = exportData();
		if (!data) return false;
		const blob = new Blob([JSON.stringify(data, null, 2)], {
			type: "application/json",
		});
		const a = h("a", {
			href: URL.createObjectURL(blob),
			download: fileName(),
		});
		shadow.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(a.href), 2000);
		markExported();
		return true;
	}

	/**
	 * Export > Email: a mail to CFG.email with the JSON as its body. A mail link cannot attach a
	 * file, and some mail clients truncate long ones: past MAILTO_MAX the file is downloaded
	 * instead, and the mail asks the reviewer to attach it.
	 */
	function email() {
		const data = exportData();
		if (!data) return;
		const n = data.annotations.filter((a) => !a.deleted).length;
		const subject = `Review of "${document.title}" from ${data.reviewer} (${n} comments)`;
		const mailto = (body) =>
			`mailto:${CFG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
		let url = mailto(JSON.stringify(data));
		if (url.length > MAILTO_MAX) {
			download();
			url = mailto(
				`[Attach ${fileName()} from your Downloads folder before sending.]\n\n${n} comments on ${data.doc.url}`,
			);
			toast(
				`Downloaded ${fileName()}. Attach it to the email that just opened.`,
			);
		}
		markExported(); // before navigating, so the unsent-changes prompt does not fire
		location.href = url;
	}

	function colorFor(author) {
		if (!colors.has(author))
			colors.set(author, colors.size % OTHER_COLORS.length);
		return colors.get(author);
	}
	const isStr = (v) => typeof v === "string";
	/** @returns {boolean} enough of an annotation to anchor and show; anything else in an imported file is skipped */
	const wellFormed = (a) =>
		a &&
		isStr(a.id) &&
		(a.kind === "comment" || a.kind === "suggestion") &&
		isStr(a.updated) &&
		a.quote &&
		isStr(a.quote.exact) &&
		isStr(a.quote.prefix) &&
		isStr(a.quote.suffix) &&
		(!a.position ||
			(Number.isInteger(a.position.start) &&
				Number.isInteger(a.position.end) &&
				a.position.start >= 0));

	/**
	 * Add other reviewers' annotations from one review/v1 file (read-only, newest copy of each
	 * id; own ones and tombstoned ones left out).
	 * @param {Object} data - a parsed review/v1 file
	 * @returns {[number, number]} [added, skipped as malformed]
	 * @throws {Error} if it is not a review/v1 file
	 */
	function addOthers(data) {
		if (!data || data.format !== FORMAT || !Array.isArray(data.annotations))
			throw new Error("not a review file");
		const own = new Set(state.annotations.map((a) => a.id));
		let n = 0,
			bad = 0;
		for (const raw of data.annotations) {
			if (!wellFormed(raw)) {
				bad++;
				continue;
			}
			const a = {
				...raw,
				body: isStr(raw.body) ? raw.body : "",
				replacement: isStr(raw.replacement) ? raw.replacement : "",
			};
			if (own.has(a.id)) continue;
			const prev = others.find((o) => o.id === a.id);
			if (prev && prev.updated >= a.updated) continue;
			others = others.filter((o) => o.id !== a.id);
				// Keep deletions too: an older export imported later must not revive them.
			const author = a.author || data.reviewer || "anonymous";
			others.push({
				...a,
				author,
				_other: true,
				_color: colorFor(author),
			});
				if (!a.deleted) n++;
		}
		return [n, bad];
	}

	/** @param {File[]|FileList} files - exported review files, from Import or a drop on the panel */
	async function importFiles(files) {
		let n = 0,
			bad = 0;
		const failed = [];
		for (const f of files) {
			try {
				const [added, skipped] = addOthers(JSON.parse(await f.text()));
				n += added;
				bad += skipped;
			} catch {
				failed.push(f.name);
			}
		}
		render();
		const read = files.length - failed.length;
		toast(
			`Showing ${n} annotations from ${read} file${read === 1 ? "" : "s"}` +
				(bad ? `; skipped ${bad} that were malformed` : "") +
				(failed.length ? `; could not read ${failed.join(", ")}` : "") +
				".",
		);
	}

	// ==================================================================
	// modes: on/off, Comment/Suggest
	// ==================================================================
	// the page changing under us (outside our own nodes): re-render, debounced
	let pending = 0;
	const observer = new MutationObserver((records) => {
		if (
			records.every((r) =>
				(r.target.nodeType === 1
					? r.target
					: r.target.parentElement
				)?.closest(SKIP),
			)
		)
			return;
		clearTimeout(pending);
		pending = setTimeout(render, 300);
	});

	let rootAttrs = null; // the root's own contenteditable/spellcheck, restored on leaving
	const restoreAttr = (root, attr, v) => {
		if (v === null) root.removeAttribute(attr);
		else root.setAttribute(attr, v);
	};

	/**
	 * Switch between Comment mode (the page reads as usual) and Suggest mode (the root is
	 * editable, edits become suggestions). Touch devices stay in Comment mode.
	 * @param {boolean} s - Suggest mode
	 */
	function setMode(s) {
		suggesting = s && !TOUCH;
		const root = document.querySelector(CFG.root) || document.body;
		if (suggesting) root.setAttribute("contenteditable", "true");
		else restoreAttr(root, "contenteditable", rootAttrs.ce);
		modeButtons.comment.setAttribute("aria-pressed", String(!suggesting));
		modeButtons.suggest.setAttribute("aria-pressed", String(suggesting));
		panel.classList.toggle("suggesting", suggesting);
		hint.textContent = suggesting
			? "Click into the text and type: your edits become suggestions. Ctrl/Cmd+click follows a link; Esc goes back to Comment."
			: "Select text to comment or suggest an edit" +
				(TOUCH
					? "."
					: ", or switch to Suggest to edit the text directly.");
	}

	/** Enter review mode, in Comment mode (remembered across reloads until left). */
	function enter() {
		if (on) return;
		reviewFocus = document.activeElement;
		while (reviewFocus?.shadowRoot?.activeElement)
			reviewFocus = reviewFocus.shadowRoot.activeElement;
		on = true;
		state = store.load(); // as stored now: a script may have changed it while review mode was off
		undoStack = [];
		redoStack = [];
		lsSet(ON_KEY, "1");
		if (!host) mount();
		host.style.display = "";
		const root = document.querySelector(CFG.root) || document.body;
		rootAttrs = {
			ce: root.getAttribute("contenteditable"),
			sc: root.getAttribute("spellcheck"),
		};
		setMode(false);
		root.setAttribute("spellcheck", "false");
		root.setAttribute("data-rv-root", "");
		document.documentElement.classList.add("review-on");
		reserveWidth();
		render();
		observer.observe(idx.root, {
			childList: true,
			subtree: true,
			characterData: true,
		});
		resizeObserver.observe(idx.root);
		// Start at the panel's first button, without opening a phone's text keyboard.
		panel.querySelector("button").focus({ preventScroll: true });
		if (!lsGet("help-seen")) showHelp();
		if (CFG.load && !loaded) {
			loaded = true;
			fetch(CFG.load)
				.then((r) => r.json())
				.then((d) => {
					addOthers(d);
					render();
				})
				.catch((e) =>
					toast(`Could not load ${CFG.load}: ${e.message}`),
				);
		}
	}

	/** Leave review mode: the page as it was (no spans, highlights, or editing). */
	function exit() {
		if (!on) return;
		on = false;
		lsSet(ON_KEY, "0");
		host.style.display = "none";
		toolbar.hidden = true;
		closeHelp();
		clearHighlights();
		clearInserts();
		observer.takeRecords();
		observer.disconnect();
		resizeObserver.disconnect();
		const root = idx.root;
		suggesting = false;
		restoreAttr(root, "contenteditable", rootAttrs.ce);
		restoreAttr(root, "spellcheck", rootAttrs.sc);
		root.removeAttribute("data-rv-root");
		document.documentElement.classList.remove("review-on");
		document.documentElement.style.removeProperty("--review-width");
		document.dispatchEvent(new Event("doclayout"));
		if (reviewFocus?.isConnected) reviewFocus.focus({ preventScroll: true });
	}

	// ==================================================================
	// events
	// ==================================================================
	/** Show the Comment / Suggest edit toolbar under a selection of the page's text. */
	function selectionChanged() {
		if (!on) return;
		const sel = getSelection();
		const r = sel.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0) : null;
		const el =
			r &&
			(r.commonAncestorContainer.nodeType === 1
				? r.commonAncestorContainer
				: r.commonAncestorContainer.parentElement);
		if (!r || !idx.root.contains(el) || el.closest(SKIP)) {
			toolbar.hidden = true;
			return;
		}
		const rects = r.getClientRects(),
			last = rects[rects.length - 1] || r.getBoundingClientRect();
		toolbar.hidden = false;
		const w = toolbar.offsetWidth,
			top =
				last.bottom + 8 + 40 > innerHeight
					? last.top - 44
					: last.bottom + 8;
		toolbar.style.left =
			Math.max(8, Math.min(innerWidth - w - 8, last.right - w / 2)) +
			"px";
		toolbar.style.top = top + "px";
	}
	let selTimer = 0;
	document.addEventListener("selectionchange", () => {
		clearTimeout(selTimer);
		selTimer = setTimeout(selectionChanged, 120);
	});
	addEventListener(
		"scroll",
		() => {
			if (!on) return;
			layer.style.transform = `translateY(${-scrollY}px)`;
			if (!toolbar.hidden) selectionChanged();
		},
		{ passive: true },
	);
	addEventListener("resize", () => {
		if (on) {
			renderCards();
			layout();
		}
	});

	/** @returns {{node: Node, offset: number}|null} the caret position under a screen point */
	function caretAt(x, y) {
		if (document.caretPositionFromPoint) {
			const c = document.caretPositionFromPoint(x, y);
			return c && { node: c.offsetNode, offset: c.offset };
		}
		const r =
			document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
		return r && { node: r.startContainer, offset: r.startOffset };
	}

	// a click on highlighted or inserted text focuses its card (the shortest, if they overlap);
	// in Suggest mode, where the editable page does not follow links, Ctrl/Cmd+click does
	document.addEventListener("click", (e) => {
		if (!on || e.composedPath().includes(host)) return;
		const link =
			suggesting &&
			(e.ctrlKey || e.metaKey) &&
			e.target.closest &&
			e.target.closest("a[href]");
		if (link) {
			e.preventDefault();
			if (link.getAttribute("href").startsWith("#"))
				location.hash = link.getAttribute("href");
			else window.open(link.href, "_blank", "noopener");
			return;
		}
		if (!getSelection().isCollapsed) return;
		const ins = e.target.closest && e.target.closest(".rv-ins");
		if (ins) return focusAnnotation(ins.dataset.id, false);
		const p = caretAt(e.clientX, e.clientY);
		if (!p || !idx.root.contains(p.node)) return;
		const k = toIndex(p.node, p.offset);
		let hit = null;
		for (const id of ranges.keys()) {
			const sp = spans.get(id);
			if (
				sp.start <= k &&
				k <= sp.end &&
				(!hit || sp.end - sp.start < hit.len)
			)
				hit = { id, len: sp.end - sp.start };
		}
		if (hit) focusAnnotation(hit.id, false);
	});

	document.addEventListener("keydown", (e) => {
		const t = e.composedPath()[0];
		const ours = host && e.composedPath().includes(host);
		// undo/redo of suggestions: the browser has no history of its own (every edit was
		// cancelled), so it sends no historyUndo input
		if (
			on &&
			!TOUCH &&
			!ours &&
			(e.ctrlKey || e.metaKey) &&
			!e.altKey &&
			/^[zy]$/i.test(e.key) &&
			!t.closest?.("input,textarea,select") // the page's own fields keep their undo
		) {
			e.preventDefault();
			if (e.key.toLowerCase() === "y" || e.shiftKey)
				undo(redoStack, undoStack);
			else undo(undoStack, redoStack);
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		// Esc closes the topmost thing, or leaves Suggest mode; never review mode (the page may
		// use Esc itself, to close a popup, say)
		if (on && e.key === "Escape") {
			if (help) closeHelp();
			else if (!menu.hidden) closeExport();
			else if (!toolbar.hidden) toolbar.hidden = true;
			else if (ours && t.blur) t.blur();
			else if (suggesting) setMode(false);
			return;
		}
		// E toggles review mode, unless it is being typed (Suggest mode, a text field)
		const typing =
			t instanceof Element &&
			(t.closest("input,textarea,select") || t.isContentEditable);
		if (!typing && (e.key === "e" || e.key === "E")) {
			e.preventDefault();
			if (on) exit();
			else enter();
		}
	});

	addEventListener("beforeunload", (e) => {
		if (unsent() > 0) {
			e.preventDefault();
			e.returnValue = "";
		}
	});

	const flag = (v) => v === "1" || v === "true";
	if (
		flag(PARAMS.get("review")) ||
		flag(PARAMS.get("edit")) ||
		flag(DATA.reviewStart) ||
		lsGet(ON_KEY) === "1"
	) {
		// loaded in <head> without defer: there is no body to mount on yet
		if (document.body) enter();
		else addEventListener("DOMContentLoaded", enter);
	}
})();

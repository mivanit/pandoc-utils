APT_YES ?=
FILTERS_DIR := $(CURDIR)/filters
PANDOC_FROM := markdown+footnotes+inline_notes

.PHONY: check
check: dep-check format typing test

.PHONY: dep-install
dep-install: dep-install-apt dep-install-npm
	uv sync

.PHONY: dep-install-apt
dep-install-apt:
	sudo apt-get update
	sudo apt-get install $(APT_YES) \
		pandoc texlive-latex-base texlive-latex-extra texlive-extra-utils texlive-bibtex-extra biber inkscape

.PHONY: dep-install-npm
dep-install-npm:
	npm install -g @mermaid-js/mermaid-cli

.PHONY: clean
clean:
	rm -rf tests/.temp

.PHONY: test
test: clean
	uv run pytest tests/ -v

# html-papers/: the page scripts in headless Chromium (once: uv run playwright install chromium)
.PHONY: test-html
test-html:
	uv run pytest html-papers/tests -v

# the same in Firefox (once: uv run playwright install firefox)
.PHONY: test-html-firefox
test-html-firefox:
	HTML_PAPERS_BROWSER=firefox uv run pytest html-papers/tests -v

# the demo paper's runnable code in the real Python, fetched from its CDN (needs the network)
.PHONY: test-html-pyodide
test-html-pyodide:
	HTML_PAPERS_PYODIDE=1 uv run pytest html-papers/tests/test_pages.py -v -k real_python

.PHONY: dep-check
dep-check:
	@echo "Checking dependencies..."
	@for cmd in uv pandoc pdflatex biber inkscape pdfcrop mmdc python; do \
		if command -v $$cmd >/dev/null 2>&1; then \
			printf "  %-12s %s\n" "$$cmd" "$$(command -v $$cmd)"; \
			printf "  %-12s %s\n" "" "$$($$cmd --version 2>&1 | head -1)"; \
		else \
			printf "  %-12s MISSING\n" "$$cmd"; \
		fi; \
	done

.PHONY: format
format:
	uv run ruff format .
	uv run ruff check --fix .

.PHONY: format-check
format-check:
	uv run ruff format --check .
	uv run ruff check .

.PHONY: typing
typing:
	uv run ty check .

.PHONY: demo
demo: clean-demo
	mkdir -p docs/filters
	cp demo.md demo_pipeline.svg README.md docs/
	cp filters/csv_tex_table.py filters/columns.lua docs/filters/
	cd docs && uv run bash ../pandoc_md_pdf.sh demo.md
	cd docs && uv run pandoc -f $(PANDOC_FROM) -s \
		--defaults _pandoc_defaults.demo.yml \
		demo.md -o demo.html

# docs/ is the GitHub Pages site. Everything in it but the html-papers demo, the index page
# and .nojekyll belongs to `demo`.
.PHONY: clean-demo
clean-demo:
	mkdir -p docs
	find docs -mindepth 1 -maxdepth 1 ! -name html-papers ! -name .html-papers-build ! -name index.html ! -name .nojekyll \
		-exec rm -rf {} +

# html-papers/demo/ -> docs/html-papers/: a paper as a web page (index.html) and a PDF
# (paper.pdf). The paper's source and the html-papers scripts and stylesheets are copied to a
# folder beside the published one, the paper's own build.sh runs there, and the result replaces
# the published folder only if the build succeeds (a claim of the paper that stopped holding
# stops the build). DOC_VERSION tells the page which sources it was built from: the commit,
# -dirty when html-papers/ has uncommitted changes.
HTML_PAPERS_SITE := docs/html-papers
HTML_PAPERS_BUILD := docs/.html-papers-build
HTML_PAPERS_VERSION = $(shell git rev-parse HEAD 2>/dev/null)$(shell git diff --quiet HEAD -- html-papers 2>/dev/null || echo -dirty)

.PHONY: demo-html-papers
demo-html-papers: demo-html-papers-copy
	DOC_VERSION="$(HTML_PAPERS_VERSION)" bash $(HTML_PAPERS_BUILD)/build.sh all
	rm -rf $(HTML_PAPERS_SITE)
	mv $(HTML_PAPERS_BUILD) $(HTML_PAPERS_SITE)

# the web page only: a few seconds, no LaTeX. The PDF stays as it was last built.
.PHONY: demo-html-papers-html
demo-html-papers-html: demo-html-papers-copy
	if [ -f $(HTML_PAPERS_SITE)/paper.pdf ]; then cp -p $(HTML_PAPERS_SITE)/paper.pdf $(HTML_PAPERS_BUILD)/; fi
	DOC_VERSION="$(HTML_PAPERS_VERSION)" bash $(HTML_PAPERS_BUILD)/build.sh html
	rm -rf $(HTML_PAPERS_SITE)
	mv $(HTML_PAPERS_BUILD) $(HTML_PAPERS_SITE)

.PHONY: demo-html-papers-copy
demo-html-papers-copy:
	rm -rf $(HTML_PAPERS_BUILD)
	mkdir -p $(HTML_PAPERS_BUILD)
	cp -r html-papers/demo/. $(HTML_PAPERS_BUILD)/
	cp html-papers/*.js html-papers/*.css html-papers/numeric.csl html-papers/README.md $(HTML_PAPERS_BUILD)/

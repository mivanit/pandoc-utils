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
	find docs -mindepth 1 -maxdepth 1 ! -name html-papers ! -name index.html ! -name .nojekyll \
		-exec rm -rf {} +

# html-papers/demo/ -> docs/html-papers/: a paper as a web page (index.html) and a PDF
# (paper.pdf). Starts the folder afresh, copies the paper's source and the html-papers scripts
# and stylesheets there, then runs the paper's own build.sh in that folder.
HTML_PAPERS_SITE := docs/html-papers
.PHONY: demo-html-papers
demo-html-papers:
	rm -rf $(HTML_PAPERS_SITE)
	$(MAKE) demo-html-papers-copy
	bash $(HTML_PAPERS_SITE)/build.sh all

# the web page only: a few seconds, no LaTeX. Copies over what is there, so the PDF stays
# (as it was last built).
.PHONY: demo-html-papers-html
demo-html-papers-html: demo-html-papers-copy
	bash $(HTML_PAPERS_SITE)/build.sh html

.PHONY: demo-html-papers-copy
demo-html-papers-copy:
	mkdir -p $(HTML_PAPERS_SITE)
	cp -r html-papers/demo/. $(HTML_PAPERS_SITE)/
	cp html-papers/*.js html-papers/*.css html-papers/numeric.csl $(HTML_PAPERS_SITE)/

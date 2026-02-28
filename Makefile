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

.PHONY: clean-demo
clean-demo:
	rm -rf docs

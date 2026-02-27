APT_YES ?=

.PHONY: check
check: dep-check format typing test

.PHONY: install
install: install-apt install-npm
	uv sync

.PHONY: install-apt
install-apt:
	sudo apt-get update
	sudo apt-get install $(APT_YES) pandoc \
		texlive-latex-base texlive-latex-extra texlive-extra-utils \
		texlive-bibtex-extra biber \
		inkscape imagemagick

.PHONY: install-npm
install-npm:
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
	@for cmd in uv pandoc pdflatex biber inkscape pdfcrop mmdc magick python; do \
		if command -v $$cmd >/dev/null 2>&1; then \
			printf "  %-12s %s\n" "$$cmd" "$$(command -v $$cmd)"; \
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

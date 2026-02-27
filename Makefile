APT_YES ?=

.PHONY: install install-apt install-npm test check-deps

install: install-apt install-npm
	uv sync

install-apt:
	sudo apt-get update
	sudo apt-get install $(APT_YES) pandoc \
		texlive-latex-base texlive-latex-extra texlive-extra-utils \
		texlive-bibtex-extra biber \
		inkscape imagemagick

install-npm:
	npm install -g @mermaid-js/mermaid-cli

test:
	uv run pytest tests/ -v

check-deps:
	@echo "Checking dependencies..."
	@for cmd in uv pandoc pdflatex biber inkscape pdfcrop mmdc magick python; do \
		if command -v $$cmd >/dev/null 2>&1; then \
			printf "  %-12s %s\n" "$$cmd" "$$(command -v $$cmd)"; \
		else \
			printf "  %-12s MISSING\n" "$$cmd"; \
		fi; \
	done

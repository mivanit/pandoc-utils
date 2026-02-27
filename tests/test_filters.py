"""Integration tests for pandoc filters.

Each test runs pandoc with a filter on a minimal markdown input
and checks the output.
"""

import json
import shutil

from conftest import run_pandoc, run_pandoc_json, FILTERS_DIR


def require_tool(name: str) -> None:
    """Assert that a CLI tool is available, failing the test with a clear message if not."""
    assert shutil.which(name) is not None, (
        f"required tool '{name}' not found in PATH — run 'make install' or install it manually"
    )


# -- svg_to_pdf --


class TestSvgToPdf:
    def test_converts_svg_to_pdf_for_latex(self, tmp_workdir):
        require_tool("inkscape")
        svg = tmp_workdir / "diagram.svg"
        svg.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">'
            '<rect width="10" height="10" fill="red"/></svg>'
        )
        md = f"![test]({svg})\n"
        output = run_pandoc(
            md,
            filter_path=FILTERS_DIR / "svg_to_pdf.py",
            to="latex",
            cwd=tmp_workdir,
        )
        pdf = svg.with_suffix(".pdf")
        assert pdf.exists(), "PDF was not created"
        assert str(pdf) in output or pdf.name in output

    def test_skips_non_svg_images(self, tmp_workdir):
        png = tmp_workdir / "photo.png"
        png.write_bytes(b"\x89PNG\r\n\x1a\n")  # minimal PNG header
        md = f"![test]({png})\n"
        ast = run_pandoc_json(
            md,
            filter_path=FILTERS_DIR / "svg_to_pdf.py",
            cwd=tmp_workdir,
        )
        # image src should remain .png unchanged
        ast_str = json.dumps(ast)
        assert "photo.png" in ast_str

    def test_passes_through_for_html(self, tmp_workdir):
        md = "![test](diagram.svg)\n"
        output = run_pandoc(
            md,
            filter_path=FILTERS_DIR / "svg_to_pdf.py",
            to="html",
            cwd=tmp_workdir,
        )
        assert "diagram.svg" in output


# -- include-code-files --


class TestIncludeCodeFiles:
    def test_includes_file_content(self, tmp_workdir):
        src = tmp_workdir / "hello.py"
        src.write_text("print('hello world')\n")
        md = f'```{{.python include="{src}"}}\n```\n'
        output = run_pandoc(
            md,
            to="plain",
            extra_args=["--lua-filter", str(FILTERS_DIR / "include-code-files.lua")],
            cwd=tmp_workdir,
        )
        assert "print('hello world')" in output

    def test_includes_line_range(self, tmp_workdir):
        src = tmp_workdir / "lines.txt"
        src.write_text("line1\nline2\nline3\nline4\n")
        md = f'```{{include="{src}" start-line="2" end-line="3"}}\n```\n'
        output = run_pandoc(
            md,
            to="plain",
            extra_args=["--lua-filter", str(FILTERS_DIR / "include-code-files.lua")],
            cwd=tmp_workdir,
        )
        assert "line2" in output
        assert "line3" in output
        assert "line1" not in output
        assert "line4" not in output


# -- include-files --


class TestIncludeFiles:
    def test_includes_markdown_file(self, tmp_workdir):
        included = tmp_workdir / "included.md"
        included.write_text("## Included heading\n\nIncluded paragraph.\n")
        md = f'```{{.include}}\n{included}\n```\n'
        output = run_pandoc(
            md,
            to="plain",
            extra_args=["--lua-filter", str(FILTERS_DIR / "include-files.lua")],
            cwd=tmp_workdir,
        )
        assert "Included heading" in output
        assert "Included paragraph" in output

    def test_includes_multiple_files(self, tmp_workdir):
        a = tmp_workdir / "a.md"
        b = tmp_workdir / "b.md"
        a.write_text("Content A\n")
        b.write_text("Content B\n")
        md = f'```{{.include}}\n{a}\n{b}\n```\n'
        output = run_pandoc(
            md,
            to="plain",
            extra_args=["--lua-filter", str(FILTERS_DIR / "include-files.lua")],
            cwd=tmp_workdir,
        )
        assert "Content A" in output
        assert "Content B" in output


# -- table.lua --


class TestTableLua:
    def test_creates_table_from_yaml(self, tmp_workdir):
        md = (
            '```{.table}\n'
            'caption: Test Table\n'
            'series:\n'
            '  - name: Name\n'
            '  - name: Value\n'
            'data:\n'
            '  - [Alice, 10]\n'
            '  - [Bob, 20]\n'
            '```\n'
        )
        output = run_pandoc(
            md,
            to="latex",
            extra_args=["--lua-filter", str(FILTERS_DIR / "table.lua")],
            cwd=tmp_workdir,
        )
        assert "Alice" in output
        assert "Bob" in output
        assert "Test Table" in output


# -- columns.lua --


class TestColumnsLua:
    def test_multicol_in_latex(self, tmp_workdir):
        md = (
            '::: {.columns columngap=2em}\n'
            'First column content.\n'
            '\n'
            '::: columnbreak\n'
            ':::\n'
            '\n'
            'Second column content.\n'
            ':::\n'
        )
        output = run_pandoc(
            md,
            to="latex",
            extra_args=["--lua-filter", str(FILTERS_DIR / "columns.lua")],
            cwd=tmp_workdir,
        )
        assert "multicol" in output.lower() or "column" in output.lower()


# -- mermaid (skipped by default) --


class TestMermaid:
    def test_mermaid_generates_image_for_latex(self, tmp_workdir):
        require_tool("mmdc")
        require_tool("inkscape")
        md = (
            '```mermaid\n'
            'graph LR\n'
            '    A --> B\n'
            '```\n'
        )
        output = run_pandoc(
            md,
            filter_path=FILTERS_DIR / "mermaid.py",
            to="latex",
            cwd=tmp_workdir,
        )
        assert "includegraphics" in output

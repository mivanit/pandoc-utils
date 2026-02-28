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

    def test_dedent(self, tmp_workdir):
        src = tmp_workdir / "indented.py"
        src.write_text("    def hello():\n        pass\n")
        md = f'```{{.python include="{src}" dedent="4"}}\n```\n'
        output = run_pandoc(
            md,
            to="plain",
            extra_args=["--lua-filter", str(FILTERS_DIR / "include-code-files.lua")],
            cwd=tmp_workdir,
        )
        assert "def hello():" in output
        assert "    def hello():" not in output


# -- include-files --


class TestIncludeFiles:
    def test_includes_markdown_file(self, tmp_workdir):
        included = tmp_workdir / "included.md"
        included.write_text("## Included heading\n\nIncluded paragraph.\n")
        md = f"```{{.include}}\n{included}\n```\n"
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
        md = f"```{{.include}}\n{a}\n{b}\n```\n"
        output = run_pandoc(
            md,
            to="plain",
            extra_args=["--lua-filter", str(FILTERS_DIR / "include-files.lua")],
            cwd=tmp_workdir,
        )
        assert "Content A" in output
        assert "Content B" in output

    def test_heading_level_shift(self, tmp_workdir):
        included = tmp_workdir / "shifted.md"
        included.write_text("## Level Two\n\nBody text.\n")
        md = f'```{{.include shift-heading-level-by="2"}}\n{included}\n```\n'
        ast = run_pandoc_json(
            md,
            extra_args=["--lua-filter", str(FILTERS_DIR / "include-files.lua")],
            cwd=tmp_workdir,
        )
        # heading should be shifted from level 2 to level 4
        headers = [b for b in ast["blocks"] if b["t"] == "Header"]
        assert len(headers) == 1
        assert headers[0]["c"][0] == 4  # level 2 + shift 2 = 4

    def test_comment_lines_ignored(self, tmp_workdir):
        included = tmp_workdir / "real.md"
        included.write_text("Real content here.\n")
        md = f"```{{.include}}\n// this is a comment\n{included}\n```\n"
        output = run_pandoc(
            md,
            to="plain",
            extra_args=["--lua-filter", str(FILTERS_DIR / "include-files.lua")],
            cwd=tmp_workdir,
        )
        assert "Real content here" in output
        assert "this is a comment" not in output


# -- table.lua --


class TestTableLua:
    def test_creates_table_from_yaml(self, tmp_workdir):
        md = (
            "```{.table}\n"
            "caption: Test Table\n"
            "series:\n"
            "  - name: Name\n"
            "  - name: Value\n"
            "data:\n"
            "  - [Alice, 10]\n"
            "  - [Bob, 20]\n"
            "```\n"
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

    def test_auto_numbering(self, tmp_workdir):
        md = (
            "```{.table}\n"
            "caption: Numbered\n"
            "series:\n"
            "  - title: No.\n"
            "    special: number\n"
            "  - title: Item\n"
            "    id: item\n"
            "data:\n"
            "  - item: Apple\n"
            "  - item: Banana\n"
            "  - item: Cherry\n"
            "```\n"
        )
        output = run_pandoc(
            md,
            to="plain",
            extra_args=["--lua-filter", str(FILTERS_DIR / "table.lua")],
            cwd=tmp_workdir,
        )
        assert "1" in output
        assert "2" in output
        assert "3" in output
        assert "Apple" in output
        assert "Cherry" in output

    def test_id_field_mapping(self, tmp_workdir):
        md = (
            "```{.table}\n"
            "caption: Mapped\n"
            "series:\n"
            "  - title: City\n"
            "    id: city\n"
            "  - title: Pop\n"
            "    id: pop\n"
            "data:\n"
            "  - city: London\n"
            "    pop: 9M\n"
            "  - city: Paris\n"
            "    pop: 2M\n"
            "```\n"
        )
        output = run_pandoc(
            md,
            to="plain",
            extra_args=["--lua-filter", str(FILTERS_DIR / "table.lua")],
            cwd=tmp_workdir,
        )
        assert "London" in output
        assert "9M" in output
        assert "Paris" in output
        assert "2M" in output

    def test_column_alignment_right(self, tmp_workdir):
        md = (
            "```{.table}\n"
            "caption: Aligned\n"
            "series:\n"
            "  - title: Name\n"
            "    id: name\n"
            "    align: left\n"
            "  - title: Score\n"
            "    id: score\n"
            "    align: right\n"
            "data:\n"
            "  - name: Ada\n"
            "    score: 100\n"
            "```\n"
        )
        ast = run_pandoc_json(
            md,
            extra_args=["--lua-filter", str(FILTERS_DIR / "table.lua")],
            cwd=tmp_workdir,
        )
        ast_str = json.dumps(ast)
        assert "AlignRight" in ast_str
        assert "AlignLeft" in ast_str


# -- columns.lua --


class TestColumnsLua:
    def test_multicol_in_latex(self, tmp_workdir):
        md = (
            "::: {.columns columngap=2em}\n"
            "First column content.\n"
            "\n"
            "::: columnbreak\n"
            ":::\n"
            "\n"
            "Second column content.\n"
            ":::\n"
        )
        output = run_pandoc(
            md,
            to="latex",
            extra_args=["--lua-filter", str(FILTERS_DIR / "columns.lua")],
            cwd=tmp_workdir,
        )
        assert "\\begin{multicols}" in output
        assert "\\end{multicols}" in output
        assert "\\columnbreak" in output
        assert "First column content" in output
        assert "Second column content" in output

    def test_column_count(self, tmp_workdir):
        md = "::: {.columns column-count=3}\nContent here.\n:::\n"
        output = run_pandoc(
            md,
            to="latex",
            extra_args=["--lua-filter", str(FILTERS_DIR / "columns.lua")],
            cwd=tmp_workdir,
        )
        assert "\\begin{multicols}{3}" in output

    def test_column_gap_in_latex(self, tmp_workdir):
        md = "::: {.columns column-gap=3em}\nGapped content.\n:::\n"
        output = run_pandoc(
            md,
            to="latex",
            extra_args=["--lua-filter", str(FILTERS_DIR / "columns.lua")],
            cwd=tmp_workdir,
        )
        assert "\\columnsep" in output
        assert "3em" in output

    def test_columns_html(self, tmp_workdir):
        md = "::: {.columns column-count=2}\nHTML columns.\n:::\n"
        output = run_pandoc(
            md,
            to="html",
            extra_args=["--lua-filter", str(FILTERS_DIR / "columns.lua")],
            cwd=tmp_workdir,
        )
        assert "column-count: 2" in output

    def test_syntactic_sugar_two_columns(self, tmp_workdir):
        md = "::: two-columns\nSugar content.\n:::\n"
        output = run_pandoc(
            md,
            to="latex",
            extra_args=["--lua-filter", str(FILTERS_DIR / "columns.lua")],
            cwd=tmp_workdir,
        )
        assert "\\begin{multicols}{2}" in output


# -- mermaid (skipped by default) --


class TestMermaid:
    def test_mermaid_generates_image_for_latex(self, tmp_workdir):
        require_tool("mmdc")
        require_tool("inkscape")
        md = "```mermaid\ngraph LR\n    A --> B\n```\n"
        output = run_pandoc(
            md,
            filter_path=FILTERS_DIR / "mermaid.py",
            to="latex",
            cwd=tmp_workdir,
        )
        assert "includegraphics" in output

    def test_mermaid_generates_image_for_html(self, tmp_workdir):
        require_tool("mmdc")
        md = "```mermaid\ngraph LR\n    A --> B\n```\n"
        output = run_pandoc(
            md,
            filter_path=FILTERS_DIR / "mermaid.py",
            to="html",
            cwd=tmp_workdir,
        )
        assert "<img" in output

    def test_skips_non_mermaid_codeblock(self, tmp_workdir):
        md = "```python\nprint('hello')\n```\n"
        output = run_pandoc(
            md,
            filter_path=FILTERS_DIR / "mermaid.py",
            to="plain",
            cwd=tmp_workdir,
        )
        assert "print('hello')" in output


# -- csv_tex_table --


class TestCsvTexTable:
    def test_creates_table_from_csv(self, tmp_workdir):
        md = "```{.csvtable}\nx,y,z\n10,20,30\n40,50,60\n```\n"
        output = run_pandoc(
            md,
            filter_path=FILTERS_DIR / "csv_tex_table.py",
            to="latex",
            cwd=tmp_workdir,
        )
        # column headers
        assert "x" in output
        assert "y" in output
        assert "z" in output
        # data values
        assert "10" in output
        assert "30" in output
        assert "50" in output

    def test_csv_table_caption(self, tmp_workdir):
        md = '```{.csvtable caption="Sales Data"}\nitem,qty\nApples,5\n```\n'
        output = run_pandoc(
            md,
            filter_path=FILTERS_DIR / "csv_tex_table.py",
            to="latex",
            cwd=tmp_workdir,
        )
        assert "Sales Data" in output
        assert "Apples" in output

    def test_ignores_non_csvtable_codeblock(self, tmp_workdir):
        md = "```python\nprint('hello')\n```\n"
        output = run_pandoc(
            md,
            filter_path=FILTERS_DIR / "csv_tex_table.py",
            to="plain",
            cwd=tmp_workdir,
        )
        assert "print('hello')" in output

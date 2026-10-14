# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "pandocfilters",
# ]
# ///

"""pandoc filter to process Mermaid diagrams into svg for html, pdf for latex

assumes `mmdc` (mermaid-cli) is installed and available in PATH
assumes `inkscape` and `pdfcrop` are installed and available in PATH for PDF conversion/processing
Modified from:
https://github.com/timofurrer/pandoc-mermaid-filter
"""

import json
import os
import sys
import subprocess
from typing import Any

from pandocfilters import toJSONFilter, Para, Image
from pandocfilters import get_filename4code, get_caption, get_extension

PUPPETEER_CFG: str | None = os.environ.get("PUPPETEER_CFG", None)
MERMAID_BIN: str = "mmdc"
INKSCAPE_BIN: str = "inkscape"
PDFCROP_BIN: str = "pdfcrop"
MERMAID_PDF_CONFIG: dict[str, object] = {
    "htmlLabels": False,
    "flowchart": {"htmlLabels": False},
}


def _append_puppeteer_config(cmd: list[str]) -> None:
    """Append puppeteer config flags to a mermaid command if available."""
    if PUPPETEER_CFG is not None:
        cmd.extend(["-p", PUPPETEER_CFG])
    elif os.path.isfile(".puppeteer.json"):
        cmd.extend(["-p", ".puppeteer.json"])


def mermaid(
    key: str,
    value: Any,
    format_: str,
    _: Any,
) -> dict[str, Any] | None:
    """Process Mermaid code blocks in Pandoc documents

    # Parameters:
     - `key : str`
        The type of Pandoc element
     - `value : Any`
        The content of the element
     - `format_ : str`
        The target output format
     - `_ : Any`
        Metadata (unused)

    # Returns:
     - `dict[str, Any] | None`
        Para element with Image, or None if not a mermaid block
    """
    if key == "CodeBlock":
        [[ident, classes, keyvals], code] = value

        if "mermaid" in classes:
            caption: list[dict[str, Any]]
            typef: str
            cap_keyvals: list[tuple[str, str]]
            caption, typef, cap_keyvals = get_caption(keyvals)

            filename: str = get_filename4code("mermaid", code)

            # For LaTeX, we'll create PDF; for others, use default
            if format_ == "latex":
                filetype = "pdf"
            else:
                filetype = get_extension(format_, "png", html="svg", latex="pdf")

            src: str = filename + ".mmd"
            dest: str = filename + "." + filetype

            if not os.path.isfile(dest):
                txt: bytes = code.encode("utf-8")
                os.makedirs(os.path.dirname(src), exist_ok=True)
                with open(src, "wb") as f:
                    f.write(txt)

                if format_ == "latex":
                    # For LaTeX: generate SVG, convert to PDF, crop
                    svg_file: str = filename + ".svg"
                    pdf_uncropped: str = filename + "_uncropped.pdf"

                    # Write mermaid config to force native SVG text
                    # (Inkscape drops <foreignObject> during SVG-to-PDF)
                    config_path: str = filename + "_mermaid_config.json"
                    with open(config_path, "w") as cf:
                        json.dump(MERMAID_PDF_CONFIG, cf)

                    # Step 1: Generate SVG with mermaid
                    cmd_mermaid: list[str] = [
                        MERMAID_BIN,
                        "--input",
                        src,
                        "--output",
                        svg_file,
                        "--configFile",
                        config_path,
                    ]

                    _append_puppeteer_config(cmd_mermaid)

                    sys.stderr.write(f"Running: {' '.join(cmd_mermaid)}\n")
                    subprocess.check_call(
                        cmd_mermaid, stdout=sys.stderr, stderr=sys.stderr
                    )

                    # Step 2: Convert SVG to PDF with Inkscape
                    cmd_inkscape: list[str] = [
                        INKSCAPE_BIN,
                        svg_file,
                        "--export-filename=" + pdf_uncropped,
                    ]

                    sys.stderr.write(f"Running: {' '.join(cmd_inkscape)}\n")
                    subprocess.check_call(
                        cmd_inkscape, stdout=sys.stderr, stderr=sys.stderr
                    )
                    # Inkscape exits 0 even when it can't parse the SVG; without
                    # this, pdfcrop below fails with a confusing "not found"
                    if not os.path.isfile(pdf_uncropped):
                        raise RuntimeError(
                            f"mermaid: inkscape did not produce {pdf_uncropped}"
                        )

                    # Step 3: Crop the PDF
                    cmd_pdfcrop: list[str] = [
                        PDFCROP_BIN,
                        pdf_uncropped,
                        dest,
                        "--margins",
                        "10",
                    ]

                    sys.stderr.write(f"Running: {' '.join(cmd_pdfcrop)}\n")
                    subprocess.check_call(
                        cmd_pdfcrop, stdout=sys.stderr, stderr=sys.stderr
                    )

                    # Intermediate SVG/PDF kept for debugging; pandoc re-runs
                    # skip conversion when the final dest already exists (line 80).

                    sys.stderr.write(f"Created cropped PDF: {dest}\n")

                else:
                    # For non-LaTeX formats, use original behavior
                    cmd: list[str] = [
                        MERMAID_BIN,
                        "--input",
                        src,
                        "--output",
                        dest,
                    ]

                    _append_puppeteer_config(cmd)

                    sys.stderr.write(f"Running: {' '.join(cmd)}\n")
                    subprocess.check_call(cmd, stdout=sys.stderr, stderr=sys.stderr)
                    sys.stderr.write(f"Created image: {dest}\n")

            return Para([Image([ident, [], cap_keyvals], caption, [dest, typef])])


def main() -> None:
    """Entry point for the pandoc filter"""
    toJSONFilter(mermaid)


if __name__ == "__main__":
    main()

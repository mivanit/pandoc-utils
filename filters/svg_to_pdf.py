# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "pandocfilters",
# ]
# ///

"""Pandoc filter to convert SVG images to PDF for LaTeX output.

Assumes `inkscape` is installed and available in PATH.
For non-LaTeX formats, SVG images are passed through unchanged.
"""

import os
import sys
import subprocess
from typing import Any

from pandocfilters import toJSONFilter, Image

INKSCAPE_BIN: str = "inkscape"


def svg_to_pdf(
    key: str,
    value: Any,
    format_: str,
    _: Any,
) -> dict[str, Any] | None:
    if key != "Image":
        return None

    [attrs, caption, [src, title]] = value

    if not src.lower().endswith(".svg"):
        return None

    if format_ != "latex":
        return None

    pdf_src: str = src[:-4] + ".pdf"

    # Convert if PDF doesn't exist or SVG is newer
    needs_convert: bool = not os.path.isfile(pdf_src) or (
        os.path.isfile(src) and os.path.getmtime(src) > os.path.getmtime(pdf_src)
    )

    if needs_convert:
        if not os.path.isfile(src):
            sys.stderr.write(f"svg_to_pdf: SVG not found: {src}\n")
            return None

        cmd: list[str] = [
            INKSCAPE_BIN,
            src,
            f"--export-filename={pdf_src}",
        ]

        sys.stderr.write(f"svg_to_pdf: {' '.join(cmd)}\n")
        subprocess.check_call(cmd, stderr=sys.stderr)
        sys.stderr.write(f"svg_to_pdf: created {pdf_src}\n")

    return Image(attrs, caption, [pdf_src, title])


def main() -> None:
    toJSONFilter(svg_to_pdf)


if __name__ == "__main__":
    main()

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
            raise FileNotFoundError(f"svg_to_pdf: SVG not found: {src}")

        cmd: list[str] = [
            INKSCAPE_BIN,
            src,
            f"--export-filename={pdf_src}",
        ]

        # Inkscape exits 0 even when it can't parse the SVG, so remove any
        # stale PDF first and check that a fresh one was actually written
        if os.path.isfile(pdf_src):
            os.remove(pdf_src)

        sys.stderr.write(f"svg_to_pdf: {' '.join(cmd)}\n")
        subprocess.check_call(cmd, stdout=sys.stderr, stderr=sys.stderr)
        if not os.path.isfile(pdf_src):
            raise RuntimeError(
                f"svg_to_pdf: inkscape did not produce {pdf_src} (see inkscape output above)"
            )
        sys.stderr.write(f"svg_to_pdf: created {pdf_src}\n")

    return Image(attrs, caption, [pdf_src, title])


def main() -> None:
    toJSONFilter(svg_to_pdf)


if __name__ == "__main__":
    main()

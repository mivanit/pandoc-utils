#!/usr/bin/env python
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "pandocfilters",
# ]
# ///

"""
Pandoc filter to process raw latex tikz environments into images.
Assumes that pdflatex is in the path, and that the standalone
package is available.  Also assumes that ImageMagick's convert
is in the path. Images are put in the tikz-images directory.
"""

import os
import re
import shutil
import sys
from subprocess import call
import hashlib
# from tempfile import mkdtemp

from pandocfilters import toJSONFilter, Para, Image, get_extension

VERBOSE_OUT = sys.stderr
VERBOSE_OUT = None

DENSITY = 300

IMAGE_DIR = "tikz-images"


def mkdir(path):
    if not os.path.isdir(path):
        os.mkdir(path)


def tikz2image(tikz_src, filetype, outfile):
    tmpdir = "pandoc-temp"
    mkdir(tmpdir)

    olddir = os.getcwd()
    os.chdir(tmpdir)
    f = open("tikz.tex", "w")
    f.write("""\\documentclass{standalone}
			 \\usepackage{tikz}
			 \\usetikzlibrary{graphs,quotes,arrows.meta}
			 \\begin{document}
			 """)
    f.write(tikz_src)
    f.write("\n\\end{document}\n")
    f.close()
    call(["pdflatex", "tikz.tex"], stdout=VERBOSE_OUT)
    os.chdir(olddir)
    if filetype == "pdf":
        shutil.copyfile(tmpdir + "/tikz.pdf", outfile + ".pdf")
    else:
        cmd = [
            "magick", "convert",
            "-density", str(DENSITY),
            f"{tmpdir}/tikz.pdf",
            "-colorspace", "RGB",
            f"{outfile}.{filetype}",
        ]
        sys.stderr.write("running cmd:\n\t" + " ".join(cmd) + "\n")
        call(cmd, stdout=VERBOSE_OUT)
    shutil.rmtree(tmpdir)


def tikz(key, value, format, _):
    # print('test!')
    if key == "RawBlock":
        [fmt, code] = value
        if fmt == "latex" and re.match("\\\\begin{tikzpicture}", code):
            # outfile = get_filename4code("tikz", code)
            mkdir(IMAGE_DIR)
            outfile = (
                IMAGE_DIR
                + "/"
                + hashlib.sha1(code.encode(sys.getfilesystemencoding())).hexdigest()
            )

            filetype = get_extension(format, "png", html="png", latex="pdf")
            src = outfile + "." + filetype
            if not os.path.isfile(src):
                tikz2image(code, filetype, outfile)
                sys.stderr.write("Created image " + src + "\n")
                # sleep(1)

            return Para([Image(["", [], []], [], [src, ""])])


if __name__ == "__main__":
    toJSONFilter(tikz)

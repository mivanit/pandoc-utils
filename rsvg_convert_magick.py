import argparse
import subprocess
import sys


class CustomArgumentParser(argparse.ArgumentParser):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, add_help=False, **kwargs)
        self.add_argument(
            "-?",
            "--help",
            action="help",
            default=argparse.SUPPRESS,
            help="Show this help message and exit.",
        )


def rsvg_convert():
    parser = CustomArgumentParser(
        description="SVG Converter mimicking `rsvg-convert` interface using ImageMagick"
    )
    parser.add_argument("files", nargs="*", help="Input SVG files")
    parser.add_argument(
        "-d",
        "--dpi-x",
        type=float,
        default=90,
        help="pixels per inch [optional; defaults to 90dpi]",
    )
    parser.add_argument(
        "-p",
        "--dpi-y",
        type=float,
        default=90,
        help="pixels per inch [optional; defaults to 90dpi]",
    )
    parser.add_argument(
        "-x",
        "--x-zoom",
        type=float,
        default=1.0,
        help="x zoom factor [optional; defaults to 1.0]",
    )
    parser.add_argument(
        "-y",
        "--y-zoom",
        type=float,
        default=1.0,
        help="y zoom factor [optional; defaults to 1.0]",
    )
    parser.add_argument(
        "-z",
        "--zoom",
        type=float,
        default=1.0,
        help="zoom factor [optional; defaults to 1.0]",
    )
    parser.add_argument(
        "-w", "--width", type=int, help="width [optional; defaults to the SVG's width]"
    )
    parser.add_argument(
        "-h",
        "--height",
        type=int,
        help="height [optional; defaults to the SVG's height]",
    )
    parser.add_argument(
        "-f",
        "--format",
        choices=["png", "pdf", "ps", "eps", "svg", "xml"],
        default="png",
        help="save format [optional; defaults to 'png']",
    )
    parser.add_argument(
        "-o", "--output", help="output filename [optional; defaults to stdout]"
    )
    parser.add_argument(
        "-b",
        "--background-color",
        help="set the background color [optional; defaults to None]",
    )

    args = parser.parse_args()

    for input_file in args.files:
        magick_command = ["magick", "convert"]

        # Set density (DPI)
        magick_command.extend(["-density", f"{args.dpi_x}x{args.dpi_y}"])

        # Set zoom
        zoom_x = args.x_zoom * args.zoom
        zoom_y = args.y_zoom * args.zoom
        if zoom_x != 1.0 or zoom_y != 1.0:
            magick_command.extend(["-resize", f"{zoom_x * 100}%x{zoom_y * 100}%"])

        # Set size
        if args.width or args.height:
            size = f"{args.width}x{args.height}"
            if not args.width:
                size = f"x{args.height}"
            elif not args.height:
                size = f"{args.width}x"
            magick_command.extend(["-size", size])

        # Set background color
        if args.background_color:
            magick_command.extend(["-background", args.background_color, "-flatten"])

        # Input file
        magick_command.append(input_file)

        # Output format and file
        if args.output:
            output_file = args.output
        else:
            output_file = f"-:{args.format}"

        magick_command.append(output_file)

        # Run the command
        try:
            subprocess.run(magick_command, check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error converting {input_file}: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    rsvg_convert()

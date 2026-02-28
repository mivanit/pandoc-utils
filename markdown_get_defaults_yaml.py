# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "pyyaml",
# ]
# ///

"""markdown_get_defaults_yaml.py

gets the "defaults" section from yaml front matter in a markdown file
and throws it into a file `_pandoc_defaults.yml`
"""

from typing import Any
import os
from pathlib import Path
import warnings

import yaml

FILTERS_DIR: str = str(Path(__file__).resolve().parent / "filters")


def get_front_matter(file: str) -> dict[str, Any]:
    """get the yaml front matter from a markdown file

    ### Parameters:
     - `file : str`
       file to read

    ### Returns:
     - `dict[str, Any]`
       yaml front matter

    ### Raises:
     - `ValueError` : if the file does not have yaml front matter in the expected format
    """
    with open(file, "r") as f:
        # split the document by yaml file front matter
        sections: list[str] = f.read().split("---")
        # check the zeroth section is empty
        if sections[0].strip():
            raise ValueError(
                f"file does not start with yaml front matter, found at start of file: {sections[0]}"
            )
        # get the first section and parse as yaml
        yaml_data: dict[str, Any] = yaml.safe_load(sections[1])
        if yaml_data is None:
            raise ValueError("file has empty yaml front matter")

    return yaml_data


def get_defaults(
    file: str,
    defaults_file: str = "_pandoc_defaults.yml",
    defaults_keys: tuple[str, ...] = ("__defaults__", "__pandoc__"),
    filters_dir: str = FILTERS_DIR,
) -> None:
    """gets 'defaults' section from yaml front matter and throws it into a file

    ### Parameters:
     - `file : str`
       file to read
     - `defaults_file : str`
       defaults file to write
       (default: `'_pandoc_defaults.yml'`)
     - `defaults_keys : tuple[str, ...]`
       keys in yaml front matter to get defaults from. if > 1 match, will throw exception
       (default: `'defaults'`)

    ### Returns:
     - `None`
    """

    # get the yaml front matter
    yaml_data: dict[str, Any] = get_front_matter(file)

    if sum([int(bool(x in yaml_data)) for x in defaults_keys]) > 1:
        raise KeyError(
            f"found too many keys: {defaults_keys = } {list(yaml_data.keys()) = }"
        )

    def_key_found: str | None = None
    for key in defaults_keys:
        if key in yaml_data:
            def_key_found = key
            break

    # get the defaults section, if it exists
    if def_key_found is not None:
        defaults_data: dict[str, Any] = yaml_data[def_key_found]

        # in filters section, replace `%FILTERS%` with appropriate dir
        for filter_key in ("filters", "filter"):
            if filter_key in defaults_data:
                defaults_data[filter_key] = [
                    x.replace(r"$FILTERS$", filters_dir)
                    for x in defaults_data[filter_key]
                ]

                # test that filters exist
                for x in defaults_data[filter_key]:
                    if not os.path.exists(x):
                        warnings.warn(f"  !!WARNING!!: could not find filter at {x}")

        # write the defaults to a file, if nonempty dict
        if defaults_data:
            with open(defaults_file, "w") as f:
                yaml.dump(
                    defaults_data,
                    f,
                )


if __name__ == "__main__":
    import argparse

    parser: argparse.ArgumentParser = argparse.ArgumentParser(
        description="Get defaults from markdown file front matter and write to a file"
    )

    parser.add_argument(
        "file",
        type=str,
        help="markdown file to read",
    )
    parser.add_argument(
        "--defaults-file",
        type=str,
        default="_pandoc_defaults.yml",
        help="defaults file to write (default: '_pandoc_defaults.yml')",
    )
    parser.add_argument(
        "--defaults-keys",
        type=str,
        nargs="+",
        default=("__defaults__", "__pandoc__"),
        help="keys in yaml front matter to get defaults from (default: '__defaults__', '__pandoc__')",
    )
    parser.add_argument(
        "--filters-dir",
        type=str,
        default=FILTERS_DIR,
        help=f"directory containing pandoc filters (default: '{FILTERS_DIR}')",
    )

    args: argparse.Namespace = parser.parse_args()

    get_defaults(
        args.file,
        defaults_file=args.defaults_file,
        defaults_keys=tuple(args.defaults_keys),
        filters_dir=args.filters_dir,
    )

# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "pandocfilters",
#     "pandas",
# ]
# ///

"""
pandoc filter to process code blocks with class "csvtable",
turning csv-formatted data into a table
"""

from typing import Any
from io import StringIO

import pandas as pd
from pandocfilters import toJSONFilter, get_caption


READ_KWARGS_DEFAULT: dict[str, Any] = {}


def _emptyblock() -> list:
    return ["", [], []]


def _plain_factory(val: str) -> dict:
    return {
        "t": "Plain",
        "c": [{"t": "Str", "c": val.strip()}],
    }


def _table_cell_factory(val: str) -> list:
    return [
        _emptyblock(),
        {"t": "AlignDefault"},
        1,
        1,
        [_plain_factory(val)],
    ]


def _table_row_factory(vals: list[str]) -> list:
    return [_emptyblock(), [_table_cell_factory(v) for v in vals]]


def _header_factory(vals: list[str]) -> list:
    return [_emptyblock(), [_table_row_factory(vals)]]


def _body_factory(rows: list[list[str]]) -> list:
    return [
        [
            _emptyblock(),
            0,
            [],
            [_table_row_factory(row) for row in rows],
        ]
    ]


def rawcsv_to_df(
    in_csv: str,
    read_kwargs: dict[str, Any] | None = None,
) -> pd.DataFrame:
    if read_kwargs is None:
        read_kwargs = READ_KWARGS_DEFAULT
    return pd.read_csv(StringIO(in_csv), **read_kwargs)


def csv_tex_table(
    key: str, value: Any, format: str, meta: Any
) -> dict[str, Any] | None:
    if key != "CodeBlock":
        return None

    [[ident, classes, keyvals], code] = value

    if "csvtable" not in classes:
        return None

    caption, typef, keyvals = get_caption(keyvals)
    df = rawcsv_to_df(code)

    n_cols = len(df.columns)
    colspecs = [[{"t": "AlignCenter"}, {"t": "ColWidthDefault"}]] * n_cols
    header = _header_factory([str(c) for c in df.columns])
    body = _body_factory([[str(v) for v in row] for row in df.values.tolist()])
    foot = [_emptyblock(), []]
    cap = [
        None,
        []
        if not caption
        else [_plain_factory(" ".join(s["c"] for s in caption if "c" in s))],
    ]

    return {
        "t": "Table",
        "c": [_emptyblock(), cap, colspecs, header, body, foot],
    }


if __name__ == "__main__":
    toJSONFilter(csv_tex_table)

"""
pandoc filter to process code blocks with class "csvtable",
turning csv-formatted data into a table
"""

from typing import *
from io import StringIO

import pandas as pd
from pandocfilters import toJSONFilter, Plain, get_caption, Table


READ_KWARGS_DEFAULT: Dict[str, Any] = {}

WRITE_KWARGS_DEFAULT: Dict[str, Any] = {
    "index": False,
}


# TODO: just use panflute
# http://scorreia.com/software/panflute/guide.html#more-complex-filters

# also, read this page
# https://johnlekberg.com/blog/2020-11-27-cli-pandoc.html


def rawcsv_to_df(
    in_csv: str,
    read_kwargs: Dict[str, Any] = READ_KWARGS_DEFAULT,
    write_kwargs: Dict[str, Any] = WRITE_KWARGS_DEFAULT,
) -> pd.DataFrame:
    data_stream: StringIO = StringIO(in_csv)
    data: pd.DataFrame = pd.read_csv(data_stream, *read_kwargs)

    return data


def csv_tex_table(key, value, format, meta):
    if key == "CodeBlock":
        [[ident, classes, keyvals], code] = value

        df = pd.DataFrame = rawcsv_to_df(code)

        if "csvtable" in set(classes):
            caption, typef, keyvals = get_caption(keyvals)

            return Table(
                [
                    [],
                    Plain(caption),
                    [{"t": "AlignCenter"}, {"t": "ColWidthDefault"}] * len(df.cols),  # TODO: df.cols is not a valid attribute (should be df.columns), WIP
                ]
            )

        """
        return Plain(['test'])
        
        # if codeblock has class ".csvtable"
        if "csvtable" in classes:
            # TODO: get any settings
            # for nameval in keyvals:
            #     if 'w_index' in nameval:
            #         {'index' : False}

            return { key : [[ident, classes, keyvals], code] }

            # print(code)
            
            # content : str = rawcsv_to_latextable(
            #     code,
            # )
            # return {'CodeBlock': [[ident, classes, keyvals], content]}
        """


if __name__ == "__main__":
    toJSONFilter(csv_tex_table)

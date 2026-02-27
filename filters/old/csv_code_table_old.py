# from https://johnlekberg.com/blog/2020-11-27-cli-pandoc.html

from copy import copy
import csv
import io
import json
import sys


def MAIN():
    data = json.load(sys.stdin)
    data = pandoc_map(CodeBlock_to_Table, data)
    json.dump(data, sys.stdout)


def pandoc_map(func, data):
    """Map a function over a Pandoc document. Returns a
    copy of the modified document.

    func -- callable. A function to transform parts of a
        Pandoc document.
    data -- dict. A Pandoc document, read from json.load.
    """
    assert callable(func)
    assert isinstance(data, dict)
    assert "blocks" in data

    def can_walk(x):
        """Return if a part of the document tree is
        walkable (True/False).
        """
        return (
            ("c" in x)
            and isinstance(x["c"], list)
            and all(isinstance(y, dict) for y in x["c"])
        )

    def walk(x):
        """Recursively apply func throughout the document
        tree.
        """
        y = func(x)
        if can_walk(y):
            y = copy(y)
            y["c"] = [walk(z) for z in y["c"]]
        return y

    result = copy(data)
    result["blocks"] = [walk(x) for x in result["blocks"]]

    assert isinstance(result, dict)
    assert "blocks" in result

    return result


def CodeBlock_to_Table(x):
    """Turn CodeBlock elements marked with "csv" into Table
    element. Meant to be used by pandoc_map.
    """
    if x["t"] == "CodeBlock":
        infostring = x["c"][0][1]
        if "csv" in infostring:
            text = x["c"][1]
            reader = csv.reader(io.StringIO(text))
            data_header = next(reader)
            data_rows = list(reader)
            n_columns = len(data_header)
            assert all(len(row) == n_columns for row in data_rows)
            Plain_Str = lambda x: {
                "t": "Plain",
                "c": [{"t": "Str", "c": x}],
            }
            result = {
                "t": "Table",
                "c": [
                    ["", [], []],
                    [None, []],
                    [{"t": "AlignDefault"}] * n_columns,
                    [0] * n_columns,
                    [[Plain_Str(column)] for column in data_header],
                    [[[Plain_Str(cell.strip())] for cell in row] for row in data_rows],
                ],
            }
            return result
    return x


if __name__ == "__main__":
    MAIN()

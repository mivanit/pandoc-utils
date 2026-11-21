"""Each model goes on from the words on standard input. The page runs this."""

import json
import re
import sys

from model import NGram

ORDERS: list[int] = [1, 2, 3, 4]
K: float = 0.01  # the smoothing constant
LENGTH: int = 14  # words each model adds

train: list[str] = open("generated/train.txt").read().split()
prompt: list[str] = re.findall(r"[a-z]+(?:[-'][a-z]+)*|\.", sys.stdin.read().lower())
rows: list[dict] = [
    {"label": f"order {n}", "tokens": NGram(n, K, train).continuation(prompt, LENGTH)}
    for n in ORDERS
]
print(json.dumps({"prompt": prompt, "rows": rows}))

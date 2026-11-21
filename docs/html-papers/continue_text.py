"""Each model goes on from the words on standard input. The page runs this."""

import json
import sys

from model import NGram
from settings import CONTINUE, K, ORDERS, tokenize

train: list[str] = open("generated/train.txt").read().split()
prompt: list[str] = tokenize(sys.stdin.read())
rows: list[dict] = [
    {"label": f"order {n}", "tokens": NGram(n, K, train).continuation(prompt, CONTINUE)}
    for n in ORDERS
]
print(json.dumps({"prompt": prompt, "rows": rows}))

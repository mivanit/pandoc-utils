"""The loss of each model on the sentence on standard input."""

import math
import sys

from model import NGram
from settings import K, ORDERS, tokenize

train: list[str] = open("generated/train.txt").read().split()
sentence: list[str] = tokenize(sys.stdin.read())
if not sentence:
    sys.exit("Type a sentence first.")
print(f"{len(sentence)} words, the full stop included")
for order in ORDERS:
    model = NGram(order, K, train)
    print(f"order {order}:  {model.loss(sentence):5.2f} bits per word")
print(f"guessing: {math.log2(len(model.vocabulary)):5.2f} bits per word")

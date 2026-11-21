"""The loss of each model on the sentence on standard input."""

import math
import re
import sys

from model import NGram

train: list[str] = open("generated/train.txt").read().split()
sentence: list[str] = re.findall(r"[a-z]+(?:[-'][a-z]+)*|\.", sys.stdin.read().lower())
if not sentence:
    sys.exit("Type a sentence first.")
print(f"{len(sentence)} words, the full stop included")
for order in [1, 2, 3, 4]:
    model = NGram(order, 0.01, train)
    print(f"order {order}:  {model.loss(sentence):5.2f} bits per word")
print(f"guessing: {math.log2(len(model.vocabulary)):5.2f} bits per word")

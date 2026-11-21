"""How often each word is used, against its rank. Drawn in the page, with matplotlib."""

from collections import Counter

import matplotlib.pyplot as plt

words: list[str] = [w for w in open("generated/train.txt").read().split() if w != "."]
used: Counter[str] = Counter(words)
counts: list[int] = sorted(used.values(), reverse=True)

plt.figure(figsize=(5, 3.2))
plt.loglog(range(1, len(counts) + 1), counts, ".", color="#3b5a8c")
plt.xlabel("rank of the word")
plt.ylabel("times used")
plt.title(f"{len(counts)} different words")
print("The ten most used:", ", ".join(word for word, _ in used.most_common(10)))

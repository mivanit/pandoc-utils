"""An n-gram word model with add-k smoothing. This is the whole model."""

import math
from collections import Counter

START: str = "<s>"  # stands in for the words before the first one
UNKNOWN: str = "<unk>"  # stands in for any word the model never counted

Gram = tuple[str, ...]  # a context and the word after it


class NGram:
    """Predicts each word from the `order - 1` words before it, by counting."""

    def __init__(self, order: int, k: float, words: list[str]) -> None:
        self.order: int = order
        self.k: float = k
        self.vocabulary: set[str] = set(words) | {UNKNOWN}
        self.count: Counter[Gram] = Counter()  # context and word -> times seen
        self.context: Counter[Gram] = Counter()  # context -> times seen
        for gram in self.grams(words):
            self.count[gram] += 1
            self.context[gram[:-1]] += 1

    def grams(self, words: list[str]) -> list[Gram]:
        """Each word with the words before it; words never counted become UNKNOWN."""
        known: list[str] = [w if w in self.vocabulary else UNKNOWN for w in words]
        padded: list[str] = [START] * (self.order - 1) + known
        return [tuple(padded[i : i + self.order]) for i in range(len(words))]

    def probability(self, gram: Gram) -> float:
        """Add-k smoothing: every word is counted k more times than it was seen."""
        seen: float = self.count[gram] + self.k
        return seen / (self.context[gram[:-1]] + self.k * len(self.vocabulary))

    def loss(self, words: list[str]) -> float:
        """Cross-entropy in bits per word: lower is a better prediction."""
        bits: float = sum(math.log2(self.probability(g)) for g in self.grams(words))
        return -bits / len(words)

    def continuation(self, prompt: list[str], length: int) -> list[str]:
        """The likeliest next word (ties: first in the alphabet), up to `length` times.

        Stops early when the last `order - 1` words were never seen together.
        """
        words: list[str] = list(prompt)
        for _ in range(length):
            context: Gram = self.grams(words + [UNKNOWN])[-1][:-1]
            if self.order > 1 and self.context[context] == 0:
                break
            options: list[str] = sorted(self.vocabulary - {UNKNOWN})
            words.append(max(options, key=lambda w: self.count[context + (w,)]))
        return words[len(prompt) :]

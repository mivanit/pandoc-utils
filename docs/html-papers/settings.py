"""Tokenization and model settings shared by the build and the runnable examples."""

import re

ORDERS: list[int] = [1, 2, 3, 4]
K: float = 0.01
CONTINUE: int = 14
END: str = "."


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z]+(?:[-'][a-z]+)*|\.", text.lower())

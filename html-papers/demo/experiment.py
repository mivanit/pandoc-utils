"""The paper's experiment: n-gram models of the paper's own text.

build.sh runs this before pandoc. It reads paper.md and writes everything the paper shows
about its results: the table (generated/results.md), the continuations
(generated/continuations.json), the figures (figures/*.svg) and the numbers behind the live
figures (live/data.js). Standard library only, and no randomness: the same paper.md always
gives the same files.
"""

import json
import math
import re
from collections import Counter
from pathlib import Path

from model import NGram
from svgplot import Chart, Series

HERE: Path = Path(__file__).parent
ORDERS: list[int] = [1, 2, 3, 4]
K: float = 0.01  # the smoothing constant of the table and the first figure
KS: list[float] = [0.0001, 0.0003, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0]
HELD_OUT_EVERY: int = 5  # every fifth sentence is held out
CONTINUE: int = 14  # words each model adds to the prompt


def words_of(markdown: str) -> list[str]:
    """The paper's prose as lowercase words, with "." for the end of a sentence.

    Markup goes: the front matter, code, math, citations, attributes and link targets. A
    term keeps the words it shows.
    """
    text: str = markdown.split("\n---\n", 1)[1]
    text = re.sub(r"```.*?```|\$\$.*?\$\$", " ", text, flags=re.DOTALL)
    text = re.sub(r"`[^`\n]*`|\$[^$\n]*\$", " ", text)
    text = re.sub(r"\\term\[([^\]]*)\]\{[^}]*\}|\\term\{([^}]*)\}", r"\1\2", text)
    text = re.sub(r"\\[A-Za-z]+(\{[^}]*\})?|\[\^?@?[^\]]*\]:?|\]\([^)]*\)", " ", text)
    text = re.sub(r"\{[^}]*\}|https?://\S+", " ", text)
    return re.findall(r"[a-z]+(?:[-'][a-z]+)*|\.", text.lower())


def split(words: list[str]) -> tuple[list[str], list[str]]:
    """Training text and held-out text: every fifth sentence goes to the second."""
    sentences: list[list[str]] = [[]]
    for word in words:
        sentences[-1].append(word)
        if word == ".":
            sentences.append([])
    train: list[str] = []
    held_out: list[str] = []
    for i, sentence in enumerate(sentences):
        (held_out if i % HELD_OUT_EVERY == HELD_OUT_EVERY - 1 else train).extend(
            sentence
        )
    return train, held_out


def seen_share(model: NGram, words: list[str]) -> float:
    """The share of `words` whose context the model counted at least once."""
    grams = model.grams(words)
    return sum(model.context[g[:-1]] > 0 for g in grams) / len(grams)


def common_phrase(words: list[str], length: int) -> list[str]:
    """The most frequent run of `length` words within a sentence (ties: alphabetical)."""
    runs: Counter[tuple[str, ...]] = Counter(
        tuple(words[i : i + length]) for i in range(len(words) - length + 1)
    )
    best = max(sorted(runs), key=lambda run: (("." not in run), runs[run]))
    return list(best)


def main() -> None:
    words: list[str] = words_of((HERE / "paper.md").read_text())
    train, held_out = split(words)
    for folder in ("generated", "figures", "live"):
        (HERE / folder).mkdir(exist_ok=True)

    # every model at every smoothing constant: {k: {order: (training loss, held-out loss)}}
    losses: dict[float, dict[int, tuple[float, float]]] = {}
    for k in KS:
        losses[k] = {}
        for order in ORDERS:
            model = NGram(order, k, train)
            losses[k][order] = (model.loss(train), model.loss(held_out))
    models: dict[int, NGram] = {order: NGram(order, K, train) for order in ORDERS}
    vocabulary: int = len(models[1].vocabulary)
    uniform: float = math.log2(vocabulary)  # the loss of guessing every word equally

    # What the prose of the Results section says. The text is the data, so an edit can make
    # a sentence there false: then the build stops here instead of printing it.
    at_k = losses[K]
    train_loss: list[float] = [at_k[n][0] for n in ORDERS]
    held_loss: list[float] = [at_k[n][1] for n in ORDERS]
    assert train_loss == sorted(train_loss, reverse=True), (
        "training: higher order is better"
    )
    assert held_loss[1] == min(held_loss), "held-out: order 2 is the best"
    assert held_loss[1:] == sorted(held_loss[1:]), (
        "held-out: worse with each order after 2"
    )
    assert uniform - 0.5 < held_loss[-1] < uniform, (
        "held-out: order 4 barely beats guessing"
    )
    by_k: dict[int, list[tuple[float, float]]] = {
        n: [losses[k][n] for k in KS] for n in ORDERS
    }
    assert all(
        [t for t, _ in by_k[n]] == sorted(t for t, _ in by_k[n]) for n in ORDERS
    ), "training: less smoothing is always better"
    assert by_k[ORDERS[-1]][0][0] < 0.5, (
        "training: order 4 memorises with little smoothing"
    )
    assert all(min(h for _, h in by_k[n]) < by_k[n][0][1] for n in ORDERS), (
        "held-out: the least smoothing is never the best"
    )
    spread: list[float] = [
        max(h for _, h in by_k[n]) - min(h for _, h in by_k[n]) for n in ORDERS[1:]
    ]
    assert spread == sorted(spread, reverse=True), (
        "held-out: k matters less as order rises"
    )

    # the table: markdown, included by paper.md
    rows: list[str] = [
        "| order | training text | held-out text | contexts seen in training |",
        "|:--|--:|--:|--:|",
        f"| **words** | {len(train):,} | {len(held_out):,} | |",
    ]
    for order in ORDERS:
        note: str = "[^guessing]" if order == ORDERS[-1] else ""
        rows.append(
            f"| {order} | {at_k[order][0]:.2f} | {at_k[order][1]:.2f}{note}"
            f" | {seen_share(models[order], held_out):.0%} |"
        )
    rows.append(
        f"\n: \\term[Loss]{{loss}} in bits per word of each \\term{{ngram}} on the two texts,"
        f" with \\term{{smoothing}} $k = {K:g}$ and a vocabulary of {vocabulary:,} words."
        " The last column is the share of held-out words whose context the model had"
        " counted. \\label{tab:loss}\n\n"
        "[^guessing]: Hardly better than guessing every word equally, which costs"
        f" {uniform:.2f} bits.\n"
    )
    (HERE / "generated" / "results.md").write_text("\n".join(rows))

    # the continuations: each model continues the same prompt; the paper itself is the reference
    prompt: list[str] = common_phrase(train, ORDERS[-1] - 1)
    start: int = next(
        i for i in range(len(train)) if train[i : i + len(prompt)] == prompt
    )
    paper: list[str] = train[start + len(prompt) : start + len(prompt) + CONTINUE]
    token_rows: list[dict] = [
        {"label": "the paper", "tokens": paper, "end": "cut", "reference": True}
    ]
    for order in ORDERS:
        said: list[str] = models[order].continuation(prompt, CONTINUE)
        token_rows.append(
            {
                "label": f"order {order}",
                "tokens": said,
                **({"end": "cut"} if len(said) == CONTINUE else {}),
            }
        )
    assert len(set(token_rows[1]["tokens"])) == 1, "order 1 repeats one word"
    (HERE / "generated" / "continuations.json").write_text(
        json.dumps({"prompt": prompt, "rows": token_rows}, indent=1) + "\n"
    )

    # figure: loss by order at K
    top: int = math.ceil(
        max(max(pair) for by in losses.values() for pair in by.values())
    )
    Chart(
        xlabel="order (words of context + 1)",
        ylabel="loss (bits per word)",
        xticks=[float(n) for n in ORDERS],
        yticks=[float(v) for v in range(0, top + 1, 2)],
        key="bottom left",
        series=[
            Series("training text", [(n, at_k[n][0]) for n in ORDERS]),
            Series("held-out text", [(n, at_k[n][1]) for n in ORDERS]),
            Series(
                "guessing equally",
                [(ORDERS[0], uniform), (ORDERS[-1], uniform)],
                dashed=True,
                markers=False,
                color="#888888",
            ),
        ],
    ).write(HERE / "figures" / "loss-by-order.svg")

    # subfigures: loss against the smoothing constant, a line per order, on each text
    for which, name in enumerate(("train", "heldout")):
        Chart(
            xlabel="smoothing constant k",
            ylabel="loss (bits per word)",
            xticks=[0.0001, 0.001, 0.01, 0.1, 1.0, 10.0],
            yticks=[float(v) for v in range(0, top + 1, 2)],
            xlog=True,
            width=420,
            height=300,
            key="bottom right",
            series=[
                Series(f"order {n}", [(k, losses[k][n][which]) for k in KS])
                for n in ORDERS
            ],
        ).write(HERE / "figures" / f"smoothing-{name}.svg")

    # figure: how often each word is used, against its rank
    counts: list[tuple[str, int]] = sorted(
        Counter(w for w in words if w != ".").items(), key=lambda c: (-c[1], c[0])
    )
    decades: int = math.ceil(math.log10(len(counts)))
    Chart(
        xlabel="rank of the word (1 = most used)",
        ylabel="times used",
        xticks=[10.0**d for d in range(decades + 1)],
        yticks=[10.0**d for d in range(math.ceil(math.log10(counts[0][1])) + 1)],
        xlog=True,
        ylog=True,
        series=[
            Series(
                "each word of the paper",
                [(rank, n) for rank, (_, n) in enumerate(counts, start=1)],
                line=False,
            ),
            Series(
                "count = top count / rank",
                [(1, counts[0][1]), (counts[0][1], 1)],
                dashed=True,
                markers=False,
                color="#888888",
            ),
        ],
    ).write(HERE / "figures" / "words.svg")

    # the same numbers for the live pages (a script, so they also load from file://)
    data: dict = {
        "orders": ORDERS,
        "ks": KS,
        "k": K,
        "uniform": uniform,
        "top": top,
        "losses": [[list(losses[k][n]) for n in ORDERS] for k in KS],
        "words": counts,
    }
    (HERE / "live" / "data.js").write_text(
        "// written by experiment.py\nwindow.PAPER_DATA = " + json.dumps(data) + ";\n"
    )
    print(
        f"experiment: {len(train):,} training words, {len(held_out):,} held out,"
        f" vocabulary {vocabulary:,}; prompt: {' '.join(prompt)}"
    )


if __name__ == "__main__":
    main()

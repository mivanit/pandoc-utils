"""The paper's experiment: n-gram models of the paper's own text.

build.sh runs this before pandoc. It reads paper.md and terms.yaml, checks what the paper
says about the results, and only then writes what the paper shows of them: the table
(generated/results.md), the continuations (generated/continuations.json), the figures
(figures/*.svg), the numbers behind the live figures (live/data.js) and the training text
for the code a reader runs in the page (generated/train.txt). Standard library
only, and no randomness: the same paper.md always gives the same files.
"""

import json
import math
import re
from collections import Counter
from pathlib import Path

from model import NGram
from svgplot import Chart, Series, write

HERE: Path = Path(__file__).parent
ORDERS: list[int] = [1, 2, 3, 4]
K: float = 0.01  # the smoothing constant of the table and the first figure
KS: list[float] = [0.0001, 0.0003, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0]
HELD_OUT_EVERY: int = 5  # every fifth sentence is held out
CONTINUE: int = 14  # words each model adds to the prompt
END: str = "."  # the end of a sentence, counted as a word


def term_texts(yaml: str) -> dict[str, str]:
    """Each term's name and the words it shows, from terms.yaml."""
    return dict(re.findall(r"^  (\w+):\n    text: (.+)$", yaml, flags=re.MULTILINE))


def words_of(markdown: str, terms: dict[str, str]) -> list[str]:
    """The paper's prose as lowercase words, with END for the end of a sentence.

    Out go the front matter, code, equations, citations, footnote marks, attributes, and the
    addresses of links and images. A caption or a link keeps its words, and a term the words
    it shows.
    """
    if not markdown.startswith("---\n") or "\n---\n" not in markdown:
        raise SystemExit("experiment: paper.md has no front matter to leave out")
    text: str = markdown.split("\n---\n", 1)[1]
    text = re.sub(r"```.*?```|\$\$.*?\$\$", " ", text, flags=re.DOTALL)  # blocks
    text = re.sub(r"`[^`\n]*`|\$[^$\n]*\$", " ", text)  # inline code and math
    text = re.sub(r"!?\[([^\]\[]*)\]\([^)]*\)", r"\1", text)  # link, image: its words
    text = re.sub(r"\[[\^@][^\]]*\]:?", " ", text)  # citations, footnote marks
    text = re.sub(r"\\term\[([^\]]*)\]\{[^}]*\}", r"\1", text)
    text = re.sub(r"\\term\{([^}]*)\}", lambda m: terms[m[1]], text)
    text = re.sub(r"\\[A-Za-z]+(\{[^}]*\})?|\{[^}]*\}|https?://\S+", " ", text)
    return re.findall(r"[a-z]+(?:[-'][a-z]+)*|\.", text.lower())


def split(words: list[str]) -> tuple[list[str], list[str]]:
    """Training text and held-out text: every fifth sentence goes to the second."""
    sentences: list[list[str]] = [[]]
    for word in words:
        sentences[-1].append(word)
        if word == END:
            sentences.append([])
    train: list[str] = []
    held_out: list[str] = []
    for i, sentence in enumerate(sentences):
        (held_out if i % HELD_OUT_EVERY == HELD_OUT_EVERY - 1 else train).extend(
            sentence
        )
    if not train or not held_out:
        raise SystemExit(
            f"experiment: paper.md needs at least {HELD_OUT_EVERY} sentences"
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
    best = max(sorted(runs), key=lambda run: ((END not in run), runs[run]))
    return list(best)


def main() -> None:
    terms: dict[str, str] = term_texts((HERE / "terms.yaml").read_text())
    words: list[str] = words_of((HERE / "paper.md").read_text(), terms)
    train, held_out = split(words)

    # ------------------------------------------------------------------ the results
    # every model at every smoothing constant: {k: {order: (training loss, held-out loss)}}
    losses: dict[float, dict[int, tuple[float, float]]] = {}
    for k in KS:
        losses[k] = {}
        for order in ORDERS:
            model = NGram(order, k, train)
            losses[k][order] = (model.loss(train), model.loss(held_out))
    models: dict[int, NGram] = {order: NGram(order, K, train) for order in ORDERS}
    vocabulary: int = len(models[1].vocabulary)  # with END and the unknown word
    uniform: float = math.log2(vocabulary)  # the loss of guessing every word equally
    seen: list[float] = [seen_share(models[n], held_out) for n in ORDERS]

    # each model continues the same prompt; the paper itself is the first row
    prompt: list[str] = common_phrase(train, ORDERS[-1] - 1)
    start: int = next(
        i for i in range(len(words)) if words[i : i + len(prompt)] == prompt
    )
    paper: list[str] = words[start + len(prompt) : start + len(prompt) + CONTINUE]
    said: dict[int, list[str]] = {
        n: models[n].continuation(prompt, CONTINUE) for n in ORDERS
    }

    # how often each word is used, most used first
    counts: list[tuple[str, int]] = sorted(
        Counter(w for w in words if w != END).items(), key=lambda c: (-c[1], c[0])
    )

    # ------------------------------------------------------------------ the claims
    # What the prose of the Results section says, in its order. The text is the data, so an
    # edit can make a sentence there false: then the build stops here, before anything is
    # written, instead of printing it.
    at_k = losses[K]
    train_loss: list[float] = [at_k[n][0] for n in ORDERS]
    held_loss: list[float] = [at_k[n][1] for n in ORDERS]
    by_k: dict[int, list[tuple[float, float]]] = {
        n: [losses[k][n] for k in KS] for n in ORDERS
    }
    best_order: set[int] = {
        min(ORDERS, key=lambda n: losses[k][n][1]) for k in KS
    }  # the best order on the held-out text, at each constant
    spread: list[float] = [
        max(h for _, h in by_k[n]) - min(h for _, h in by_k[n]) for n in ORDERS[1:]
    ]
    rare: int = sum(n <= 2 for _, n in counts)
    # Loss by order, at the table's constant
    assert train_loss == sorted(train_loss, reverse=True), (
        "training: higher order is better"
    )
    assert held_loss[1] == min(held_loss), "held-out: order 2 is the best"
    assert held_loss[1:] == sorted(held_loss[1:]), (
        "held-out: worse with each order after 2"
    )
    assert uniform - 1 < held_loss[-1] < uniform, (
        "held-out: order 4 is less than one bit better than guessing"
    )
    assert seen == sorted(seen, reverse=True), "held-out: longer contexts are seen less"
    assert len(best_order) > 1, "held-out: which order is best depends on the constant"
    # Smoothing
    assert all(
        [t for t, _ in by_k[n]] == sorted(t for t, _ in by_k[n]) for n in ORDERS
    ), "training: less smoothing is always better"
    assert by_k[ORDERS[-1]][0][0] < 0.5, (
        "training: order 4 memorises with little smoothing"
    )
    assert all(min(h for _, h in by_k[n]) < by_k[n][0][1] for n in ORDERS), (
        "held-out: the least smoothing is never the best"
    )
    assert spread == sorted(spread, reverse=True), (
        "held-out: from order 2 up, the constant matters less as the order rises"
    )
    # What the models write
    assert len(set(said[1])) == 1, "order 1 repeats one word"
    # The words
    assert 2 * rare > len(counts), "most words are used once or twice"
    assert 5 * sum(n for _, n in counts[:10]) > len(words), (
        "ten words are a fifth of the text"
    )

    # ------------------------------------------------------------------ what the paper shows
    for folder in ("generated", "figures", "live"):
        (HERE / folder).mkdir(exist_ok=True)

    # the table: markdown, included by paper.md
    rows: list[str] = [
        "| order | training text | held-out text | contexts seen in training |",
        "|:--|--:|--:|--:|",
        f"| **words** | {len(train):,} | {len(held_out):,} | |",
    ]
    for order, share in zip(ORDERS, seen):
        note: str = "[^guessing]" if order == ORDERS[-1] else ""
        rows.append(
            f"| {order} | {at_k[order][0]:.2f} | {at_k[order][1]:.2f}{note}"
            f" | {share:.0%} |"
        )
    rows.append(
        f"\n: \\term[Loss]{{loss}} in bits per word of each \\term{{ngram}} on the two texts,"
        f" with \\term{{smoothing}} $k = {K:g}$. The models know {vocabulary - 2:,} different"
        " words. The last column is the share of held-out words whose context the model had"
        " counted. \\label{tab:loss}\n\n"
        f"[^guessing]: Hardly better than guessing equally among the {vocabulary:,} things a"
        " model can predict (its words, the end of a sentence and a stand-in for any other"
        f" word), which costs {uniform:.2f} bits.\n"
    )
    write(HERE / "generated" / "results.md", "\n".join(rows))

    # the training text, a sentence on each line: what the code run in the page fits its models to
    write(
        HERE / "generated" / "train.txt",
        " ".join(train).replace(f" {END} ", f" {END}\n") + "\n",
    )

    # the continuations: rows of tokens, drawn by html-papers.lua
    token_rows: list[dict] = [
        {"label": "the paper", "tokens": paper, "end": "cut", "reference": True}
    ]
    for order in ORDERS:
        token_rows.append(
            {
                "label": f"order {order}",
                "tokens": said[order],
                **({"end": "cut"} if len(said[order]) == CONTINUE else {}),
            }
        )
    write(
        HERE / "generated" / "continuations.json",
        json.dumps({"prompt": prompt, "rows": token_rows}, indent=1) + "\n",
    )

    # figure: loss by order at K. The axis ends on a tick above every loss in the sweep, so
    # the live figure can share it.
    top: int = 2 * math.ceil(
        max(max(pair) for by in losses.values() for pair in by.values()) / 2
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
    Chart(
        xlabel="rank of the word (1 = most used)",
        ylabel="times used",
        xticks=[10.0**d for d in range(math.ceil(math.log10(len(counts))) + 1)],
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

    # the same numbers for the live pages (a script, so they also load from file://), rounded
    # so that the file does not depend on how this Python adds floats
    data: dict = {
        "orders": ORDERS,
        "ks": KS,
        "k": K,
        "uniform": round(uniform, 4),
        "top": top,
        "losses": [[[round(v, 4) for v in losses[k][n]] for n in ORDERS] for k in KS],
        "words": counts,
    }
    write(
        HERE / "live" / "data.js",
        "// written by experiment.py\nwindow.PAPER_DATA = " + json.dumps(data) + ";\n",
    )
    print(
        f"experiment: {len(train):,} training words, {len(held_out):,} held out,"
        f" {vocabulary - 2:,} different; prompt: {' '.join(prompt)}"
    )


if __name__ == "__main__":
    main()

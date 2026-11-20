| order | training text | held-out text | contexts seen in training |
|:--|--:|--:|--:|
| **words** | 2,037 | 461 | |
| 1 | 7.02 | 8.19 | 100% |
| 2 | 3.69 | 7.59 | 86% |
| 3 | 2.60 | 8.08 | 43% |
| 4 | 2.41 | 8.45[^guessing] | 15% |

: \term[Loss]{loss} in bits per word of each \term{ngram} on the two texts, with \term{smoothing} $k = 0.01$. The models know 437 different words. The last column is the share of held-out words whose context the model had counted. \label{tab:loss}

[^guessing]: Hardly better than guessing equally among the 439 things a model can predict (its words, the end of a sentence and a stand-in for any other word), which costs 8.78 bits.

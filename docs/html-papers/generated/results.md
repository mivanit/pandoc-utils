| order | training text | held-out text | contexts seen in training |
|:--|--:|--:|--:|
| **words** | 2,060 | 496 | |
| 1 | 7.03 | 8.16 | 100% |
| 2 | 3.70 | 7.47 | 86% |
| 3 | 2.61 | 8.00 | 45% |
| 4 | 2.43 | 8.45[^guessing] | 17% |

: \term[Loss]{loss} in bits per word of each \term{ngram} on the two texts, with \term{smoothing} $k = 0.01$. The models know 441 different words. The last column is the share of held-out words whose context the model had counted. \label{tab:loss}

[^guessing]: Hardly better than guessing equally among the 443 things a model can predict (its words, the end of a sentence and a stand-in for any other word), which costs 8.79 bits.

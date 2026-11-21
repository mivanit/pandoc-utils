| order | training text | held-out text | contexts seen in training |
|:--|--:|--:|--:|
| **words** | 2,384 | 576 | |
| 1 | 7.06 | 7.75 | 100% |
| 2 | 3.78 | 7.18 | 91% |
| 3 | 2.72 | 7.94 | 50% |
| 4 | 2.52 | 8.46[^guessing] | 20% |

: \term[Loss]{loss} in bits per word of each \term{ngram} on the two texts, with \term{smoothing} $k = 0.01$. The models know 473 different words. The last column is the share of held-out words whose context the model had counted. \label{tab:loss}

[^guessing]: Hardly better than guessing equally among the 475 things a model can predict (its words, the end of a sentence and a stand-in for any other word), which costs 8.89 bits.

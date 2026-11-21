| order | training text | held-out text | contexts seen in training |
|:--|--:|--:|--:|
| **words** | 2,378 | 562 | |
| 1 | 7.05 | 7.82 | 100% |
| 2 | 3.78 | 7.17 | 90% |
| 3 | 2.72 | 7.85 | 50% |
| 4 | 2.51 | 8.39[^guessing] | 21% |

: \term[Loss]{loss} in bits per word of each \term{ngram} on the two texts, with \term{smoothing} $k = 0.01$. The models know 472 different words. The last column is the share of held-out words whose context the model had counted. \label{tab:loss}

[^guessing]: Hardly better than guessing equally among the 474 things a model can predict (its words, the end of a sentence and a stand-in for any other word), which costs 8.89 bits.

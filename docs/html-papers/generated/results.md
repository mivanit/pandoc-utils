| order | training text | held-out text | contexts seen in training |
|:--|--:|--:|--:|
| **words** | 1,770 | 444 | |
| 1 | 7.08 | 7.82 | 100% |
| 2 | 3.64 | 7.33 | 89% |
| 3 | 2.55 | 8.12 | 47% |
| 4 | 2.39 | 8.50[^guessing] | 14% |

: \term[Loss]{loss} in bits per word of each \term{ngram} on the two texts, with \term{smoothing} $k = 0.01$ and a vocabulary of 426 words. The last column is the share of held-out words whose context the model had counted. \label{tab:loss}

[^guessing]: Hardly better than guessing every word equally, which costs 8.73 bits.

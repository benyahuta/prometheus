# prometheus

An interactive website that explains how large language models work, inspired by [3Blue1Brown's transformer series](https://www.youtube.com/watch?v=wjZofJX0v4M).

Site: https://benyahuta.github.io/prometheus/

There are six chapters: tokenization, embeddings, attention, depth, next-token prediction, and an animated inference loop. Each one links to a deeper page with more of the actual math, like a working BPE tokenizer, the full attention computation, and the KV cache.

The visualizations are simplified, but they're accurate.

## Running it

It's plain HTML/CSS/JS with no build step. Open `index.html`, or run:

```sh
python3 -m http.server 8642
```

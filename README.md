# Inside the Transformer

An interactive, beginner-friendly website that explains how large language
models work — inspired by [3Blue1Brown's transformer series](https://www.youtube.com/watch?v=wjZofJX0v4M).

The landing page walks through the whole pipeline in six interactive chapters —
tokenization, embeddings, attention, depth, next-token prediction, and a live
animated inference loop. Each chapter links to a deep-dive page with the real
machinery: a running BPE trainer, the embedding matrix and positional
encodings, the full Q/K/V attention computation with a causal-mask toggle,
residual streams and MLPs, an interactive softmax with sampling strategies,
and the KV cache.

## Running

No build step, no dependencies — it's plain HTML/CSS/JS:

```sh
python3 -m http.server 8642
# then open http://localhost:8642/
```

or just open `index.html` in a browser.

## Structure

```
index.html          the six-chapter overview
chapters/           one deep-dive page per chapter
css/style.css       shared design system (Manim-inspired palette)
js/app.js           landing-page interactions
js/deep.js          shared helpers for the deep-dive pages
```

All visualizations are simplified, but honest.

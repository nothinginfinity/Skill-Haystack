# Skill-Haystack

> **Nail it before you scale it.**

A focused LLM benchmark that asks one atomic question:

**Can a model find and execute a single skill buried inside a document of noise?**

Before benchmarking routing fidelity across 200 skills, we need to know if the model can reliably detect and emit the correct token for *one* skill when it's surrounded by irrelevant content. This repo isolates and perfects that single primitive.

---

## The Concept

Inspired by the "needle in a haystack" eval pattern from LLM research, Skill-Haystack works like this:

1. Take **one skill** with one deterministic token
2. Bury that skill's trigger phrase inside a document full of random noise words
3. Ask the LLM to find and execute it — i.e., emit the correct `BENCH-{id}::{token}` output
4. Run that same trial **20–30 times** and measure the pass rate

That's your baseline. One skill. One haystack. One success rate.

---

## Why This First

The full [skill-bench.md](https://github.com/nothinginfinity/skill-bench.md) project tests routing fidelity across 200 skills at once. When it fails, you don't know *why*. Is it the token format? Competing skill bodies? Noise in the manifest? The haystack approach isolates the hardest atomic question first.

---

## Scaling Path

| Stage | Config | Question |
|-------|--------|----------|
| 1 | 1 skill, 200 noise words | Can the model find it at all? |
| 2 | 1 skill, 1000 noise words | Does depth hurt pass rate? |
| 3 | 5 skills, 1000 words | Do competing skills confuse it? |
| 4 | 20+ skills | Now you have a real routing benchmark |

---

## Repo Structure

```
Skill-Haystack/
├── README.md                  ← You are here
├── SPEC.md                    ← Benchmark specification
├── manifest.json              ← Single-skill manifest (swappable)
├── src/
│   ├── haystack-generator.ts  ← Builds the noisy document
│   ├── runner.ts              ← Trial loop: run N times, track pass/fail
│   └── llm-stub.ts            ← Swappable LLM call interface
├── results/
│   └── .gitkeep
└── ui/
    └── index.html             ← Bob's prototype UI (haystack visualizer)
```

---

## Token Format

Inherited from skill-bench.md:

```
BENCH-{id}::{unique_number}
```

A trial **passes** if the model's output contains the exact expected token. A trial **fails** if the token is absent, malformed, or belongs to a different skill.

---

## Running

```bash
# Install deps
npm install

# Run 25 trials with default config
npx ts-node src/runner.ts --trials 25

# Custom noise density
npx ts-node src/runner.ts --trials 25 --noise-words 1000 --skill-id weather
```

---

## Relationship to skill-bench.md

This repo is a focused precursor to [skill-bench.md](https://github.com/nothinginfinity/skill-bench.md). Once the single-skill haystack loop is proven and pass rates are stable across noise densities, the architecture here will inform the Phase 1 baseline of the full benchmark.

---

## Status

- [x] Concept validated (Alice + Bob discussion, 2026-04-26)
- [x] Initial repo scaffold
- [ ] Haystack generator implementation
- [ ] LLM call integration
- [ ] First results logged to `results/`
- [ ] Stage 2: noise depth scaling
- [ ] Stage 3: multi-skill competition

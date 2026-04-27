# Skill-Haystack — Benchmark Specification

A **single-skill, noise-injection benchmark** for testing whether an LLM can reliably detect and execute one skill buried inside an arbitrary document.

---

## Core Hypothesis

> If a model cannot reliably emit the correct token for a single skill when that skill's trigger phrase appears once in a noisy document, it cannot be expected to route correctly across 200 skills in a manifest.

Pass rate on a single skill in a haystack is the **atomic unit of routing reliability**.

---

## Benchmark Design

### Trial Structure

Each trial:
1. A skill is selected from `manifest.json` (one entry)
2. A haystack document is generated: `N` noise words with the skill's trigger phrase injected at a random position
3. The document is sent to the LLM with the system prompt and manifest
4. The LLM's output is checked for the exact expected token
5. Result: `pass` or `fail`

### Token Format

```
BENCH-{skill_id}::{token}
```

A trial passes if and only if the model's output contains this exact string.

---

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `skill_id` | `weather` | Which skill to test |
| `noise_words` | `200` | Number of noise words surrounding the trigger |
| `trials` | `25` | Number of independent runs |
| `trigger_position` | `random` | Where in the document the trigger phrase is injected (`start`, `middle`, `end`, `random`) |
| `model` | (stub) | LLM to call — swappable via `llm-stub.ts` |

---

## Scoring

| Metric | Formula |
|--------|---------|
| **Pass Rate** | `passes / trials` |
| **Fail Rate** | `fails / trials` |
| **Position Bias** | Pass rate by trigger position (start vs. middle vs. end) |

### Failure Modes

| Code | Description |
|------|-------------|
| `token_absent` | Model output contains no BENCH token |
| `wrong_token` | Model emitted a BENCH token but for a different skill |
| `malformed_token` | Token format was corrupted |
| `empty_output` | Model returned no output |

---

## Scaling Stages

```
Stage 1: 1 skill × 200 noise words  × 25 trials  → baseline pass rate
Stage 2: 1 skill × 1000 noise words × 25 trials  → depth sensitivity
Stage 3: 5 skills in document       × 25 trials  → competition sensitivity
Stage 4: 20+ skills                 × 25 trials  → full routing benchmark
```

The benchmark is considered **Stage 1 complete** when pass rate is ≥ 95% across 3 different LLM configurations.

---

## Result Format

Results are written to `results/{run-id}.json`:

```json
{
  "run_id": "2026-04-26T18:00:00Z",
  "model": "gpt-4o",
  "skill_id": "weather",
  "noise_words": 200,
  "trials": 25,
  "passes": 23,
  "fails": 2,
  "pass_rate": 0.92,
  "failure_breakdown": {
    "token_absent": 2,
    "wrong_token": 0,
    "malformed_token": 0,
    "empty_output": 0
  },
  "position_bias": {
    "start": 1.0,
    "middle": 0.88,
    "end": 0.91
  }
}
```

---

## Relationship to skill-bench.md

This benchmark is a focused precursor to the full [skill-bench.md](https://github.com/nothinginfinity/skill-bench.md) routing suite. The architecture here (manifest → haystack → runner → result) is intentionally compatible with the parent project's `runner.ts` and `manifest.json` formats so that a proven haystack module can be folded back into the full benchmark.

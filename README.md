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

## Supported Providers

| Provider | Models | Env var |
|---|---|---|
| `openai` | GPT-4o, gpt-4o-mini | `OPENAI_API_KEY` |
| `groq` | llama-3.3-70b-versatile, mixtral-8x7b-32768, gemma2-9b-it | `GROQ_API_KEY` |
| `gemini` | gemini-2.0-flash, gemini-1.5-pro | `GEMINI_API_KEY` |
| `anthropic` | claude-3-5-sonnet-latest, claude-3-haiku-20240307 | `ANTHROPIC_API_KEY` |
| `xai` | grok-3, grok-3-mini | `XAI_API_KEY` |
| `mistral` | mistral-small-latest, mistral-large-latest, codestral-latest | `MISTRAL_API_KEY` |
| `deepseek` | deepseek-chat, deepseek-coder | `DEEPSEEK_API_KEY` |
| `cerebras` | llama3.1-70b, llama3.1-8b | `CEREBRAS_API_KEY` |
| `fireworks` | llama-v3p1-70b-instruct, mixtral-8x22b | `FIREWORKS_API_KEY` |
| `sambanova` | Meta-Llama-3.1-405B-Instruct, Meta-Llama-3.1-70B-Instruct | `SAMBANOVA_API_KEY` |
| `stub` | Simulated ~90% pass rate | *(none)* |

---

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in your API key(s) in .env

# Run with Groq (default model: llama-3.3-70b-versatile)
npm run bench:groq

# Run with OpenAI, override model
npx ts-node src/runner.ts --provider openai --model gpt-4o-mini --trials 25

# Run all providers sequentially
npm run bench:all

# Offline dev with stub
npm run bench:stub
```

---

## CLI Options

```
--provider   openai|groq|gemini|anthropic|xai|mistral|deepseek|cerebras|fireworks|sambanova|stub
--model      Override provider default model
--trials     Number of trials (default: 25)
--noise-words  Noise word count (default: 200)
--skill-id   Skill to test (default: weather)
--position   start|middle|end|random (default: random)
```

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
├── README.md
├── SPEC.md
├── manifest.json              ← Skill definitions + tokens
├── .env.example               ← Copy to .env, add your keys
├── src/
│   ├── haystack-generator.ts  ← Builds the noisy document
│   ├── runner.ts              ← Trial loop + result output
│   └── llm-stub.ts            ← All provider implementations
├── results/
│   └── .gitkeep               ← Results written here (gitignored)
└── ui/
    └── index.html             ← In-browser demo UI
```

---

## Result Format

Each run writes a JSON file to `results/`:

```json
{
  "run_id": "2026-04-26T18:00:00.000Z",
  "provider": "groq",
  "model": "llama-3.3-70b-versatile",
  "skill_id": "weather",
  "noise_words": 200,
  "trials": 25,
  "pass_rate": 0.92,
  "failure_breakdown": { "token_absent": 2, "wrong_token": 0, ... },
  "position_bias": { "start": 1.0, "middle": 0.88, "end": 0.91 }
}
```

---

## Relationship to skill-bench.md

This repo is a focused precursor to [skill-bench.md](https://github.com/nothinginfinity/skill-bench.md). Once Stage 1 pass rates are stable across providers, this architecture folds back into the full benchmark as the Phase 1 baseline.

---

## Status

- [x] Concept validated (Alice + Bob discussion, 2026-04-26)
- [x] Initial repo scaffold
- [x] Multi-provider LLM integration (10 providers)
- [ ] First real results logged
- [ ] Stage 2: noise depth scaling
- [ ] Stage 3: multi-skill competition
- [ ] compare-runs.ts for cross-provider result diffing

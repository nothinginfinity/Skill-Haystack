/**
 * runner.ts
 *
 * Trial loop for the Skill-Haystack benchmark.
 * Runs N independent trials, tracks pass/fail + fidelity/precision scores.
 *
 * Usage:
 *   npx ts-node src/runner.ts [options]
 *
 * Options:
 *   --provider   openai|groq|gemini|anthropic|xai|mistral|deepseek|cerebras|fireworks|sambanova|stub
 *   --model      Override the provider's default model
 *   --trials     Number of trials (default: 25)
 *   --noise-words  Number of noise words (default: 200)
 *   --skill-id   Skill to test from manifest (default: weather)
 *   --position   start|middle|end|random (default: random)
 *
 * Env vars:
 *   HAYSTACK_PROVIDER  fallback if --provider not set
 *   <PROVIDER>_API_KEY  e.g. OPENAI_API_KEY, GROQ_API_KEY, etc.
 *
 * Scoring (v6 — fixed):
 *
 *   FIDELITY — did the model produce the correct value?
 *     • BENCH token skills: output.includes(token) — token embedded in prose is valid.
 *     • Exact-value skills (e.g. Pi digits): output.trim() must equal expected.trim().
 *       Trailing noise words = fidelity FAIL. No more substring masking.
 *
 *   PRECISION — how clean was the output?
 *     • Measures contamination: characters beyond the expected value.
 *     • Formula: max(0, 1 - extraChars / expectedLen)
 *     • Normalized against EXPECTED length, not total output length.
 *       Old formula (1 - extra/totalLen) was too soft for short suffixes
 *       on short expected strings — masked real degradation signal.
 *
 *   CONTAMINATION RATE — new in v6
 *     • % of trials where the correct value was present but output was dirty.
 *     • This is the signal that was invisible under v5 scoring.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildHaystack, TriggerPosition } from './haystack-generator';
import { callLLM } from './llm-stub';
import manifest from '../manifest.json';

// --- CLI arg parsing ---
const args = process.argv.slice(2);
const getArg = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const TRIALS      = parseInt(getArg('--trials', '25'), 10);
const NOISE_WORDS = parseInt(getArg('--noise-words', '200'), 10);
const SKILL_ID    = getArg('--skill-id', 'weather');
const POSITION    = getArg('--position', 'random') as TriggerPosition;
const PROVIDER    = getArg('--provider', process.env.HAYSTACK_PROVIDER ?? 'stub');
const MODEL       = getArg('--model', '') || undefined;

// --- Resolve skill ---
const skill = manifest.skills.find((s) => s.id === SKILL_ID);
if (!skill) {
  console.error(`Skill "${SKILL_ID}" not found in manifest.json`);
  process.exit(1);
}

/**
 * Detect whether this skill uses a BENCH token (embedded in prose)
 * or an exact-value output (e.g. Pi digits, a date, a number).
 * BENCH tokens start with "BENCH-" by convention.
 */
const IS_BENCH_TOKEN = skill.token.startsWith('BENCH-');

const SYSTEM_PROMPT = `You are an AI assistant with access to a skill manifest.
When a user message contains a trigger phrase for a skill, you MUST emit the skill's
exact benchmark token in your response. The token format is: BENCH-{skill_id}::{number}

Available skill:
  Skill: ${skill.name}
  Token: ${skill.token}
  Trigger phrases: ${skill.trigger_phrases.join(', ')}

If no trigger phrase is present, respond normally without emitting a token.`;

// ---------------------------------------------------------------------------
// Scoring (v6 — fixed)
// ---------------------------------------------------------------------------

type FailureMode = 'token_absent' | 'wrong_token' | 'malformed_token' | 'empty_output';

/**
 * FIDELITY: Did the model produce the correct value?
 *
 * For BENCH token skills:
 *   output.includes(token) — the token may be embedded in a prose response.
 *   This is intentional: "I found the skill. Executing: BENCH-weather::4821" is a clean pass.
 *
 * For exact-value skills (Pi digits, etc.):
 *   output.trim() === expected.trim() — strict equality.
 *   "3.14159265358979 here all rate branch no" is a FAIL.
 *   Trailing noise is degradation, not a pass.
 */
function scoreFidelity(
  output: string,
  expectedToken: string,
  isBenchToken: boolean
): { pass: boolean; failureMode?: FailureMode; dirty: boolean } {
  const trimmedOutput = output.trim();
  const trimmedExpected = expectedToken.trim();

  if (!trimmedOutput) return { pass: false, failureMode: 'empty_output', dirty: false };

  if (isBenchToken) {
    // Token present anywhere in output = fidelity pass.
    // But check if output is "dirty" (token present + extra content beyond a short prose wrapper).
    const tokenPresent = trimmedOutput.includes(trimmedExpected);
    if (!tokenPresent) {
      // Check for wrong/malformed token
      if (/BENCH-[\w]+::[\w]+/.test(trimmedOutput)) {
        const match = trimmedOutput.match(/BENCH-([\w]+)::[\w]+/);
        if (match && match[1] !== SKILL_ID) return { pass: false, failureMode: 'wrong_token', dirty: false };
        return { pass: false, failureMode: 'malformed_token', dirty: false };
      }
      return { pass: false, failureMode: 'token_absent', dirty: false };
    }
    // Token present — check for contamination (noise words appended after the token)
    const tokenIndex = trimmedOutput.indexOf(trimmedExpected);
    const afterToken = trimmedOutput.slice(tokenIndex + trimmedExpected.length).trim();
    // "Dirty" = significant content after the token (more than punctuation/whitespace)
    const dirty = afterToken.length > 5;
    return { pass: true, dirty };
  } else {
    // Exact-value skill — strict equality only.
    const exactMatch = trimmedOutput === trimmedExpected;
    if (exactMatch) return { pass: true, dirty: false };

    // Value present but with trailing noise = dirty fail
    if (trimmedOutput.startsWith(trimmedExpected)) {
      return { pass: false, failureMode: 'token_absent', dirty: true };
    }
    // Value contains expected somewhere but not at start
    if (trimmedOutput.includes(trimmedExpected)) {
      return { pass: false, failureMode: 'malformed_token', dirty: true };
    }
    return { pass: false, failureMode: 'token_absent', dirty: false };
  }
}

/**
 * PRECISION: How clean was the output?
 *
 * Measures output contamination — characters produced beyond what was expected.
 *
 * Formula: max(0, 1 - extraChars / expectedLen)
 *
 * Normalized against EXPECTED length (not total output length).
 * This ensures short suffixes on short expected strings incur real penalties.
 *
 * Old formula was: 1 - extraChars / totalOutputLen
 * Problem: for expected="3.14159265358979" (16 chars) + suffix of 24 chars,
 * old formula gave 1 - 24/40 = 0.6 (soft). New formula: 1 - 24/16 = capped at 0.0 (hard fail).
 *
 * For BENCH token skills, precision measures prose verbosity after the token.
 * A terse "BENCH-weather::4821" is precision=1.0; a long essay with the token buried = lower.
 */
function scorePrecision(output: string, expectedToken: string): number {
  const trimmedOutput = output.trim();
  const trimmedExpected = expectedToken.trim();
  const expectedLen = trimmedExpected.length;

  if (expectedLen === 0) return 1.0;

  const extraChars = Math.max(0, trimmedOutput.length - expectedLen);
  return Math.max(0, 1 - extraChars / expectedLen);
}

// ---------------------------------------------------------------------------
// Trial runner
// ---------------------------------------------------------------------------

interface TrialResult {
  trial: number;
  pass: boolean;
  dirty: boolean;          // correct value present but output contaminated
  fidelity: boolean;       // alias for pass (explicit label)
  precision: number;       // 0.0–1.0
  failureMode?: FailureMode;
  output: string;
  latencyMs: number;
  triggerPosition: string;
}

async function runTrials() {
  console.log(`\n🌾 Skill-Haystack Runner  (scoring: v6)`);
  console.log(`   Provider:    ${PROVIDER}`);
  console.log(`   Model:       ${MODEL ?? '(provider default)'}`);
  console.log(`   Skill:       ${skill!.name} (${SKILL_ID})`);
  console.log(`   Token:       ${skill!.token}`);
  console.log(`   Token type:  ${IS_BENCH_TOKEN ? 'BENCH (embedded)' : 'exact-value (strict)'}`);
  console.log(`   Noise words: ${NOISE_WORDS}`);
  console.log(`   Trials:      ${TRIALS}`);
  console.log(`   Position:    ${POSITION}`);
  console.log(`─────────────────────────────────────────────`);

  const results: TrialResult[] = [];
  const failureBreakdown: Record<FailureMode, number> = {
    token_absent: 0, wrong_token: 0, malformed_token: 0, empty_output: 0,
  };
  const positionResults: Record<string, { passes: number; total: number }> = {
    start: { passes: 0, total: 0 },
    middle: { passes: 0, total: 0 },
    end: { passes: 0, total: 0 },
  };

  let dirtyPassCount = 0;   // correct value present, output contaminated, still "passed" fidelity (BENCH only)
  let dirtyFailCount = 0;   // correct value present, output contaminated, failed fidelity (exact-value)
  let precisionSum = 0;

  const triggerPhrase = skill!.trigger_phrases[
    Math.floor(Math.random() * skill!.trigger_phrases.length)
  ];

  for (let i = 1; i <= TRIALS; i++) {
    const positions: TriggerPosition[] = ['start', 'middle', 'end'];
    const trialPosition: TriggerPosition =
      POSITION === 'random'
        ? positions[Math.floor(Math.random() * positions.length)]
        : POSITION;

    const haystack = buildHaystack({
      triggerPhrase,
      noiseWordCount: NOISE_WORDS,
      position: trialPosition,
    });

    let output = '';
    let latencyMs = 0;
    try {
      const res = await callLLM({
        systemPrompt: SYSTEM_PROMPT,
        userMessage: haystack,
        provider: PROVIDER,
        model: MODEL,
      });
      output = res.output;
      latencyMs = res.latencyMs;
    } catch (err: any) {
      console.error(`   Trial ${String(i).padStart(2, '0')}  ✗ ERROR: ${err.message}`);
      results.push({
        trial: i, pass: false, dirty: false, fidelity: false,
        precision: 0, failureMode: 'empty_output', output: '',
        latencyMs: 0, triggerPosition: trialPosition,
      });
      failureBreakdown.empty_output++;
      continue;
    }

    const { pass, failureMode, dirty } = scoreFidelity(output, skill!.token, IS_BENCH_TOKEN);
    const precision = scorePrecision(output, skill!.token);

    if (!pass && failureMode) failureBreakdown[failureMode]++;
    if (dirty && pass)  dirtyPassCount++;
    if (dirty && !pass) dirtyFailCount++;
    precisionSum += precision;

    positionResults[trialPosition].total++;
    if (pass) positionResults[trialPosition].passes++;

    results.push({
      trial: i, pass, dirty, fidelity: pass, precision,
      failureMode, output, latencyMs, triggerPosition: trialPosition,
    });

    const fIcon  = pass  ? '✅' : '❌';
    const dFlag  = dirty ? ' ⚠️ dirty' : '';
    const pScore = `P:${(precision * 100).toFixed(0)}%`;
    const failNote = failureMode ? ` (${failureMode})` : '';
    console.log(`   Trial ${String(i).padStart(2, '0')}  ${fIcon}  ${pScore}  ${latencyMs}ms  [${trialPosition}]${dFlag}${failNote}`);
  }

  const passes = results.filter((r) => r.pass).length;
  const passRate = passes / TRIALS;
  const avgPrecision = precisionSum / TRIALS;
  const contaminationRate = (dirtyPassCount + dirtyFailCount) / TRIALS;

  console.log(`─────────────────────────────────────────────`);
  console.log(`   Fidelity:          ${passes}/${TRIALS} = ${(passRate * 100).toFixed(1)}%`);
  console.log(`   Avg Precision:     ${(avgPrecision * 100).toFixed(1)}%`);
  console.log(`   Contamination:     ${((contaminationRate) * 100).toFixed(1)}%  (${dirtyPassCount} dirty-pass, ${dirtyFailCount} dirty-fail)`);
  console.log(`   Failure breakdown: ${JSON.stringify(failureBreakdown)}`);

  const runId = new Date().toISOString();
  const resultData = {
    run_id: runId,
    scoring_version: 'v6',
    provider: PROVIDER,
    model: MODEL ?? '(provider default)',
    skill_id: SKILL_ID,
    token_type: IS_BENCH_TOKEN ? 'bench' : 'exact-value',
    trigger_phrase: triggerPhrase,
    noise_words: NOISE_WORDS,
    trials: TRIALS,
    // --- core metrics ---
    passes,
    fails: TRIALS - passes,
    pass_rate: passRate,
    avg_precision: avgPrecision,
    contamination_rate: contaminationRate,
    // --- breakdown ---
    dirty_pass_count: dirtyPassCount,
    dirty_fail_count: dirtyFailCount,
    failure_breakdown: failureBreakdown,
    position_bias: Object.fromEntries(
      Object.entries(positionResults).map(([pos, { passes: p, total }]) => [
        pos, total > 0 ? p / total : null,
      ])
    ),
    trial_log: results,
  };

  const outDir = path.join(__dirname, '..', 'results');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${runId.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(resultData, null, 2));
  console.log(`\n   Results saved → ${outPath}`);
}

runTrials().catch(console.error);

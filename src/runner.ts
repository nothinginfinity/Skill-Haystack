/**
 * runner.ts
 *
 * Trial loop for the Skill-Haystack benchmark.
 * Runs N independent trials, tracks pass/fail per trial, and writes results.
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

const SYSTEM_PROMPT = `You are an AI assistant with access to a skill manifest.
When a user message contains a trigger phrase for a skill, you MUST emit the skill's
exact benchmark token in your response. The token format is: BENCH-{skill_id}::{number}

Available skill:
  Skill: ${skill.name}
  Token: ${skill.token}
  Trigger phrases: ${skill.trigger_phrases.join(', ')}

If no trigger phrase is present, respond normally without emitting a token.`;

type FailureMode = 'token_absent' | 'wrong_token' | 'malformed_token' | 'empty_output';

interface TrialResult {
  trial: number;
  pass: boolean;
  failureMode?: FailureMode;
  output: string;
  latencyMs: number;
  triggerPosition: string;
}

function checkOutput(output: string, expectedToken: string): { pass: boolean; failureMode?: FailureMode } {
  if (!output || output.trim() === '') return { pass: false, failureMode: 'empty_output' };
  if (output.includes(expectedToken)) return { pass: true };
  if (/BENCH-[\w]+::[\w]+/.test(output)) {
    const match = output.match(/BENCH-([\w]+)::[\w]+/);
    if (match && match[1] !== SKILL_ID) return { pass: false, failureMode: 'wrong_token' };
    return { pass: false, failureMode: 'malformed_token' };
  }
  return { pass: false, failureMode: 'token_absent' };
}

async function runTrials() {
  console.log(`\n🌾 Skill-Haystack Runner`);
  console.log(`   Provider:    ${PROVIDER}`);
  console.log(`   Model:       ${MODEL ?? '(provider default)'}`);
  console.log(`   Skill:       ${skill!.name} (${SKILL_ID})`);
  console.log(`   Token:       ${skill!.token}`);
  console.log(`   Noise words: ${NOISE_WORDS}`);
  console.log(`   Trials:      ${TRIALS}`);
  console.log(`   Position:    ${POSITION}`);
  console.log(`─────────────────────────────────────`);

  const results: TrialResult[] = [];
  const failureBreakdown: Record<FailureMode, number> = {
    token_absent: 0, wrong_token: 0, malformed_token: 0, empty_output: 0,
  };
  const positionResults: Record<string, { passes: number; total: number }> = {
    start: { passes: 0, total: 0 },
    middle: { passes: 0, total: 0 },
    end: { passes: 0, total: 0 },
  };

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
      results.push({ trial: i, pass: false, failureMode: 'empty_output', output: '', latencyMs: 0, triggerPosition: trialPosition });
      failureBreakdown.empty_output++;
      continue;
    }

    const { pass, failureMode } = checkOutput(output, skill!.token);
    if (!pass && failureMode) failureBreakdown[failureMode]++;
    positionResults[trialPosition].total++;
    if (pass) positionResults[trialPosition].passes++;
    results.push({ trial: i, pass, failureMode, output, latencyMs, triggerPosition: trialPosition });

    const icon = pass ? '✅' : '❌';
    const failNote = failureMode ? ` (${failureMode})` : '';
    console.log(`   Trial ${String(i).padStart(2, '0')}  ${icon}  ${latencyMs}ms  [${trialPosition}]${failNote}`);
  }

  const passes = results.filter((r) => r.pass).length;
  const passRate = passes / TRIALS;

  console.log(`─────────────────────────────────────`);
  console.log(`   Pass rate: ${passes}/${TRIALS} = ${(passRate * 100).toFixed(1)}%`);
  console.log(`   Failures:  ${JSON.stringify(failureBreakdown)}`);

  const runId = new Date().toISOString();
  const resultData = {
    run_id: runId,
    provider: PROVIDER,
    model: MODEL ?? '(provider default)',
    skill_id: SKILL_ID,
    trigger_phrase: triggerPhrase,
    noise_words: NOISE_WORDS,
    trials: TRIALS,
    passes,
    fails: TRIALS - passes,
    pass_rate: passRate,
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

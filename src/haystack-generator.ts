/**
 * haystack-generator.ts
 *
 * Generates a noisy document with a skill trigger phrase injected at a
 * configurable position. The model must detect the trigger and emit the
 * correct BENCH token.
 *
 * IMPORTANT: Noise entries use the same BENCH-{word}::{number} format as real
 * tokens so the model cannot trivially find the answer by structural pattern-
 * matching. It must match the skill concept to the correct token.
 */

export type TriggerPosition = 'start' | 'middle' | 'end' | 'random';

export interface HaystackConfig {
  triggerPhrase: string;
  noiseWordCount: number;
  position: TriggerPosition;
}

/**
 * Fake skill words used to generate noise tokens in the same
 * BENCH-{word}::{number} format as real tokens.
 * Drawn from plausible-sounding but semantically neutral words so the model
 * cannot distinguish real from fake by content alone — only by skill match.
 */
const FAKE_SKILL_WORDS = [
  'foghorn', 'spanner', 'caliper', 'rivet', 'torque', 'lumen',
  'kelvin', 'pascal', 'farad', 'tesla', 'hertz', 'coulomb',
  'ampere', 'newton', 'watt', 'joule', 'ohm', 'henry',
  'candela', 'mole', 'becquerel', 'sievert', 'gray', 'lux',
  'weber', 'siemens', 'radian', 'steradian', 'katal', 'dalton',
  'fermi', 'angstrom', 'barn', 'torr', 'poise', 'stokes',
  'neper', 'bel', 'phon', 'sone', 'jansky', 'kayser',
];

/** Generate N random fake BENCH-format tokens from the pool. */
function generateNoise(count: number): string[] {
  return Array.from({ length: count }, () => {
    const word = FAKE_SKILL_WORDS[Math.floor(Math.random() * FAKE_SKILL_WORDS.length)];
    const num = String(Math.floor(Math.random() * 9000) + 1000);
    return `BENCH-${word}::${num}`;
  });
}

/**
 * Build a haystack document: fake BENCH-format noise tokens with the trigger
 * phrase injected at the specified position.
 *
 * The trigger phrase should itself be a real BENCH token (e.g. "BENCH-weather::4821")
 * so it is structurally indistinguishable from the surrounding noise tokens.
 * The model must identify it by matching the requested skill concept, not by
 * spotting a structural anomaly.
 */
export function buildHaystack(config: HaystackConfig): string {
  const { triggerPhrase, noiseWordCount, position } = config;
  const noiseTokens = generateNoise(noiseWordCount);

  let insertIndex: number;
  const resolvedPosition =
    position === 'random'
      ? (['start', 'middle', 'end'] as const)[
          Math.floor(Math.random() * 3)
        ]
      : position;

  switch (resolvedPosition) {
    case 'start':
      insertIndex = 0;
      break;
    case 'end':
      insertIndex = noiseTokens.length;
      break;
    case 'middle':
    default:
      insertIndex = Math.floor(noiseTokens.length / 2);
      break;
  }

  const tokens = [
    ...noiseTokens.slice(0, insertIndex),
    triggerPhrase,
    ...noiseTokens.slice(insertIndex),
  ];

  return tokens.join('\n');
}

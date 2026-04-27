/**
 * haystack-generator.ts
 *
 * Generates a noisy document with a skill trigger phrase injected at a
 * configurable position. The model must detect the trigger and emit the
 * correct BENCH token.
 */

export type TriggerPosition = 'start' | 'middle' | 'end' | 'random';

export interface HaystackConfig {
  triggerPhrase: string;
  noiseWordCount: number;
  position: TriggerPosition;
}

/** Generic noise words to pad the document. Extend as needed. */
const NOISE_WORDS = [
  'the', 'a', 'an', 'and', 'but', 'or', 'in', 'on', 'at', 'to', 'for',
  'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'than', 'too', 'very', 'just', 'because',
  'as', 'until', 'while', 'although', 'however', 'therefore', 'moreover',
  'furthermore', 'nevertheless', 'otherwise', 'instead', 'meanwhile',
  'subsequently', 'consequently', 'accordingly', 'approximately',
  'specifically', 'generally', 'recently', 'previously', 'currently',
  'typically', 'usually', 'frequently', 'occasionally', 'rarely',
  'almost', 'also', 'already', 'always', 'never', 'often', 'since',
  'still', 'yet', 'today', 'tomorrow', 'yesterday', 'soon', 'now',
];

/** Generate N random noise words from the pool. */
function generateNoise(count: number): string[] {
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    words.push(NOISE_WORDS[Math.floor(Math.random() * NOISE_WORDS.length)]);
  }
  return words;
}

/**
 * Build a haystack document: noise words with the trigger phrase
 * injected at the specified position.
 */
export function buildHaystack(config: HaystackConfig): string {
  const { triggerPhrase, noiseWordCount, position } = config;
  const noiseWords = generateNoise(noiseWordCount);

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
      insertIndex = noiseWords.length;
      break;
    case 'middle':
    default:
      insertIndex = Math.floor(noiseWords.length / 2);
      break;
  }

  const words = [
    ...noiseWords.slice(0, insertIndex),
    triggerPhrase,
    ...noiseWords.slice(insertIndex),
  ];

  return words.join(' ') + '.';
}

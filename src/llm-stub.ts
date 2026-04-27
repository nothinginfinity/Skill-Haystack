/**
 * llm-stub.ts
 *
 * Multi-provider LLM call interface for Skill-Haystack.
 *
 * Supported providers (set via --provider CLI arg or HAYSTACK_PROVIDER env var):
 *   openai      → OpenAI (GPT-4o, gpt-4o-mini, etc.)
 *   groq        → Groq (llama-3.3-70b-versatile, mixtral-8x7b-32768, gemma2-9b-it, etc.)
 *   gemini      → Google Gemini (gemini-2.0-flash, gemini-1.5-pro, etc.)
 *   anthropic   → Anthropic (claude-3-5-sonnet-latest, claude-3-haiku-20240307, etc.)
 *   xai         → xAI (grok-3, grok-3-mini)
 *   mistral     → Mistral (mistral-small-latest, mistral-large-latest, codestral-latest)
 *   deepseek    → DeepSeek (deepseek-chat, deepseek-coder)
 *   cerebras    → Cerebras (llama3.1-70b, llama3.1-8b)
 *   fireworks   → Fireworks AI (accounts/fireworks/models/llama-v3p1-70b-instruct, etc.)
 *   sambanova   → SambaNova (Meta-Llama-3.1-405B-Instruct, Meta-Llama-3.1-70B-Instruct)
 *   stub        → Simulated ~90% pass rate (offline dev/testing)
 *
 * Required env vars per provider:
 *   OPENAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY,
 *   XAI_API_KEY, MISTRAL_API_KEY, DEEPSEEK_API_KEY, CEREBRAS_API_KEY,
 *   FIREWORKS_API_KEY, SAMBANOVA_API_KEY
 */

import * as https from 'https';

export interface LLMRequest {
  systemPrompt: string;
  userMessage: string;
  provider?: string;
  model?: string;
}

export interface LLMResponse {
  output: string;
  latencyMs: number;
  provider: string;
  model: string;
}

// ---------------------------------------------------------------------------
// Provider defaults
// ---------------------------------------------------------------------------

const PROVIDER_DEFAULTS: Record<string, { model: string; baseUrl: string; apiKeyEnv: string }> = {
  openai:    { model: 'gpt-4o',                          baseUrl: 'https://api.openai.com',                                   apiKeyEnv: 'OPENAI_API_KEY' },
  groq:      { model: 'llama-3.3-70b-versatile',         baseUrl: 'https://api.groq.com',                                     apiKeyEnv: 'GROQ_API_KEY' },
  gemini:    { model: 'gemini-2.0-flash',                 baseUrl: 'https://generativelanguage.googleapis.com',                apiKeyEnv: 'GEMINI_API_KEY' },
  anthropic: { model: 'claude-3-5-sonnet-latest',         baseUrl: 'https://api.anthropic.com',                                apiKeyEnv: 'ANTHROPIC_API_KEY' },
  xai:       { model: 'grok-3',                           baseUrl: 'https://api.x.ai',                                         apiKeyEnv: 'XAI_API_KEY' },
  mistral:   { model: 'mistral-small-latest',             baseUrl: 'https://api.mistral.ai',                                   apiKeyEnv: 'MISTRAL_API_KEY' },
  deepseek:  { model: 'deepseek-chat',                    baseUrl: 'https://api.deepseek.com',                                 apiKeyEnv: 'DEEPSEEK_API_KEY' },
  cerebras:  { model: 'llama3.1-70b',                     baseUrl: 'https://api.cerebras.ai',                                  apiKeyEnv: 'CEREBRAS_API_KEY' },
  fireworks: { model: 'accounts/fireworks/models/llama-v3p1-70b-instruct', baseUrl: 'https://api.fireworks.ai', apiKeyEnv: 'FIREWORKS_API_KEY' },
  sambanova: { model: 'Meta-Llama-3.1-70B-Instruct',      baseUrl: 'https://api.sambanova.ai',                                 apiKeyEnv: 'SAMBANOVA_API_KEY' },
};

// ---------------------------------------------------------------------------
// Shared OpenAI-compatible fetch (used by most providers)
// ---------------------------------------------------------------------------

function httpsPost(url: string, headers: Record<string, string>, body: object): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function openAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  extraHeaders: Record<string, string> = {}
): Promise<string> {
  const raw = await httpsPost(
    `${baseUrl}/v1/chat/completions`,
    { Authorization: `Bearer ${apiKey}`, ...extraHeaders },
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
      max_tokens: 256,
    }
  );
  const json = JSON.parse(raw);
  if (json.error) throw new Error(`API error: ${JSON.stringify(json.error)}`);
  return json.choices?.[0]?.message?.content ?? '';
}

// ---------------------------------------------------------------------------
// Provider-specific callers
// ---------------------------------------------------------------------------

async function callOpenAI(model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  return openAICompatible('https://api.openai.com', key, model, systemPrompt, userMessage);
}

async function callGroq(model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');
  return openAICompatible('https://api.groq.com', key, model, systemPrompt, userMessage);
}

async function callXAI(model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error('XAI_API_KEY not set');
  return openAICompatible('https://api.x.ai', key, model, systemPrompt, userMessage);
}

async function callMistral(model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error('MISTRAL_API_KEY not set');
  return openAICompatible('https://api.mistral.ai', key, model, systemPrompt, userMessage);
}

async function callDeepSeek(model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');
  return openAICompatible('https://api.deepseek.com', key, model, systemPrompt, userMessage);
}

async function callCerebras(model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.CEREBRAS_API_KEY;
  if (!key) throw new Error('CEREBRAS_API_KEY not set');
  return openAICompatible('https://api.cerebras.ai', key, model, systemPrompt, userMessage);
}

async function callFireworks(model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.FIREWORKS_API_KEY;
  if (!key) throw new Error('FIREWORKS_API_KEY not set');
  return openAICompatible('https://api.fireworks.ai', key, model, systemPrompt, userMessage);
}

async function callSambaNova(model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.SAMBANOVA_API_KEY;
  if (!key) throw new Error('SAMBANOVA_API_KEY not set');
  return openAICompatible('https://api.sambanova.ai', key, model, systemPrompt, userMessage);
}

async function callAnthropic(model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const raw = await httpsPost(
    'https://api.anthropic.com/v1/messages',
    {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    {
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 256,
    }
  );
  const json = JSON.parse(raw);
  if (json.error) throw new Error(`Anthropic error: ${JSON.stringify(json.error)}`);
  return json.content?.[0]?.text ?? '';
}

async function callGemini(model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const raw = await httpsPost(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {},
    {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 256 },
    }
  );
  const json = JSON.parse(raw);
  if (json.error) throw new Error(`Gemini error: ${JSON.stringify(json.error)}`);
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callStub(_model: string, _systemPrompt: string, _userMessage: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  return Math.random() < 0.9
    ? 'I found the relevant skill. Executing: BENCH-weather::4821'
    : 'The document discusses various topics but I could not identify a clear skill trigger.';
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const provider = (request.provider ?? process.env.HAYSTACK_PROVIDER ?? 'stub').toLowerCase();
  const defaults = PROVIDER_DEFAULTS[provider];
  const model = request.model ?? defaults?.model ?? 'unknown';
  const start = Date.now();

  let output: string;

  switch (provider) {
    case 'openai':    output = await callOpenAI(model, request.systemPrompt, request.userMessage);    break;
    case 'groq':      output = await callGroq(model, request.systemPrompt, request.userMessage);      break;
    case 'gemini':    output = await callGemini(model, request.systemPrompt, request.userMessage);    break;
    case 'anthropic': output = await callAnthropic(model, request.systemPrompt, request.userMessage); break;
    case 'xai':       output = await callXAI(model, request.systemPrompt, request.userMessage);       break;
    case 'mistral':   output = await callMistral(model, request.systemPrompt, request.userMessage);   break;
    case 'deepseek':  output = await callDeepSeek(model, request.systemPrompt, request.userMessage);  break;
    case 'cerebras':  output = await callCerebras(model, request.systemPrompt, request.userMessage);  break;
    case 'fireworks': output = await callFireworks(model, request.systemPrompt, request.userMessage); break;
    case 'sambanova': output = await callSambaNova(model, request.systemPrompt, request.userMessage); break;
    case 'stub':      output = await callStub(model, request.systemPrompt, request.userMessage);      break;
    default:
      throw new Error(`Unknown provider "${provider}". Valid: openai, groq, gemini, anthropic, xai, mistral, deepseek, cerebras, fireworks, sambanova, stub`);
  }

  return { output, latencyMs: Date.now() - start, provider, model };
}

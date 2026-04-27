/**
 * llm-stub.ts
 *
 * Swappable LLM call interface. Replace the body of `callLLM` with a real
 * API call (OpenAI, Anthropic, Gemini, local model, etc.).
 *
 * The stub simulates a ~90% pass rate for development and testing.
 */

export interface LLMRequest {
  systemPrompt: string;
  userMessage: string;
  model?: string;
}

export interface LLMResponse {
  output: string;
  latencyMs: number;
}

/**
 * Replace this function body with your real LLM API call.
 *
 * Example (OpenAI):
 *   const res = await openai.chat.completions.create({
 *     model: request.model ?? 'gpt-4o',
 *     messages: [
 *       { role: 'system', content: request.systemPrompt },
 *       { role: 'user', content: request.userMessage },
 *     ],
 *   });
 *   return { output: res.choices[0].message.content ?? '', latencyMs: ... };
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const start = Date.now();

  // --- STUB: simulates ~90% pass rate ---
  await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
  const shouldPass = Math.random() < 0.9;
  const output = shouldPass
    ? `I found the relevant skill in the document. Executing: BENCH-weather::4821`
    : `The document discusses various topics but I could not identify a clear skill trigger.`;
  // --- END STUB ---

  return { output, latencyMs: Date.now() - start };
}

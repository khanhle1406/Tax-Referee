/** Synthetic OpenAI-compatible response; no provider or network access. */
export function mockLlmCompletion(value: unknown, finishReason = 'stop'): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(value) }, finish_reason: finishReason }] }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}

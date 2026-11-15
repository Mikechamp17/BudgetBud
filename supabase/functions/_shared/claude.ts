// Claude calls for document extraction (KTD12). Only Edge Functions call Claude.
import Anthropic from 'npm:@anthropic-ai/sdk@^1.8.0';

export const EXTRACTION_MODEL = 'claude-sonnet-5-5';

export type ModelReply = {
  model: string;
  stopReason: string | null;
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export type ContentBlock =
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } }
  | { type: 'text'; text: string };

export type CallModel = (request: { system: string; content: ContentBlock[]; schema: Record<string, unknown> }) => Promise<ModelReply>;

/**
 * Streams one structured-output request and returns the final message.
 * Server-side refusal fallbacks are on: a declined request is retried on the fallback model in the same call.
 */
export function claudeCaller(apiKey: string): CallModel {
  const client = new Anthropic({ apiKey });
  return async ({ system, content, schema }) => {
    const stream = client.beta.messages.stream({
      model: EXTRACTION_MODEL,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content }],
    });
    const message = await stream.finalMessage();
    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { text: string }).text)
      .join('');
    return {
      model: message.model,
      stopReason: message.stop_reason,
      text,
      inputTokens: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0),
      outputTokens: message.usage.output_tokens,
    };
  };
}

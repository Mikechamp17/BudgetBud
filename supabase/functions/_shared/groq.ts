// Groq chat completions through its OpenAI-compatible API (KTD11).
// The model is configuration: set GROQ_MODEL to a current model from Groq's list.

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export type GroqAnswer = {
  results: { merchant: string; category: string }[];
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type SortMerchants = (merchants: string[], categories: string[]) => Promise<GroqAnswer>;

/** Asks Groq to sort merchant names into the given categories. Sends names and category names only. */
export function groqSorter(
  apiKey: string,
  model = DEFAULT_GROQ_MODEL,
  fetchFn: typeof fetch = fetch,
): SortMerchants {
  return async (merchants, categories) => {
    const response = await fetchFn(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You sort card-statement merchant names into spending categories for a shopper in Malta. ' +
              'Answer for every merchant. Use "Uncategorized" when you cannot tell.',
          },
          { role: 'user', content: JSON.stringify({ merchants }) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'merchant_categories',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['results'],
              properties: {
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['merchant', 'category'],
                    properties: {
                      merchant: { type: 'string' },
                      category: { type: 'string', enum: categories },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Groq request failed with status ${response.status}`);
    }
    const body = await response.json();
    const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? '{}');
    return {
      results: Array.isArray(parsed.results) ? parsed.results : [],
      model: body.model ?? model,
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
    };
  };
}

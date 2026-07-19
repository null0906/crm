import Groq from 'groq-sdk';

export type LlmHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export class LlmServiceError extends Error {
  constructor() {
    super('AI service temporarily unavailable');
    this.name = 'LlmServiceError';
  }
}

function getCandidateModels(): string[] {
  const configuredModels = [
    process.env.GROQ_MODEL,
    ...(process.env.GROQ_FALLBACK_MODELS?.split(',') ?? []),
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ]
    .map((model) => model?.trim())
    .filter((model): model is string => Boolean(model));

  return Array.from(new Set(configuredModels));
}

export async function generateChatResponse(
  userMessage: string,
  conversationHistory: LlmHistoryMessage[],
  systemPrompt: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[Groq] GROQ_API_KEY is not configured');
    throw new LlmServiceError();
  }

  const groq = new Groq({ apiKey });
  const candidateModels = getCandidateModels();
  let lastError: unknown = null;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((message) => ({ role: message.role, content: message.content })),
    { role: 'user', content: userMessage },
  ];

  for (const modelName of candidateModels) {
    try {
      const completion = await groq.chat.completions.create({
        model: modelName,
        messages,
        temperature: Number(process.env.GROQ_TEMPERATURE ?? 0.1),
        max_completion_tokens: Number(process.env.GROQ_MAX_TOKENS ?? 2048),
      });

      const content = completion.choices[0]?.message?.content;
      if (content) return content;
      lastError = new Error(`Model ${modelName} returned an empty response`);
    } catch (error) {
      lastError = error;
      console.warn(`[Groq] Model ${modelName} failed, trying fallback if available:`, error);
    }
  }

  console.error('[Groq] All model attempts failed:', lastError);
  throw new LlmServiceError();
}

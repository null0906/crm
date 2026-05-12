import { GoogleGenerativeAI } from '@google/generative-ai';

export type GeminiHistoryMessage = {
  role: 'user' | 'model';
  parts: [{ text: string }];
};

export class GeminiServiceError extends Error {
  constructor() {
    super('AI service temporarily unavailable');
    this.name = 'GeminiServiceError';
  }
}

function getCandidateModels(): string[] {
  const configuredModels = [
    process.env.GEMINI_MODEL,
    ...(process.env.GEMINI_FALLBACK_MODELS?.split(',') ?? []),
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
  ]
    .map((model) => model?.trim())
    .filter((model): model is string => Boolean(model));

  return Array.from(new Set(configuredModels));
}

export async function generateChatResponse(
  userMessage: string,
  conversationHistory: GeminiHistoryMessage[],
  systemPrompt: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[Gemini] GEMINI_API_KEY is not configured');
    throw new GeminiServiceError();
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const candidateModels = getCandidateModels();
  let lastError: unknown = null;

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: Number(process.env.GEMINI_TEMPERATURE ?? 0.1),
          maxOutputTokens: Number(process.env.GEMINI_MAX_TOKENS ?? 2048),
        },
      });

      const chat = model.startChat({ history: conversationHistory });
      const result = await chat.sendMessage(userMessage);
      return result.response.text();
    } catch (error) {
      lastError = error;
      console.warn(`[Gemini] Model ${modelName} failed, trying fallback if available:`, error);
    }
  }

  console.error('[Gemini] All model attempts failed:', lastError);
  throw new GeminiServiceError();
}

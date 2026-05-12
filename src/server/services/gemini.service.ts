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

export async function generateChatResponse(
  userMessage: string,
  conversationHistory: GeminiHistoryMessage[],
  systemPrompt: string
): Promise<string> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
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
    console.error('[Gemini] API request failed:', error);
    throw new GeminiServiceError();
  }
}

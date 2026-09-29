/**
 * The one place the platform talks to a language model.
 *
 * This was previously a private function inside ai-chat.service.ts that hardcoded the
 * assistant's tool set, so a second feature could not reuse it without dragging the chat
 * assistant along. Everything model-shaped now lives here: provider construction, the
 * fallback chain, rate limiting and token accounting.
 *
 * Three things exist here that did not exist around the old call site, and all three matter
 * more now that a model's output can move money rather than only answer a question:
 *
 *   - **Rate limiting.** There was none. Groq's per-minute token caps were absorbed silently
 *     by the fallback chain, which quietly downgraded to a weaker model instead of failing —
 *     turning a rate limit into worse output with no signal anywhere.
 *   - **Token accounting.** `result.usage` was discarded. Callers now get it back and are
 *     expected to persist it against whatever the call produced.
 *   - **A purpose label** on every call, so usage can be attributed to a feature rather than
 *     to "the AI".
 */

import { generateText, Output, stepCountIs, type ModelMessage, type ToolSet } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import type { z } from 'zod';

/** What the model was asked to do. Recorded with usage so cost is attributable. */
export type LlmPurpose =
  | 'chat'
  | 'comparable_extraction'
  | 'quotation_suggestion'
  | 'scope_extraction'
  | 'quotation_drafting';

export interface LlmUsage {
  /** The model that actually answered — not necessarily the first one tried. */
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  purpose: LlmPurpose;
}

/**
 * The model could not answer. Carries a message safe to show a user — the underlying
 * provider error is logged, never surfaced, because it can contain prompt fragments.
 */
export class LlmUnavailableError extends Error {
  constructor(message = 'The assistant is unavailable right now. Try again shortly.') {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

export class LlmRateLimitError extends Error {
  constructor(
    message: string,
    /** Seconds until the caller may retry. */
    readonly retryAfterSeconds: number
  ) {
    super(message);
    this.name = 'LlmRateLimitError';
  }
}

/**
 * Ordered list of models to try.
 *
 * openai/gpt-oss-* come before the Llama models deliberately: they are trained for the
 * standard OpenAI-style structured tool-calling format and are markedly more reliable at
 * emitting well-formed tool calls on Groq. Llama on Groq is documented — in our own testing
 * and widely elsewhere — to sometimes emit malformed pseudo-XML function-call text that
 * Groq's API then rejects as an invalid tool name.
 */
export function getCandidateModels(): string[] {
  const configured = [
    process.env.GROQ_MODEL,
    ...(process.env.GROQ_FALLBACK_MODELS?.split(',') ?? []),
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'llama-3.3-70b-versatile',
  ]
    .map((model) => model?.trim())
    .filter((model): model is string => Boolean(model));

  return Array.from(new Set(configured));
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * In-process sliding-window counters, per user and overall.
 *
 * Deliberately in memory rather than in Redis. `ioredis` is a dependency but is imported
 * nowhere in the server today, and this platform runs as a single instance — introducing a
 * Redis dependency for a limiter that has never existed would be a bigger change than the
 * problem warrants. The tradeoff is explicit: **these counters reset on deploy and do not
 * coordinate across instances.** If the app is ever scaled horizontally, this must move to
 * a shared store, and the per-instance limit will silently become per-instance × N until it
 * does.
 */
const WINDOW_MS = 60_000;
const PER_USER_PER_MINUTE = Number(process.env.LLM_CALLS_PER_USER_PER_MINUTE ?? 10);
const GLOBAL_PER_MINUTE = Number(process.env.LLM_CALLS_GLOBAL_PER_MINUTE ?? 60);

const callTimes = new Map<string, number[]>();

function recentCalls(key: string, now: number): number[] {
  const times = (callTimes.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length === 0) {
    // Keep the map from growing a key per user forever.
    callTimes.delete(key);
  } else {
    callTimes.set(key, times);
  }
  return times;
}

function retryAfter(times: number[], now: number): number {
  const oldest = times[0];
  if (oldest === undefined) return 1;
  return Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
}

/**
 * Throws rather than queueing. A caller that wants to wait can catch and decide; silently
 * delaying a request the user is watching is worse than telling them.
 */
export function assertWithinRateLimit(userId: string): void {
  const now = Date.now();

  const globalTimes = recentCalls('__global__', now);
  if (globalTimes.length >= GLOBAL_PER_MINUTE) {
    throw new LlmRateLimitError(
      'The assistant is busy across the team right now. Try again in a moment.',
      retryAfter(globalTimes, now)
    );
  }

  const userTimes = recentCalls(`user:${userId}`, now);
  if (userTimes.length >= PER_USER_PER_MINUTE) {
    throw new LlmRateLimitError(
      'You have made a lot of assistant requests in the last minute. Try again shortly.',
      retryAfter(userTimes, now)
    );
  }

  callTimes.set('__global__', [...globalTimes, now]);
  callTimes.set(`user:${userId}`, [...userTimes, now]);
}

/** Test seam — the limiter is module state, which a test suite has to be able to clear. */
export function __resetRateLimiterForTests(): void {
  callTimes.clear();
}

// ---------------------------------------------------------------------------
// Calling the model
// ---------------------------------------------------------------------------

function groqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[LLM] GROQ_API_KEY is not configured');
    throw new LlmUnavailableError();
  }
  return createGroq({ apiKey });
}

/**
 * The AI SDK renamed these fields between major versions (promptTokens/completionTokens →
 * inputTokens/outputTokens). Read both so an SDK bump does not silently start recording
 * every call as zero tokens — which would look like the feature is free rather than broken.
 */
export function normalizeUsage(usage: unknown, model: string, purpose: LlmPurpose): LlmUsage {
  const u = (usage ?? {}) as Record<string, number | undefined>;
  const inputTokens = u.inputTokens ?? u.promptTokens ?? 0;
  const outputTokens = u.outputTokens ?? u.completionTokens ?? 0;
  return {
    model,
    inputTokens,
    outputTokens,
    totalTokens: u.totalTokens ?? inputTokens + outputTokens,
    purpose,
  };
}

interface BaseParams {
  purpose: LlmPurpose;
  /** Whose quota this spends. Required — an unattributed model call is not wanted. */
  userId: string;
  systemPrompt: string;
  /**
   * Default 0. The chat assistant passes 0.1, which is right for prose and wrong for
   * anything that resolves to a number: a price that changes between identical runs is not
   * a price, it is a guess wearing one.
   */
  temperature?: number;
}

export interface TextParams extends BaseParams {
  messages: ModelMessage[];
  tools?: ToolSet;
  maxSteps?: number;
}

export type TextResult = Awaited<ReturnType<typeof generateText>> & { usage: LlmUsage };

/**
 * Free-form or tool-calling generation. Tries each candidate model in order and gives up
 * only when all of them have failed.
 */
export async function runText(params: TextParams): Promise<TextResult> {
  assertWithinRateLimit(params.userId);

  const groq = groqClient();
  let lastError: unknown = null;

  for (const model of getCandidateModels()) {
    try {
      const result = await generateText({
        model: groq(model),
        system: params.systemPrompt,
        messages: params.messages,
        ...(params.tools ? { tools: params.tools } : {}),
        stopWhen: stepCountIs(params.maxSteps ?? Number(process.env.GROQ_MAX_TOOL_STEPS ?? 6)),
        temperature: params.temperature ?? 0,
      });

      return Object.assign(result, {
        usage: normalizeUsage(result.usage, model, params.purpose),
      }) as TextResult;
    } catch (error) {
      lastError = error;
      console.warn(`[LLM] ${params.purpose}: model ${model} failed, trying fallback:`, error);
    }
  }

  console.error(`[LLM] ${params.purpose}: all model attempts failed:`, lastError);
  throw new LlmUnavailableError();
}

export interface ObjectParams<T> extends BaseParams {
  schema: z.ZodType<T>;
  prompt: string;
}

export interface ObjectResult<T> {
  object: T;
  usage: LlmUsage;
}

/**
 * Schema-constrained generation, for the extraction and suggestion paths.
 *
 * Uses `generateText` with an `output` specification. `generateObject` would have been the
 * obvious call and is what most examples still show, but it is deprecated in ai@7 in favour
 * of this — worth knowing, because the deprecation is silent at runtime and only the
 * compiler complains.
 *
 * Nothing in the codebase generated structured output before: the chat assistant gets shape
 * out of a tool declared with no `execute`, which works but returns exactly one payload and
 * cannot express a nested schema.
 *
 * Schema validation failure is treated as a provider failure — fall through to the next
 * model rather than hand a caller an object that did not typecheck.
 */
export async function runObject<T>(params: ObjectParams<T>): Promise<ObjectResult<T>> {
  assertWithinRateLimit(params.userId);

  const groq = groqClient();
  let lastError: unknown = null;

  for (const model of getCandidateModels()) {
    try {
      const result = await generateText({
        model: groq(model),
        system: params.systemPrompt,
        prompt: params.prompt,
        output: Output.object({ schema: params.schema }),
        temperature: params.temperature ?? 0,
      });

      return {
        object: result.output as T,
        usage: normalizeUsage(result.usage, model, params.purpose),
      };
    } catch (error) {
      lastError = error;
      console.warn(`[LLM] ${params.purpose}: model ${model} failed on structured output:`, error);
    }
  }

  console.error(`[LLM] ${params.purpose}: all model attempts failed:`, lastError);
  throw new LlmUnavailableError();
}

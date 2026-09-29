import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  LlmRateLimitError,
  __resetRateLimiterForTests,
  assertWithinRateLimit,
  getCandidateModels,
  normalizeUsage,
} from './llm';

describe('getCandidateModels', () => {
  const saved = { model: process.env.GROQ_MODEL, fallbacks: process.env.GROQ_FALLBACK_MODELS };

  afterEach(() => {
    process.env.GROQ_MODEL = saved.model;
    process.env.GROQ_FALLBACK_MODELS = saved.fallbacks;
  });

  it('puts the configured model first and keeps the hardcoded safety net', () => {
    process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
    delete process.env.GROQ_FALLBACK_MODELS;

    const models = getCandidateModels();

    expect(models[0]).toBe('llama-3.3-70b-versatile');
    expect(models).toContain('openai/gpt-oss-120b');
    expect(models).toContain('openai/gpt-oss-20b');
  });

  it('never returns the same model twice', () => {
    // The configured model duplicating a hardcoded fallback used to mean it was tried
    // twice in a row before moving on — the same failure, waited for again.
    process.env.GROQ_MODEL = 'openai/gpt-oss-120b';
    process.env.GROQ_FALLBACK_MODELS = 'openai/gpt-oss-20b,openai/gpt-oss-120b';

    const models = getCandidateModels();

    expect(models).toEqual([...new Set(models)]);
    expect(models[0]).toBe('openai/gpt-oss-120b');
  });

  it('ignores blank and whitespace-only entries in the fallback list', () => {
    process.env.GROQ_MODEL = 'a-model';
    process.env.GROQ_FALLBACK_MODELS = ' , b-model ,,  ';

    const models = getCandidateModels();

    expect(models).toContain('b-model');
    expect(models.every((m) => m.trim() === m && m.length > 0)).toBe(true);
  });
});

describe('normalizeUsage', () => {
  it('reads the ai@7 field names', () => {
    const usage = normalizeUsage(
      { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 },
      'openai/gpt-oss-120b',
      'quotation_suggestion'
    );

    expect(usage).toEqual({
      model: 'openai/gpt-oss-120b',
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
      purpose: 'quotation_suggestion',
    });
  });

  it('still reads the older promptTokens/completionTokens names', () => {
    // The whole point of the fallback: an SDK rename must not silently record every call
    // as free.
    const usage = normalizeUsage({ promptTokens: 900, completionTokens: 100 }, 'm', 'chat');

    expect(usage.inputTokens).toBe(900);
    expect(usage.outputTokens).toBe(100);
    expect(usage.totalTokens).toBe(1000);
  });

  it('derives the total when the provider omits it', () => {
    expect(normalizeUsage({ inputTokens: 7, outputTokens: 3 }, 'm', 'chat').totalTokens).toBe(10);
  });

  it('does not throw when usage is missing entirely', () => {
    const usage = normalizeUsage(undefined, 'm', 'chat');
    expect(usage.totalTokens).toBe(0);
  });
});

describe('assertWithinRateLimit', () => {
  beforeEach(() => __resetRateLimiterForTests());

  it('allows calls up to the per-user limit', () => {
    // Default is 10/minute per user.
    for (let i = 0; i < 10; i++) {
      expect(() => assertWithinRateLimit('user-a')).not.toThrow();
    }
  });

  it('throws once a user exceeds the limit, with a retry hint', () => {
    for (let i = 0; i < 10; i++) assertWithinRateLimit('user-a');

    try {
      assertWithinRateLimit('user-a');
      throw new Error('expected a rate limit error');
    } catch (error) {
      expect(error).toBeInstanceOf(LlmRateLimitError);
      const limit = error as LlmRateLimitError;
      expect(limit.retryAfterSeconds).toBeGreaterThan(0);
      expect(limit.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it('counts each user separately', () => {
    for (let i = 0; i < 10; i++) assertWithinRateLimit('user-a');

    // One noisy user must not lock out the rest of the team.
    expect(() => assertWithinRateLimit('user-b')).not.toThrow();
  });

  it('still enforces a global ceiling across users', () => {
    // 6 users x 10 calls = 60, the default global cap.
    for (let u = 0; u < 6; u++) {
      for (let i = 0; i < 10; i++) assertWithinRateLimit(`user-${u}`);
    }

    expect(() => assertWithinRateLimit('user-fresh')).toThrow(LlmRateLimitError);
  });
});

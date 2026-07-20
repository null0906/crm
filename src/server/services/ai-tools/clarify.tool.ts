import { z } from 'zod';
import { tool, type ToolSet } from 'ai';

/**
 * Deliberately has no `execute` function. Per the AI SDK's documented stop conditions, "a tool
 * without an execute function is called" is itself one of the loop's natural termination
 * points — the orchestrator (ai-chat.service.ts) inspects the final step for a call to this
 * tool and renders it as a clarifying question instead of treating it as a normal answer.
 */
export function createClarifyTool(): ToolSet {
  return {
    ask_clarifying_question: tool({
      description: 'Ask the user a clarifying question instead of guessing, when their request is genuinely ambiguous (e.g. multiple matching event tags, multiple matching people with no clear current-user preference, or an unclear metric). Do not use this if a reasonable default interpretation exists — prefer answering directly.',
      inputSchema: z.object({
        question: z.string(),
        options: z.array(z.object({
          label: z.string(),
          count: z.number().nullish(),
        })).nullish(),
      }),
    }),
  };
}

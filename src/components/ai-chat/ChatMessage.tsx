'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ClarificationOptions, type ClarificationOption } from './ClarificationOptions';

export type ChatUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  options?: ClarificationOption[];
  wasClarification?: boolean;
  createdAt: string | Date;
};

function formatTime(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function ChatMessage({
  message,
  onOptionSelect,
  disabled,
}: {
  message: ChatUiMessage;
  onOptionSelect?: (label: string) => void;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={cn('group flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[86%]', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'relative rounded-xl px-3.5 py-2.5 text-sm leading-6 shadow-sm',
            isUser
              ? 'bg-blue-500 text-white'
              : 'border border-slate-200 bg-white text-slate-800'
          )}
        >
          {!isUser && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Copy message"
              onClick={copyMessage}
              className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          )}

          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="ai-chat-markdown pr-6">
              <ReactMarkdown
                components={{
                  table: ({ children }) => (
                    <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
                      <table className="min-w-full divide-y divide-slate-200 text-xs">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => <th className="bg-slate-50 px-2 py-1.5 text-left font-semibold">{children}</th>,
                  td: ({ children }) => <td className="px-2 py-1.5 align-top">{children}</td>,
                  code: ({ children }) => <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-700">{children}</code>,
                  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
                  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
                  p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {!isUser && message.options && onOptionSelect && (
            <ClarificationOptions options={message.options} onOptionSelect={onOptionSelect} disabled={disabled} />
          )}
        </div>
        <p className={cn('mt-1 text-[10px] text-slate-400', isUser ? 'text-right' : 'text-left')}>
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

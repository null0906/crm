'use client';

import React, { useEffect, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const maxLength = 2000;

export function ChatInput({
  onSend,
  loading,
}: {
  onSend: (message: string) => void;
  loading?: boolean;
}) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const remaining = maxLength - value.length;
  const showCounter = remaining <= 250;
  const canSend = value.trim().length > 0 && !loading;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [value]);

  const submit = () => {
    const message = value.trim();
    if (!message || loading) return;
    onSend(message);
    setValue('');
  };

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={value}
            maxLength={maxLength}
            disabled={loading}
            placeholder={loading ? 'Thinking...' : 'Ask about your CRM data...'}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="min-h-[42px] max-h-[120px] pr-14"
          />
          {showCounter && (
            <span className="absolute bottom-2 right-2 text-[10px] text-slate-400">
              {remaining}
            </span>
          )}
        </div>
        <Button
          type="button"
          size="icon"
          aria-label="Send message"
          disabled={!canSend}
          onClick={submit}
          className="h-[42px] w-[42px]"
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

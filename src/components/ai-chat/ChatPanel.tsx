'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChatInput } from './ChatInput';
import { ChatMessage, type ChatUiMessage } from './ChatMessage';
import { SuggestedQuestions } from './SuggestedQuestions';

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
    </div>
  );
}

export function ChatPanel({ fullPage = false }: { fullPage?: boolean }) {
  const utils = trpc.useUtils();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);

  const sessionQuery = trpc.aiChat.getOrCreateSession.useQuery(undefined, {
    enabled: !sessionId,
  });

  useEffect(() => {
    if (sessionQuery.data?.id && !sessionId) {
      setSessionId(sessionQuery.data.id);
    }
  }, [sessionId, sessionQuery.data?.id]);

  const messagesQuery = trpc.aiChat.getMessages.useQuery(
    { sessionId: sessionId ?? '' },
    { enabled: Boolean(sessionId) }
  );

  const suggestionsQuery = trpc.aiChat.getSuggestions.useQuery();

  useEffect(() => {
    if (messagesQuery.data) {
      setMessages(messagesQuery.data.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        wasClarification: message.wasClarification,
        createdAt: message.createdAt,
      })));
    }
  }, [messagesQuery.data]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, messagesQuery.isFetching]);

  const sendMessage = trpc.aiChat.sendMessage.useMutation({
    onSuccess: async (result) => {
      setMessages((current) => [...current, result.message]);
      if (sessionId) {
        await utils.aiChat.getMessages.invalidate({ sessionId });
      }
    },
    onError: (error) => {
      toast.error('AI Assistant error', { description: error.message });
      setMessages((current) => current.filter((message) => !message.id.startsWith('pending-')));
    },
  });

  const newSession = trpc.aiChat.newSession.useMutation({
    onSuccess: async (session) => {
      setSessionId(session.id);
      setMessages([]);
      await utils.aiChat.getOrCreateSession.invalidate();
    },
    onError: (error) => {
      toast.error('Failed to start conversation', { description: error.message });
    },
  });

  const loadingInitial = sessionQuery.isLoading || (Boolean(sessionId) && messagesQuery.isLoading);
  const isSending = sendMessage.isPending;
  const suggestions = useMemo(() => suggestionsQuery.data ?? [], [suggestionsQuery.data]);

  const handleSend = (message: string) => {
    if (!sessionId || isSending) return;
    const pendingMessage: ChatUiMessage = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content: message,
      createdAt: new Date(),
    };
    setMessages((current) => [...current, pendingMessage]);
    sendMessage.mutate({ sessionId, message });
  };

  return (
    <section
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden bg-slate-50',
        fullPage ? 'mx-auto w-full max-w-3xl border-x border-slate-200' : 'w-full rounded-xl border border-slate-200 shadow-xl'
      )}
    >
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div>
          <h1 className="text-sm font-semibold text-slate-900">CRM Assistant</h1>
          <p className="text-[11px] text-slate-400">Ask questions across contacts, companies, prospects, and activity.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={newSession.isPending}
          onClick={() => newSession.mutate()}
        >
          {newSession.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          New
        </Button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loadingInitial ? (
          <div className="space-y-3">
            <div className="h-16 w-3/4 animate-pulse rounded-xl bg-slate-200" />
            <div className="ml-auto h-12 w-2/3 animate-pulse rounded-xl bg-blue-100" />
            <div className="h-20 w-4/5 animate-pulse rounded-xl bg-slate-200" />
          </div>
        ) : messages.length === 0 ? (
          <SuggestedQuestions suggestions={suggestions} onSelect={handleSend} disabled={isSending || !sessionId} />
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onOptionSelect={handleSend}
                disabled={isSending}
              />
            ))}
            {isSending && (
              <div className="flex justify-start">
                <TypingIndicator />
              </div>
            )}
          </div>
        )}
      </div>

      <ChatInput onSend={handleSend} loading={isSending || !sessionId} />
    </section>
  );
}

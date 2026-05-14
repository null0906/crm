'use client';

import React, { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatPanel } from './ChatPanel';

export function FloatingChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-3 md:bottom-6 md:right-6">
      {open && (
        <div className="h-[min(520px,calc(100vh-150px))] w-[min(400px,calc(100vw-32px))] md:w-[min(400px,calc(100vw-48px))]">
          <ChatPanel />
        </div>
      )}
      <div className="relative">
        <Button
          type="button"
          size="icon"
          aria-label={open ? 'Close CRM Assistant' : 'Open CRM Assistant'}
          onClick={() => setOpen((current) => !current)}
          className="h-12 w-12 rounded-full shadow-lg"
        >
          {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        </Button>
        <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
      </div>
    </div>
  );
}

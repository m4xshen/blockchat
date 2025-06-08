'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/theme-toggle';
import { ChatMessage, LoadingMessage } from '@/components/chat-message';
import { Textarea } from '@/components/ui/textarea';

export default function Home() {
  const scrollAreaRootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [userHasManuallyScrolled, setUserHasManuallyScrolled] = useState(false);
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  const handleViewportScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      // A small threshold (e.g., 1px) can be robust for checking if at bottom
      const isAtBottom = scrollHeight - clientHeight <= scrollTop + 1;
      setUserHasManuallyScrolled(!isAtBottom);
    }
  }, []); // No dependencies, this function is stable

  useEffect(() => {
    // Effect to get the viewport element and attach scroll listener
    const root = scrollAreaRootRef.current;
    let viewportElement: HTMLDivElement | null = null;

    if (root) {
      // Radix UI ScrollArea Viewport is identified by this data attribute
      viewportElement = root.querySelector('[data-radix-scroll-area-viewport]');
      if (viewportElement) {
        viewportRef.current = viewportElement;
        viewportElement.addEventListener('scroll', handleViewportScroll);
      }
    }

    return () => {
      if (viewportElement) {
        viewportElement.removeEventListener('scroll', handleViewportScroll);
      }
    };
  }, [handleViewportScroll]); // Re-run if handleViewportScroll changes (it won't due to useCallback)

  useEffect(() => {
    // Effect to handle auto-scrolling when messages change
    const viewport = viewportRef.current;
    if (viewport) {
      const lastMessage = messages[messages.length - 1];

      if (lastMessage?.role === 'user') {
        // If the user sent a message, always scroll to bottom
        viewport.scrollTop = viewport.scrollHeight;
        // And reset manual scroll state, allowing assistant's reply to auto-scroll
        if (userHasManuallyScrolled) {
            setUserHasManuallyScrolled(false);
        }
      } else if (!userHasManuallyScrolled) {
        // If it's an assistant message and user hasn't manually scrolled up, auto-scroll
        viewport.scrollTop = viewport.scrollHeight;
      }
      // If it's an assistant message and user HAS manually scrolled, do nothing.
    }
  }, [messages, isLoading, userHasManuallyScrolled]); // Dependencies: messages, isLoading, and userHasManuallyScrolled



  return (
    <div className="flex flex-col h-screen">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>

      <main className="flex-1 overflow-hidden pt-8">
        <ScrollArea ref={scrollAreaRootRef} className="h-full pr-4">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
                <h2 className="text-2xl font-semibold">
                  Welcome to the Crypto Chatbot
                </h2>
                <p className="text-muted-foreground max-w-md">
                  Ask questions about cryptocurrency, ENS names, blockchain transactions, and more.
                </p>
              </div>
            ) : (
              <div className="space-y-6 pb-4">
                {messages.map((message, index) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isLastMessage={index === messages.length - 1}
                    isLoading={isLoading}
                  />
                ))}
                {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                  <LoadingMessage />
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </main>

      <div className="pb-10 max-w-3xl w-full mx-auto">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            placeholder="Ask anything"
            value={input}
            onChange={handleInputChange}
            disabled={isLoading}
            className="flex-1 p-3 min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as any);
              }
            }}
          />
        </form>
      </div>

    </div>
  );
}

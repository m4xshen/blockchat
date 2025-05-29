'use client';

import { useChat } from '@ai-sdk/react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/theme-toggle';
import { ChatMessage, LoadingMessage } from '@/components/chat-message';
import { Textarea } from '@/components/ui/textarea';

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  // Log messages to see their structure
  console.log(messages)

  return (
    <div className="flex flex-col h-screen">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>

      <main className="flex-1 overflow-hidden pt-8">
        <ScrollArea className="h-full pr-4">
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

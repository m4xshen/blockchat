'use client';

import { Avatar } from '@/components/ui/avatar';
import { LoadingDot } from '@/components/loading-dot';
import ReactMarkdown from 'react-markdown';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

// Define types for message parts
type TextPart = {
  type: 'text';
  text: string;
};

type StepStartPart = {
  type: 'step-start';
};

type ToolInvocationPart = {
  type: 'tool-invocation';
  toolInvocation: {
    state: string;
    step: number;
    toolCallId: string;
    toolName: string;
    args: Record<string, any>;
    result?: {
      content: Array<{ type: string; text: string }>;
    };
  };
};

type MessagePart = TextPart | StepStartPart | ToolInvocationPart | { type: string };

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'data';
  content?: string;
  parts?: MessagePart[];
};

type ChatMessageProps = {
  message: Message;
  isLastMessage: boolean;
  isLoading: boolean;
};

export function ChatMessage({ message, isLastMessage, isLoading }: ChatMessageProps) {
  return (
    <div
      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`flex gap-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
      >
        <Avatar className="h-10 w-10">
          <div className={`flex h-full w-full items-center justify-center rounded-full ${message.role === 'user' ? 'bg-muted' : 'bg-secondary'}`}>
            {message.role === 'user' ? 'You' : 'C'}
          </div>
        </Avatar>
        <div
          className={`rounded-lg px-4 py-3 ${message.role === 'user' ? 'bg-muted text-white' : ''}`}
        >
          {message.parts ? (
            <div className="space-y-3">
              {(message.parts as MessagePart[]).map((part, index) => {
                if (part.type === 'text' && 'text' in part) {
                  const textPart = part as TextPart;
                  return (
                    <div key={index}>
                      <div className="prose dark:prose-invert max-w-none">
                        <ReactMarkdown>
                          {textPart.text}
                        </ReactMarkdown>
                      </div>
                    </div>
                  );
                } else if (part.type === 'tool-invocation' && 'toolInvocation' in part) {
                  const toolPart = part as ToolInvocationPart;
                  return (
                    <Accordion key={index} type="single" collapsible className="w-xl bg-muted rounded-md text-sm">
                      <AccordionItem value="tool-call" className="border-none">
                        <AccordionTrigger className="px-3 py-2">
                          <span className="flex items-center">
                            <span className="mr-2">🔧</span>
                            <span>Tool Call: {toolPart.toolInvocation.toolName}</span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="px-3">
                          <div className="space-y-3">
                            <div>
                              <div className="font-semibold text-xs mb-1">Parameters:</div>
                              <pre className="text-xs overflow-x-auto bg-muted/50 p-2 rounded-md">
                                {JSON.stringify(toolPart.toolInvocation.args, null, 2)}
                              </pre>
                            </div>

                            {toolPart.toolInvocation.result && (
                              <div>
                                <div className="font-semibold text-xs mb-1">Result:</div>
                                <pre className="text-xs overflow-x-auto bg-muted/50 p-2 rounded-md">
                                  {toolPart.toolInvocation.result.content.map(item => item.text).join('')}
                                </pre>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  );
                } else if (part.type === 'step-start') {
                  // Just a step marker, no need to render anything
                  return null;
                }
                return null;
              })}
            </div>
          ) : (
            <div className="whitespace-pre-wrap flex items-center">
              {message.content && message.content.trim() !== '' && (
                <div className="prose dark:prose-invert max-w-none">
                  <ReactMarkdown>
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
              {message.role === 'assistant' && isLastMessage && isLoading && <LoadingDot />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function LoadingMessage() {
  return (
    <div className="flex justify-start">
      <div className="flex gap-3 max-w-[80%] flex-row">
        <Avatar className="h-10 w-10">
          <div className="flex h-full w-full items-center justify-center rounded-full bg-secondary">C</div>
        </Avatar>
        <div className="rounded-lg px-4 py-3">
          <div className="whitespace-pre-wrap flex items-center">
            <LoadingDot />
          </div>
        </div>
      </div>
    </div>
  );
}

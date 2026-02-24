"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/lib/chat";
import { sendChat, updateBoard } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { fetchBoard } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "@/components/chat/ChatMessage";

export function ChatSidebar() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = useAuthStore((s) => s.token);
  const { messages, addMessage } = useChatStore();
  const queryClient = useQueryClient();

  const { data: board } = useQuery({
    queryKey: ["board"],
    queryFn: fetchBoard,
    enabled: !!token,
  });

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading || !board) return;

    const userMsg = { role: "user" as const, content: text };
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await sendChat([...messages, userMsg], board);
      addMessage(userMsg);
      addMessage({ role: "assistant", content: response.message });

      if (response.board_update) {
        await updateBoard(response.board_update);
        queryClient.invalidateQueries({ queryKey: ["board"] });
      }
    } catch {
      setError("Failed to get a response. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--secondary-purple)] text-white shadow-[var(--shadow)] transition-transform hover:scale-105"
          aria-label="Open AI chat"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-[380px] flex-col border-l border-[var(--stroke)] bg-white p-0 sm:max-w-[380px]"
      >
        <SheetHeader className="border-b border-[var(--stroke)] px-5 py-4">
          <SheetTitle className="font-display text-base font-semibold text-[var(--navy-dark)]">
            AI Assistant
          </SheetTitle>
          <SheetDescription className="text-xs text-[var(--gray-text)]">
            Ask me to move cards, rename columns, or anything else.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 py-3">
          {messages.length === 0 ? (
            <p
              className="mt-8 text-center text-sm text-[var(--gray-text)]"
              data-testid="empty-message-list"
            >
              No messages yet. Start a conversation!
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((msg, i) => (
                <ChatMessage key={i} message={msg} />
              ))}
            </div>
          )}
          {isLoading && (
            <div className="mt-3 flex justify-start" data-testid="loading-indicator">
              <div className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-2.5">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--gray-text)] [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--gray-text)] [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--gray-text)] [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          {error && (
            <p
              className="mt-2 text-center text-xs text-red-500"
              role="alert"
              data-testid="chat-error"
            >
              {error}
            </p>
          )}
        </ScrollArea>

        <div className="border-t border-[var(--stroke)] px-4 py-3">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the AI..."
              disabled={isLoading}
              className="flex-1 border-[var(--stroke)] bg-[var(--surface)] text-sm focus-visible:ring-[var(--primary-blue)]"
              data-testid="chat-input"
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-[var(--secondary-purple)] text-white hover:bg-[var(--secondary-purple)]/90"
              data-testid="chat-send"
            >
              Send
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

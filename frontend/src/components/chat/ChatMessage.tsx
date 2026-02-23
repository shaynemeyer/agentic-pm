import type { ChatMessage as ChatMessageType } from "@/lib/chat";

type Props = {
  message: ChatMessageType;
};

export function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      data-testid={`chat-message-${message.role}`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-[var(--secondary-purple)] text-white"
            : "border border-[var(--stroke)] bg-white text-[var(--navy-dark)]"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

import { render, screen } from "@testing-library/react";
import { ChatMessage } from "@/components/chat/ChatMessage";

describe("ChatMessage", () => {
  it("renders user message right-aligned", () => {
    render(<ChatMessage message={{ role: "user", content: "Hello!" }} />);
    const wrapper = screen.getByTestId("chat-message-user");
    expect(wrapper).toHaveClass("justify-end");
    expect(screen.getByText("Hello!")).toBeInTheDocument();
  });

  it("renders assistant message left-aligned", () => {
    render(<ChatMessage message={{ role: "assistant", content: "Hi there!" }} />);
    const wrapper = screen.getByTestId("chat-message-assistant");
    expect(wrapper).toHaveClass("justify-start");
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
  });

  it("applies distinct styles to user vs assistant messages", () => {
    const { rerender } = render(
      <ChatMessage message={{ role: "user", content: "text" }} />
    );
    const userBubble = screen.getByText("text");
    expect(userBubble.className).toContain("bg-[var(--secondary-purple)]");

    rerender(<ChatMessage message={{ role: "assistant", content: "text" }} />);
    const assistantBubble = screen.getByText("text");
    expect(assistantBubble.className).toContain("bg-white");
  });
});

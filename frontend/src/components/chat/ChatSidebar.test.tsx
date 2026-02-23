import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { useChatStore } from "@/lib/chat";
import { initialData } from "@/lib/kanban";
import * as api from "@/lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  fetchBoard: vi.fn(),
  updateBoard: vi.fn(),
  sendChat: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuthStore: (selector: (s: { token: string | null }) => unknown) =>
    selector({ token: "test-token" }),
}));

// Radix UI uses ResizeObserver; provide a minimal stub for jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  useChatStore.setState({ messages: [] });
  vi.mocked(api.fetchBoard).mockResolvedValue(structuredClone(initialData));
  vi.mocked(api.updateBoard).mockImplementation((board) => Promise.resolve(board));
  vi.mocked(api.sendChat).mockResolvedValue({ message: "I can help!", board_update: null });
});

describe("ChatSidebar", () => {
  it("renders the toggle button", () => {
    render(<ChatSidebar />, { wrapper });
    expect(screen.getByRole("button", { name: /open ai chat/i })).toBeInTheDocument();
  });

  it("opening sidebar shows empty message list", async () => {
    render(<ChatSidebar />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: /open ai chat/i }));
    expect(await screen.findByTestId("empty-message-list")).toBeInTheDocument();
  });

  it("typing and submitting calls sendChat with correct payload", async () => {
    render(<ChatSidebar />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: /open ai chat/i }));

    const input = await screen.findByTestId("chat-input");
    await userEvent.type(input, "Hello AI");
    await userEvent.click(screen.getByTestId("chat-send"));

    await waitFor(() => expect(api.sendChat).toHaveBeenCalledOnce());
    const [messages, board] = vi.mocked(api.sendChat).mock.calls[0];
    expect(messages).toEqual([{ role: "user", content: "Hello AI" }]);
    expect(board).toEqual(initialData);
  });

  it("AI response message appears in message list", async () => {
    vi.mocked(api.sendChat).mockResolvedValue({
      message: "Here is the board summary.",
      board_update: null,
    });

    render(<ChatSidebar />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: /open ai chat/i }));

    const input = await screen.findByTestId("chat-input");
    await userEvent.type(input, "What is on the board?");
    await userEvent.click(screen.getByTestId("chat-send"));

    expect(await screen.findByText("Here is the board summary.")).toBeInTheDocument();
  });

  it("calls updateBoard when board_update is returned", async () => {
    const updatedBoard = structuredClone(initialData);
    updatedBoard.columns[0].title = "Updated Backlog";

    vi.mocked(api.sendChat).mockResolvedValue({
      message: "Done.",
      board_update: updatedBoard,
    });

    render(<ChatSidebar />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: /open ai chat/i }));

    const input = await screen.findByTestId("chat-input");
    await userEvent.type(input, "Update the board");
    await userEvent.click(screen.getByTestId("chat-send"));

    await waitFor(() => expect(api.updateBoard).toHaveBeenCalledWith(updatedBoard));
  });
});

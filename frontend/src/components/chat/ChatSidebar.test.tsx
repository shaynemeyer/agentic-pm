import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { useChatStore } from "@/lib/chat";
import { initialData } from "@/lib/kanban";
import * as api from "@/lib/api";

const BOARD_ID = "board-1";

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

vi.mock("@/lib/boardStore", () => ({
  useBoardStore: (selector: (s: { activeBoardId: string }) => unknown) =>
    selector({ activeBoardId: BOARD_ID }),
}));

// Radix UI uses ResizeObserver; provide a minimal stub for jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mockBoard = {
  ...initialData,
  cards: Object.fromEntries(
    Object.entries(initialData.cards).map(([k, v]) => [k, { ...v, created_by: null, assigned_to: null }])
  ),
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
  vi.mocked(api.fetchBoard).mockResolvedValue(structuredClone(mockBoard));
  vi.mocked(api.updateBoard).mockImplementation((_boardId, board) => Promise.resolve(board));
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
    const [messages, board, boardId] = vi.mocked(api.sendChat).mock.calls[0];
    expect(messages).toEqual([{ role: "user", content: "Hello AI" }]);
    expect(board).toEqual(mockBoard);
    expect(boardId).toBe(BOARD_ID);
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
    const updatedBoard = structuredClone(mockBoard);
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

    await waitFor(() => expect(api.updateBoard).toHaveBeenCalledWith(BOARD_ID, updatedBoard));
  });

  it("does not add user message to store when sendChat fails", async () => {
    vi.mocked(api.sendChat).mockRejectedValueOnce(new Error("Network error"));

    render(<ChatSidebar />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: /open ai chat/i }));

    const input = await screen.findByTestId("chat-input");
    await userEvent.type(input, "This should not appear");
    await userEvent.click(screen.getByTestId("chat-send"));

    await waitFor(() => expect(screen.getByTestId("chat-error")).toBeInTheDocument());

    expect(screen.queryByText("This should not appear")).not.toBeInTheDocument();
    expect(screen.getByTestId("empty-message-list")).toBeInTheDocument();
  });

  it("shows error message when sendChat fails", async () => {
    vi.mocked(api.sendChat).mockRejectedValueOnce(new Error("Network error"));

    render(<ChatSidebar />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: /open ai chat/i }));

    const input = await screen.findByTestId("chat-input");
    await userEvent.type(input, "Hello");
    await userEvent.click(screen.getByTestId("chat-send"));

    expect(await screen.findByTestId("chat-error")).toHaveTextContent(
      /failed to get a response/i
    );
  });
});

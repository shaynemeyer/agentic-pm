import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";
import * as api from "@/lib/api";

const BOARD_ID = "board-1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  fetchBoards: vi.fn(),
  fetchBoard: vi.fn(),
  updateBoard: vi.fn(),
  deleteBoard: vi.fn(),
  fetchMembers: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuthStore: (selector: (s: { token: string | null; username: string | null; clearToken: () => void }) => unknown) =>
    selector({ token: "test-token", username: "user", clearToken: vi.fn() }),
}));

vi.mock("@/lib/boardStore", () => ({
  useBoardStore: (selector: (s: { activeBoardId: string; setActiveBoardId: () => void }) => unknown) =>
    selector({ activeBoardId: BOARD_ID, setActiveBoardId: vi.fn() }),
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

const mockBoard = {
  ...initialData,
  cards: Object.fromEntries(
    Object.entries(initialData.cards).map(([k, v]) => [k, { ...v, created_by: null, assigned_to: null }])
  ),
};

const mockBoardSummary = { id: BOARD_ID, title: "Main Board", owner_username: "user" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchBoards).mockResolvedValue([mockBoardSummary]);
  vi.mocked(api.fetchBoard).mockResolvedValue(structuredClone(mockBoard));
  vi.mocked(api.updateBoard).mockImplementation((_boardId, board) => Promise.resolve(board));
  vi.mocked(api.fetchMembers).mockResolvedValue([]);
});

const getFirstColumn = async () => {
  const cols = await screen.findAllByTestId(/column-/i);
  return cols[0];
};

describe("KanbanBoard", () => {
  it("renders five columns from API", async () => {
    render(<KanbanBoard />, { wrapper });
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column on blur", async () => {
    render(<KanbanBoard />, { wrapper });
    const column = await getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    await userEvent.tab();
    await waitFor(() =>
      expect(api.updateBoard).toHaveBeenCalledWith(
        BOARD_ID,
        expect.objectContaining({
          columns: expect.arrayContaining([
            expect.objectContaining({ title: "New Name" }),
          ]),
        })
      )
    );
  });

  it("adds a card and calls updateBoard", async () => {
    render(<KanbanBoard />, { wrapper });
    const column = await getFirstColumn();
    const addButton = within(column).getByRole("button", { name: /add a card/i });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    await waitFor(() => expect(api.updateBoard).toHaveBeenCalled());
    const call = vi.mocked(api.updateBoard).mock.calls[0];
    const board = call[1];
    const newCard = Object.values(board.cards).find((c) => (c as { title: string }).title === "New card");
    expect(newCard).toBeDefined();
  });

  it("deletes a card and calls updateBoard", async () => {
    render(<KanbanBoard />, { wrapper });
    const column = await getFirstColumn();

    const deleteButton = await within(column).findByRole("button", {
      name: /delete align roadmap themes/i,
    });
    await userEvent.click(deleteButton);

    await waitFor(() =>
      expect(api.updateBoard).toHaveBeenCalledWith(
        BOARD_ID,
        expect.objectContaining({
          cards: expect.not.objectContaining({ "card-1": expect.anything() }),
        })
      )
    );
  });

  it("rolls back optimistic update when updateBoard fails and board keeps rendering", async () => {
    vi.mocked(api.updateBoard).mockRejectedValueOnce(new Error("Network error"));

    render(<KanbanBoard />, { wrapper });

    const column = await getFirstColumn();
    const deleteButton = await within(column).findByRole("button", {
      name: /delete align roadmap themes/i,
    });
    await userEvent.click(deleteButton);

    await waitFor(() => expect(api.updateBoard).toHaveBeenCalledOnce());

    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });
});

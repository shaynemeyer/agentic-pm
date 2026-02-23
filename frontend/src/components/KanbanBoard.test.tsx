import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";
import * as api from "@/lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  fetchBoard: vi.fn(),
  updateBoard: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuthStore: (selector: (s: { token: string | null; clearToken: () => void }) => unknown) =>
    selector({ token: "test-token", clearToken: vi.fn() }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchBoard).mockResolvedValue(structuredClone(initialData));
  vi.mocked(api.updateBoard).mockImplementation((board) => Promise.resolve(board));
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
    const call = vi.mocked(api.updateBoard).mock.calls[0][0];
    const newCard = Object.values(call.cards).find((c) => (c as { title: string }).title === "New card");
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
        expect.objectContaining({
          cards: expect.not.objectContaining({ "card-1": expect.anything() }),
        })
      )
    );
  });
});

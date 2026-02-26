import { vi, describe, it, expect, beforeEach } from "vitest";
import { fetchBoard, updateBoard } from "@/lib/api";
import { initialData } from "@/lib/kanban";

const { mockClearToken } = vi.hoisted(() => ({
  mockClearToken: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuthStore: {
    getState: vi.fn().mockReturnValue({
      token: "test-token",
      clearToken: mockClearToken,
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchBoard", () => {
  it("calls /api/boards/{boardId} with Authorization header", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(initialData),
    });

    await fetchBoard("board-1");

    expect(fetch).toHaveBeenCalledWith(
      "/api/boards/board-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
  });

  it("clears token and throws on 401", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(fetchBoard("board-1")).rejects.toThrow("Unauthorized");
    expect(mockClearToken).toHaveBeenCalled();
  });

  it("throws on other non-ok responses", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(fetchBoard("board-1")).rejects.toThrow("Request failed: 500");
    expect(mockClearToken).not.toHaveBeenCalled();
  });
});

describe("updateBoard", () => {
  it("calls PATCH /api/boards/{boardId} with Authorization header and body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(initialData),
    });

    await updateBoard("board-1", initialData);

    expect(fetch).toHaveBeenCalledWith(
      "/api/boards/board-1",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(initialData),
      })
    );
  });

  it("clears token and throws on 401", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(updateBoard("board-1", initialData)).rejects.toThrow("Unauthorized");
    expect(mockClearToken).toHaveBeenCalled();
  });
});

import { useAuthStore } from "@/lib/auth";
import type { BoardData } from "@/lib/kanban";

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(resp: Response) {
  if (resp.status === 401) {
    useAuthStore.getState().clearToken();
    throw new Error("Unauthorized");
  }
  if (!resp.ok) {
    throw new Error(`Request failed: ${resp.status}`);
  }
  return resp.json();
}

export async function fetchBoard(): Promise<BoardData> {
  const resp = await fetch("/api/board", {
    headers: authHeaders(),
  });
  return handleResponse(resp);
}

export async function updateBoard(board: BoardData): Promise<BoardData> {
  const resp = await fetch("/api/board", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(board),
  });
  return handleResponse(resp);
}

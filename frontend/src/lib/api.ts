import { useAuthStore } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import type { BoardData } from "@/lib/kanban";
import type { ChatMessage } from "@/lib/chat";

export type ChatResponse = {
  message: string;
  board_update: BoardData | null;
};

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(resp: Response) {
  if (resp.status === 401) {
    useAuthStore.getState().clearToken();
    queryClient.clear();
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

export async function sendChat(
  messages: ChatMessage[],
  board: BoardData
): Promise<ChatResponse> {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ messages, board }),
  });
  return handleResponse(resp);
}

import { useAuthStore } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import type { BoardData, BoardSummary, Member, Card } from "@/lib/kanban";
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
  if (resp.status === 204) return null;
  return resp.json();
}

export async function fetchBoards(): Promise<BoardSummary[]> {
  const resp = await fetch("/api/boards", {
    headers: authHeaders(),
  });
  return handleResponse(resp);
}

export async function createBoard(title: string): Promise<BoardSummary> {
  const resp = await fetch("/api/boards", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ title }),
  });
  return handleResponse(resp);
}

export async function deleteBoard(boardId: string): Promise<void> {
  const resp = await fetch(`/api/boards/${boardId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse(resp);
}

export async function fetchBoard(boardId: string): Promise<BoardData> {
  const resp = await fetch(`/api/boards/${boardId}`, {
    headers: authHeaders(),
  });
  return handleResponse(resp);
}

export async function updateBoard(boardId: string, board: BoardData): Promise<BoardData> {
  const resp = await fetch(`/api/boards/${boardId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(board),
  });
  return handleResponse(resp);
}

export async function fetchMembers(boardId: string): Promise<Member[]> {
  const resp = await fetch(`/api/boards/${boardId}/members`, {
    headers: authHeaders(),
  });
  return handleResponse(resp);
}

export async function inviteMember(boardId: string, username: string): Promise<Member> {
  const resp = await fetch(`/api/boards/${boardId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ username }),
  });
  return handleResponse(resp);
}

export async function removeMember(boardId: string, username: string): Promise<void> {
  const resp = await fetch(`/api/boards/${boardId}/members/${username}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse(resp);
}

export async function assignCard(boardId: string, cardId: string, username: string | null): Promise<Card> {
  const resp = await fetch(`/api/boards/${boardId}/cards/${cardId}/assignee`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ username }),
  });
  return handleResponse(resp);
}

export async function sendChat(
  messages: ChatMessage[],
  board: BoardData,
  boardId: string
): Promise<ChatResponse> {
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ messages, board, board_id: boardId }),
  });
  return handleResponse(resp);
}

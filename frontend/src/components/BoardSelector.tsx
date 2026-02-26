"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Check } from "lucide-react";
import { useAuthStore } from "@/lib/auth";
import { useBoardStore } from "@/lib/boardStore";
import { fetchBoards, createBoard } from "@/lib/api";
import type { BoardSummary } from "@/lib/kanban";

export const BoardSelector = () => {
  const token = useAuthStore((s) => s.token);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const setActiveBoardId = useBoardStore((s) => s.setActiveBoardId);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: boards = [] } = useQuery({
    queryKey: ["boards"],
    queryFn: fetchBoards,
    enabled: !!token,
  });

  // Auto-select first board if none active or active board no longer in list
  useEffect(() => {
    if (boards.length === 0) return;
    const valid = boards.some((b: BoardSummary) => b.id === activeBoardId);
    if (!valid) {
      setActiveBoardId(boards[0].id);
    }
  }, [boards, activeBoardId, setActiveBoardId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [creating]);

  const activeBoard = boards.find((b: BoardSummary) => b.id === activeBoardId);

  const handleSelect = (id: string) => {
    setActiveBoardId(id);
    setOpen(false);
    setCreating(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || isCreating) return;
    setIsCreating(true);
    try {
      const board = await createBoard(title);
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
      setActiveBoardId(board.id);
      setNewTitle("");
      setCreating(false);
      setOpen(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-[var(--stroke)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--navy-dark)] shadow-sm transition hover:border-[var(--primary-blue)]"
      >
        <span className="max-w-[180px] truncate">{activeBoard?.title ?? "Select board"}</span>
        <ChevronDown size={14} className="shrink-0 text-[var(--gray-text)]" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-2xl border border-[var(--stroke)] bg-white p-1 shadow-[var(--shadow)]">
          {boards.map((board: BoardSummary) => (
            <button
              key={board.id}
              onClick={() => handleSelect(board.id)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[var(--navy-dark)] transition hover:bg-[var(--surface)]"
            >
              {board.id === activeBoardId && (
                <Check size={12} className="shrink-0 text-[var(--primary-blue)]" />
              )}
              <span className={board.id === activeBoardId ? "ml-0" : "ml-[20px]"}>
                {board.title}
              </span>
            </button>
          ))}

          <div className="my-1 border-t border-[var(--stroke)]" />

          {creating ? (
            <form onSubmit={handleCreate} className="flex gap-1 px-1 py-1">
              <input
                ref={inputRef}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Board name"
                className="flex-1 rounded-lg border border-[var(--stroke)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              />
              <button
                type="submit"
                disabled={!newTitle.trim() || isCreating}
                className="rounded-lg bg-[var(--secondary-purple)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                Add
              </button>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
            >
              <Plus size={14} />
              New board
            </button>
          )}
        </div>
      )}
    </div>
  );
};

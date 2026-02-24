"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth";
import { fetchBoard, updateBoard } from "@/lib/api";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { createId, moveCard, type BoardData } from "@/lib/kanban";

async function persist(queryClient: ReturnType<typeof useQueryClient>, newBoard: BoardData) {
  const previous = queryClient.getQueryData<BoardData>(["board"]);
  queryClient.setQueryData(["board"], newBoard);
  try {
    await updateBoard(newBoard);
    queryClient.invalidateQueries({ queryKey: ["board"] });
  } catch (err) {
    queryClient.setQueryData(["board"], previous);
    throw err;
  }
}

export const KanbanBoard = () => {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const token = useAuthStore((s) => s.token);
  const clearToken = useAuthStore((s) => s.clearToken);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: board, isLoading, isError } = useQuery({
    queryKey: ["board"],
    queryFn: fetchBoard,
    enabled: !!token,
  });

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } finally {
      clearToken();
      router.replace("/login");
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!board || !over || active.id === over.id) return;

    const newBoard: BoardData = {
      ...board,
      columns: moveCard(board.columns, active.id as string, over.id as string),
    };
    try {
      await persist(queryClient, newBoard);
    } catch {
      // persist already rolled back the query cache
    }
  };

  const handleRenameColumn = async (columnId: string, title: string) => {
    if (!board) return;
    const newBoard: BoardData = {
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    };
    try {
      await persist(queryClient, newBoard);
    } catch {
      // persist already rolled back the query cache
    }
  };

  const handleAddCard = async (columnId: string, title: string, details: string) => {
    if (!board) return;
    const id = createId("card");
    const newBoard: BoardData = {
      ...board,
      cards: {
        ...board.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    };
    try {
      await persist(queryClient, newBoard);
    } catch {
      // persist already rolled back the query cache
    }
  };

  const handleDeleteCard = async (columnId: string, cardId: string) => {
    if (!board) return;
    const newBoard: BoardData = {
      ...board,
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => id !== cardId)
      ),
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
          : column
      ),
    };
    try {
      await persist(queryClient, newBoard);
    } catch {
      // persist already rolled back the query cache
    }
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          Loading board...
        </p>
      </div>
    );
  }

  if (isError || !board) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-500">
          Failed to load board.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-xl border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition-colors hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
            >
              Sign out
            </button>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section
            className="grid gap-6"
            style={{ gridTemplateColumns: `repeat(${board.columns.length}, minmax(0, 1fr))` }}
          >
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
};

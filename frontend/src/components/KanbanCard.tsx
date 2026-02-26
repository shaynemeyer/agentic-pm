"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth";
import { fetchMembers, assignCard } from "@/lib/api";
import type { Card, Member } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  boardId: string;
  onDelete: (cardId: string) => void;
};

export const KanbanCard = ({ card, boardId, onDelete }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [editingAssignee, setEditingAssignee] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["members", boardId],
    queryFn: () => fetchMembers(boardId),
    enabled: !!token && !!boardId,
  });

  const handleAssignChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setAssigning(true);
    try {
      await assignCard(boardId, card.id, value === "" ? null : value);
      queryClient.invalidateQueries({ queryKey: ["board", boardId] });
    } finally {
      setAssigning(false);
      setEditingAssignee(false);
    }
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
            {card.title}
          </h4>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
            {card.details}
          </p>
          {card.created_by && (
            <p className="mt-2 text-xs text-[var(--gray-text)]">
              <span className="font-semibold">Created by:</span> {card.created_by}
            </p>
          )}
          <div className="mt-1 text-xs text-[var(--gray-text)]">
            <span className="font-semibold">Assigned to:</span>{" "}
            {editingAssignee ? (
              <select
                autoFocus
                defaultValue={card.assigned_to ?? ""}
                onChange={handleAssignChange}
                onBlur={() => setEditingAssignee(false)}
                disabled={assigning}
                className="rounded border border-[var(--stroke)] bg-[var(--surface)] px-1 py-0.5 text-xs text-[var(--navy-dark)] outline-none"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="">Unassigned</option>
                {members.map((m: Member) => (
                  <option key={m.user_id} value={m.username}>
                    {m.username}
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingAssignee(true);
                }}
                className="underline decoration-dotted hover:text-[var(--navy-dark)]"
              >
                {card.assigned_to ?? "Unassigned"}
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(card.id);
          }}
          className="rounded-full border border-transparent p-1.5 text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
          aria-label={`Delete ${card.title}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
};

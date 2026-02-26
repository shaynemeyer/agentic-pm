"use client";

import { useState } from "react";
import { Users, UserPlus, UserMinus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth";
import { fetchMembers, inviteMember, removeMember } from "@/lib/api";
import type { BoardSummary, Member } from "@/lib/kanban";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type MembersPanelProps = {
  boardId: string;
  board: BoardSummary;
};

export const MembersPanel = ({ boardId, board }: MembersPanelProps) => {
  const username = useAuthStore((s) => s.username);
  const queryClient = useQueryClient();
  const isOwner = username === board.owner_username;

  const [inviteUsername, setInviteUsername] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ["members", boardId],
    queryFn: () => fetchMembers(boardId),
    enabled: !!boardId,
  });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = inviteUsername.trim();
    if (!name || inviting) return;
    setInviting(true);
    setInviteError(null);
    try {
      await inviteMember(boardId, name);
      setInviteUsername("");
      queryClient.invalidateQueries({ queryKey: ["members", boardId] });
    } catch {
      setInviteError("Could not invite user. Check the username and try again.");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberUsername: string) => {
    try {
      await removeMember(boardId, memberUsername);
      queryClient.invalidateQueries({ queryKey: ["members", boardId] });
    } catch {
      // ignore
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="flex items-center gap-2 rounded-xl border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition-colors hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]">
          <Users size={14} />
          Members
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-[340px] flex-col border-l border-[var(--stroke)] bg-white p-0 sm:max-w-[340px]"
      >
        <SheetHeader className="border-b border-[var(--stroke)] px-5 py-4">
          <SheetTitle className="font-display text-base font-semibold text-[var(--navy-dark)]">
            Board Members
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 py-4">
          {members.map((member: Member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between rounded-xl border border-[var(--stroke)] px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--navy-dark)]">
                  {member.username}
                </span>
                {member.username === board.owner_username && (
                  <span className="rounded-full border border-[var(--accent-yellow)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--navy-dark)]">
                    Owner
                  </span>
                )}
              </div>
              {isOwner && member.username !== board.owner_username && (
                <button
                  onClick={() => handleRemove(member.username)}
                  className="rounded-full border border-transparent p-1 text-[var(--gray-text)] transition hover:border-red-200 hover:text-red-500"
                  aria-label={`Remove ${member.username}`}
                >
                  <UserMinus size={14} />
                </button>
              )}
            </div>
          ))}

          {members.length === 0 && (
            <p className="text-center text-sm text-[var(--gray-text)]">No members yet.</p>
          )}
        </div>

        {isOwner && (
          <div className="border-t border-[var(--stroke)] px-5 py-4">
            <form onSubmit={handleInvite} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="Username to invite"
                  className="flex-1 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                />
                <button
                  type="submit"
                  disabled={!inviteUsername.trim() || inviting}
                  className="flex items-center gap-1 rounded-xl bg-[var(--secondary-purple)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <UserPlus size={13} />
                  Invite
                </button>
              </div>
              {inviteError && (
                <p className="text-xs text-red-500">{inviteError}</p>
              )}
            </form>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ChatSidebar } from "@/components/chat/ChatSidebar";

export default function Home() {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  if (!token) return null;

  return (
    <>
      <KanbanBoard />
      <ChatSidebar />
    </>
  );
}

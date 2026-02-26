import { create } from "zustand";
import { persist } from "zustand/middleware";

type BoardState = {
  activeBoardId: string | null;
  setActiveBoardId: (id: string) => void;
};

export const useBoardStore = create<BoardState>()(
  persist(
    (set) => ({
      activeBoardId: null,
      setActiveBoardId: (id) => set({ activeBoardId: id }),
    }),
    { name: "board" }
  )
);

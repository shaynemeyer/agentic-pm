import { create } from "zustand";
import { persist } from "zustand/middleware";

type AuthState = {
  token: string | null;
  userId: string | null;
  username: string | null;
  setSession: (token: string, userId: string, username: string) => void;
  clearToken: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      username: null,
      setSession: (token, userId, username) => set({ token, userId, username }),
      clearToken: () => set({ token: null, userId: null, username: null }),
    }),
    { name: "auth" }
  )
);

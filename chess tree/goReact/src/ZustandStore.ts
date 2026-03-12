import { create } from "zustand";

export type AuthUser = {
  _id: string;
  email: string;
  fullname: string;
};

type AuthState = {
  user: AuthUser | null;
  isAuthReady: boolean;
  setUser: (user: AuthUser | null) => void;
  setAuthReady: (ready: boolean) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthReady: false,
  setUser: (user) => set({ user }),
  setAuthReady: (ready) => set({ isAuthReady: ready }),
}));

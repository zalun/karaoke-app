import { create } from "zustand";

type View = "search" | "queue" | "library";

interface AppState {
  currentView: View;
  isVideoDetached: boolean;
  searchQuery: string;

  // Actions
  setView: (view: View) => void;
  setVideoDetached: (detached: boolean) => void;
  setSearchQuery: (query: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: "search",
  isVideoDetached: false,
  searchQuery: "",

  setView: (currentView) => set({ currentView }),
  setVideoDetached: (isVideoDetached) => set({ isVideoDetached }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));

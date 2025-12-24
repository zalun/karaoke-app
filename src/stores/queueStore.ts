import { create } from "zustand";
import type { Video } from "./playerStore";

export interface QueueItem {
  id: string;
  video: Video;
  position: number;
  status: "pending" | "playing" | "completed" | "skipped";
  addedAt: Date;
}

interface QueueState {
  items: QueueItem[];
  currentIndex: number;
  isLoading: boolean;

  // Actions
  addToQueue: (video: Video) => void;
  removeFromQueue: (itemId: string) => void;
  reorder: (itemId: string, newPosition: number) => void;
  playNext: () => QueueItem | null;
  clearQueue: () => void;
  setCurrentIndex: (index: number) => void;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  items: [],
  currentIndex: -1,
  isLoading: false,

  addToQueue: (video) => {
    const newItem: QueueItem = {
      id: crypto.randomUUID(),
      video,
      position: get().items.length,
      status: "pending",
      addedAt: new Date(),
    };
    set((state) => ({ items: [...state.items, newItem] }));
  },

  removeFromQueue: (itemId) => {
    set((state) => ({
      items: state.items
        .filter((item) => item.id !== itemId)
        .map((item, index) => ({ ...item, position: index })),
    }));
  },

  reorder: (itemId, newPosition) => {
    set((state) => {
      const items = [...state.items];
      const currentIndex = items.findIndex((item) => item.id === itemId);
      if (currentIndex === -1) return state;

      const [item] = items.splice(currentIndex, 1);
      items.splice(newPosition, 0, item);

      return {
        items: items.map((item, index) => ({ ...item, position: index })),
      };
    });
  },

  playNext: () => {
    const { items, currentIndex } = get();
    const nextIndex = currentIndex + 1;

    if (nextIndex >= items.length) {
      return null;
    }

    set((state) => ({
      currentIndex: nextIndex,
      items: state.items.map((item, index) => ({
        ...item,
        status:
          index === nextIndex
            ? "playing"
            : index < nextIndex
              ? "completed"
              : "pending",
      })),
    }));

    return items[nextIndex];
  },

  clearQueue: () => {
    set({ items: [], currentIndex: -1 });
  },

  setCurrentIndex: (index) => {
    set({ currentIndex: index });
  },
}));

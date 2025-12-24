import { create } from "zustand";
import type { Video } from "./playerStore";

export interface QueueItem {
  id: string;
  video: Video;
  addedAt: Date;
}

interface QueueState {
  queue: QueueItem[];
  history: QueueItem[];
  historyIndex: number; // -1 means "at end of history", otherwise index of current position

  // Actions
  addToQueue: (video: Video) => void;
  removeFromQueue: (itemId: string) => void;
  reorderQueue: (itemId: string, newPosition: number) => void;
  clearQueue: () => void;
  clearHistory: () => void;

  // Playback actions - return the item to play (or null)
  playDirect: (video: Video) => QueueItem; // Play directly (e.g., from search) - adds to history
  playFromQueue: (index: number) => QueueItem | null;
  playFromHistory: (index: number) => QueueItem | null;
  playNext: () => QueueItem | null;
  playPrevious: () => QueueItem | null;

  // State queries
  getCurrentItem: () => QueueItem | null;
  hasNext: () => boolean;
  hasPrevious: () => boolean;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  queue: [],
  history: [],
  historyIndex: -1,

  addToQueue: (video) => {
    const newItem: QueueItem = {
      id: crypto.randomUUID(),
      video,
      addedAt: new Date(),
    };
    set((state) => ({ queue: [...state.queue, newItem] }));
  },

  removeFromQueue: (itemId) => {
    set((state) => ({
      queue: state.queue.filter((item) => item.id !== itemId),
    }));
  },

  reorderQueue: (itemId, newPosition) => {
    set((state) => {
      const queue = [...state.queue];
      const currentIndex = queue.findIndex((item) => item.id === itemId);
      if (currentIndex === -1) return state;

      const [item] = queue.splice(currentIndex, 1);
      queue.splice(newPosition, 0, item);

      return { queue };
    });
  },

  clearQueue: () => {
    set({ queue: [] });
  },

  clearHistory: () => {
    set({ history: [], historyIndex: -1 });
  },

  playDirect: (video) => {
    const newItem: QueueItem = {
      id: crypto.randomUUID(),
      video,
      addedAt: new Date(),
    };

    set((state) => ({
      history: [...state.history, newItem],
      historyIndex: -1, // Reset to end of history
    }));

    return newItem;
  },

  playFromQueue: (index) => {
    const { queue, history } = get();

    if (index < 0 || index >= queue.length) {
      return null;
    }

    const item = queue[index];
    const newQueue = queue.filter((_, i) => i !== index);
    const newHistory = [...history, item];

    set({
      queue: newQueue,
      history: newHistory,
      historyIndex: -1, // Reset to end of history
    });

    return item;
  },

  playFromHistory: (index) => {
    const { history } = get();

    if (index < 0 || index >= history.length) {
      return null;
    }

    set({ historyIndex: index });

    return history[index];
  },

  playNext: () => {
    const { queue, history, historyIndex } = get();

    // Calculate effective index (convert -1 to actual end index)
    const effectiveIndex = historyIndex === -1 ? history.length - 1 : historyIndex;

    // Check if there are more items ahead in history
    if (effectiveIndex < history.length - 1) {
      const nextIndex = effectiveIndex + 1;
      set({ historyIndex: nextIndex });
      return history[nextIndex];
    }

    // Otherwise, take from queue
    if (queue.length === 0) {
      return null;
    }

    const item = queue[0];
    const newQueue = queue.slice(1);
    const newHistory = [...history, item];

    set({
      queue: newQueue,
      history: newHistory,
      historyIndex: -1, // Reset to end
    });

    return item;
  },

  playPrevious: () => {
    const { history, historyIndex } = get();

    if (history.length === 0) {
      return null;
    }

    // Calculate effective index
    const effectiveIndex = historyIndex === -1 ? history.length - 1 : historyIndex;

    // Check if we can go back
    if (effectiveIndex <= 0) {
      return null;
    }

    const prevIndex = effectiveIndex - 1;
    set({ historyIndex: prevIndex });

    return history[prevIndex];
  },

  getCurrentItem: () => {
    const { history, historyIndex } = get();

    if (history.length === 0) {
      return null;
    }

    const effectiveIndex = historyIndex === -1 ? history.length - 1 : historyIndex;
    return history[effectiveIndex] || null;
  },

  hasNext: () => {
    const { queue, history, historyIndex } = get();
    const effectiveIndex = historyIndex === -1 ? history.length - 1 : historyIndex;

    // Has next if there's more in history ahead OR items in queue
    return effectiveIndex < history.length - 1 || queue.length > 0;
  },

  hasPrevious: () => {
    const { history, historyIndex } = get();

    if (history.length === 0) {
      return false;
    }

    const effectiveIndex = historyIndex === -1 ? history.length - 1 : historyIndex;
    return effectiveIndex > 0;
  },
}));

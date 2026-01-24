import { create } from "zustand";
import { createLogger, queueService, type QueueItemData } from "../services";
import type { Video } from "./playerStore";
import { useSettingsStore, SETTINGS_KEYS } from "./settingsStore";
import { useSessionStore } from "./sessionStore";

const log = createLogger("QueueStore");

// Track pending database operations to ensure they complete before session transitions
const pendingOperations = new Set<Promise<unknown>>();

// Helper to track a promise and remove it when done
function trackOperation<T>(promise: Promise<T>): Promise<T> {
  pendingOperations.add(promise);
  promise.finally(() => {
    pendingOperations.delete(promise);
  });
  return promise;
}

// Wait for all pending operations to complete
export async function flushPendingOperations(): Promise<void> {
  if (pendingOperations.size > 0) {
    log.debug(`Flushing ${pendingOperations.size} pending operations`);
    // Use allSettled to wait for all operations even if some fail
    await Promise.allSettled(pendingOperations);
    log.debug("All pending operations flushed");
  }
}

// Helper to convert QueueItem to QueueItemData for persistence
function toQueueItemData(item: QueueItem, position: number): QueueItemData {
  return {
    id: item.id,
    video_id: item.video.id,
    title: item.video.title,
    artist: item.video.artist,
    duration: item.video.duration,
    thumbnail_url: item.video.thumbnailUrl,
    source: item.video.source,
    youtube_id: item.video.youtubeId,
    file_path: item.video.filePath,
    position,
    added_at: item.addedAt.toISOString(),
  };
}

// Helper to convert QueueItemData to QueueItem
function fromQueueItemData(data: QueueItemData): QueueItem {
  return {
    id: data.id,
    video: {
      id: data.video_id,
      title: data.title,
      artist: data.artist,
      duration: data.duration,
      thumbnailUrl: data.thumbnail_url,
      source: data.source as "youtube" | "local" | "external",
      youtubeId: data.youtube_id,
      filePath: data.file_path,
    },
    addedAt: new Date(data.added_at),
  };
}

export interface QueueItem {
  id: string;
  video: Video;
  addedAt: Date;
}

interface QueueState {
  queue: QueueItem[];
  history: QueueItem[];
  historyIndex: number; // -1 means "at end of history", otherwise index of current position
  isInitialized: boolean;

  // Persistence actions
  loadPersistedState: () => Promise<void>;
  resetState: () => void;

  // Actions
  addToQueue: (video: Video) => Promise<QueueItem>;
  addToQueueNext: (video: Video) => QueueItem;
  removeFromQueue: (itemId: string) => void;
  reorderQueue: (itemId: string, newPosition: number) => void;
  clearQueue: () => void;
  fairShuffle: () => Promise<void>;
  clearHistory: () => void;
  moveAllHistoryToQueue: () => void;

  // Playback actions - return the item to play (or null)
  playDirect: (video: Video) => QueueItem; // Play directly (e.g., from search) - adds to history
  playFromQueue: (index: number) => QueueItem | null;
  playFromHistory: (index: number) => QueueItem | null;
  playNext: () => QueueItem | null; // For "next" button - may continue through history
  playNextFromQueue: () => QueueItem | null; // For auto-play when song ends - always takes from queue
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
  isInitialized: false,

  loadPersistedState: async () => {
    log.info("Loading persisted queue state");
    try {
      const state = await queueService.getState();
      if (state) {
        const queue = state.queue.map(fromQueueItemData);
        const history = state.history.map(fromQueueItemData);
        // Validate historyIndex is within bounds
        let historyIndex = state.history_index;
        let indexCorrected = false;
        if (history.length === 0) {
          if (historyIndex !== -1) indexCorrected = true;
          historyIndex = -1;
        } else if (historyIndex >= history.length) {
          indexCorrected = true;
          historyIndex = history.length - 1;
        } else if (historyIndex < -1) {
          indexCorrected = true;
          historyIndex = -1;
        }

        // Persist corrected index back to database (tracked for session transitions)
        if (indexCorrected) {
          log.info(`Correcting out-of-bounds historyIndex: ${state.history_index} -> ${historyIndex}`);
          trackOperation(
            queueService.setHistoryIndex(historyIndex).catch((error) => {
              log.error("Failed to persist corrected history index:", error);
            })
          );
        }

        set({
          queue,
          history,
          historyIndex,
          isInitialized: true,
        });
        log.info(
          `Loaded ${queue.length} queue items, ${history.length} history items (index: ${historyIndex})`
        );
      } else {
        set({ isInitialized: true });
        log.debug("No persisted state found (no active session)");
      }
    } catch (error) {
      log.error("Failed to load persisted state:", error);
      set({ isInitialized: true });
    }
  },

  resetState: () => {
    log.info("Resetting queue state");
    set({
      queue: [],
      history: [],
      historyIndex: -1,
      isInitialized: false,
    });
  },

  addToQueue: async (video) => {
    log.info(`addToQueue: ${video.title}`);
    const newItem: QueueItem = {
      id: crypto.randomUUID(),
      video,
      addedAt: new Date(),
    };

    // Check if fair queue is enabled and we have an active singer
    const fairQueueEnabled =
      useSettingsStore.getState().getSetting(SETTINGS_KEYS.FAIR_QUEUE_ENABLED) === "true";
    const { activeSingerId } = useSessionStore.getState();

    if (fairQueueEnabled && activeSingerId !== null) {
      // Fair queue mode: compute fair position and insert there
      log.debug(`Fair queue enabled, computing position for singer ${activeSingerId}`);

      try {
        // Get the fair position for this singer
        const fairPosition = await queueService.computeFairPosition(activeSingerId);
        log.debug(`Fair position for singer ${activeSingerId}: ${fairPosition}`);

        // Add item to database (appends to end)
        await queueService.addItem(toQueueItemData(newItem, 0));

        // Reorder to the fair position
        await queueService.reorder(newItem.id, fairPosition);

        // Update UI to reflect the correct position
        set((state) => {
          const queue = [...state.queue];
          queue.splice(fairPosition, 0, newItem);
          log.debug(`Queue size: ${state.queue.length} -> ${queue.length}, inserted at position ${fairPosition}`);
          return { queue };
        });
      } catch (error) {
        log.error("Failed to add queue item with fair position:", error);
        // Fallback: add to end of queue
        set((state) => {
          const newQueue = [...state.queue, newItem];
          log.debug(`Fallback: Queue size: ${state.queue.length} -> ${newQueue.length}`);
          return { queue: newQueue };
        });
        // Try to persist at end position
        trackOperation(
          queueService.addItem(toQueueItemData(newItem, get().queue.length - 1)).catch((e) => {
            log.error("Failed to persist fallback queue item:", e);
          })
        );
      }
    } else {
      // Standard mode: append to end
      set((state) => {
        const newQueue = [...state.queue, newItem];
        const position = newQueue.length - 1;
        log.debug(`Queue size: ${state.queue.length} -> ${newQueue.length}`);

        // Persist to database (tracked for session transitions)
        trackOperation(
          queueService.addItem(toQueueItemData(newItem, position)).catch((error) => {
            log.error("Failed to persist queue item:", error);
          })
        );

        return { queue: newQueue };
      });
    }

    return newItem;
  },

  addToQueueNext: (video) => {
    log.info(`addToQueueNext: ${video.title}`);
    const newItem: QueueItem = {
      id: crypto.randomUUID(),
      video,
      addedAt: new Date(),
    };
    set((state) => {
      // Insert at the beginning of the queue
      const newQueue = [newItem, ...state.queue];
      log.debug(`Queue size: ${state.queue.length} -> ${newQueue.length}`);

      // Persist to database: add item then reorder to position 0.
      // The backend always adds to the end, so we need to reorder after adding.
      // Note: There's a small race window between add and reorder where a crash
      // could leave the item at the wrong position. This is acceptable for a
      // single-user desktop app where the window is extremely small.
      // Position 0 passed here is a placeholder; actual position is set by reorder.
      trackOperation(
        queueService
          .addItem(toQueueItemData(newItem, 0))
          .then(() => queueService.reorder(newItem.id, 0))
          .catch((error) => {
            log.error("Failed to persist queue item at top:", error);
          })
      );

      return { queue: newQueue };
    });
    return newItem;
  },

  removeFromQueue: (itemId) => {
    log.debug(`removeFromQueue: ${itemId}`);
    set((state) => {
      // Persist to database (tracked for session transitions)
      trackOperation(
        queueService.removeItem(itemId).catch((error) => {
          log.error("Failed to remove queue item from database:", error);
        })
      );

      return { queue: state.queue.filter((item) => item.id !== itemId) };
    });
  },

  reorderQueue: (itemId, newPosition) => {
    log.debug(`reorderQueue: ${itemId} -> position ${newPosition}`);
    set((state) => {
      const queue = [...state.queue];
      const currentIndex = queue.findIndex((item) => item.id === itemId);
      if (currentIndex === -1) return state;

      const [item] = queue.splice(currentIndex, 1);
      queue.splice(newPosition, 0, item);

      // Persist to database (tracked for session transitions)
      trackOperation(
        queueService.reorder(itemId, newPosition).catch((error) => {
          log.error("Failed to reorder queue item in database:", error);
        })
      );

      return { queue };
    });
  },

  clearQueue: () => {
    log.info("clearQueue");

    // Persist to database (tracked for session transitions)
    trackOperation(
      queueService.clearQueue().catch((error) => {
        log.error("Failed to clear queue in database:", error);
      })
    );

    set({ queue: [] });
  },

  fairShuffle: async () => {
    const { queue } = get();
    if (queue.length <= 1) {
      log.debug("fairShuffle: queue too small, nothing to shuffle");
      return;
    }

    log.info(`fairShuffle: shuffling ${queue.length} items`);

    try {
      // Shuffle on backend (reorganizes positions in database)
      await queueService.fairShuffle();

      // Reload queue from backend to get new order
      const state = await queueService.getState();
      if (state) {
        const newQueue = state.queue.map(fromQueueItemData);
        set({ queue: newQueue });
        log.info(`fairShuffle: reloaded ${newQueue.length} items`);
      }
    } catch (error) {
      log.error("Failed to fair shuffle queue:", error);
      throw error;
    }
  },

  clearHistory: () => {
    log.info("clearHistory");

    // Persist to database (tracked for session transitions)
    trackOperation(
      queueService.clearHistory().catch((error) => {
        log.error("Failed to clear history in database:", error);
      })
    );

    set({ history: [], historyIndex: -1 });
  },

  moveAllHistoryToQueue: () => {
    const { history, queue } = get();
    if (history.length === 0) {
      log.debug("moveAllHistoryToQueue: history empty, nothing to move");
      return;
    }

    log.info(`moveAllHistoryToQueue: moving ${history.length} items`);

    // Store previous state for rollback
    const previousQueue = queue;
    const previousHistory = history;
    const previousHistoryIndex = get().historyIndex;

    // Optimistically update UI
    set({
      queue: [...queue, ...history],
      history: [],
      historyIndex: -1,
    });

    // Persist to database with rollback on failure (tracked for session transitions)
    trackOperation(
      queueService.moveAllHistoryToQueue().catch((error) => {
        log.error("Failed to move history to queue in database, reverting:", error);
        // Revert to previous state on failure
        set({
          queue: previousQueue,
          history: previousHistory,
          historyIndex: previousHistoryIndex,
        });
      })
    );
  },

  playDirect: (video) => {
    log.info(`playDirect: ${video.title}`);
    const newItem: QueueItem = {
      id: crypto.randomUUID(),
      video,
      addedAt: new Date(),
    };

    set((state) => {
      const newHistory = [...state.history, newItem];
      const position = newHistory.length - 1;

      // Persist to database (add directly to history, tracked for session transitions)
      trackOperation(
        queueService.addToHistory(toQueueItemData(newItem, position)).catch((error) => {
          log.error("Failed to persist history item:", error);
        })
      );

      // Also persist history index reset (tracked for session transitions)
      trackOperation(
        queueService.setHistoryIndex(-1).catch((error) => {
          log.error("Failed to persist history index:", error);
        })
      );

      return {
        history: newHistory,
        historyIndex: -1,
      };
    });

    return newItem;
  },

  playFromQueue: (index) => {
    const { queue, history } = get();

    if (index < 0 || index >= queue.length) {
      log.warn(`playFromQueue: invalid index ${index}`);
      return null;
    }

    const item = queue[index];
    log.info(`playFromQueue: ${item.video.title} (index ${index})`);
    const newQueue = queue.filter((_, i) => i !== index);
    const newHistory = [...history, item];

    // Persist to database (move from queue to history, tracked for session transitions)
    trackOperation(
      queueService.moveToHistory(item.id).catch((error) => {
        log.error("Failed to move item to history in database:", error);
      })
    );

    // Also persist history index reset (tracked for session transitions)
    trackOperation(
      queueService.setHistoryIndex(-1).catch((error) => {
        log.error("Failed to persist history index:", error);
      })
    );

    set({
      queue: newQueue,
      history: newHistory,
      historyIndex: -1,
    });

    return item;
  },

  playFromHistory: (index) => {
    const { history } = get();

    if (index < 0 || index >= history.length) {
      log.warn(`playFromHistory: invalid index ${index}`);
      return null;
    }

    log.info(`playFromHistory: ${history[index].video.title} (index ${index})`);

    // Persist history index (tracked for session transitions)
    trackOperation(
      queueService.setHistoryIndex(index).catch((error) => {
        log.error("Failed to persist history index:", error);
      })
    );

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
      log.info(`playNext: from history - ${history[nextIndex].video.title}`);

      // Persist history index (tracked for session transitions)
      trackOperation(
        queueService.setHistoryIndex(nextIndex).catch((error) => {
          log.error("Failed to persist history index:", error);
        })
      );

      set({ historyIndex: nextIndex });
      return history[nextIndex];
    }

    // Otherwise, take from queue
    if (queue.length === 0) {
      log.debug("playNext: queue empty");
      return null;
    }

    const item = queue[0];
    log.info(`playNext: from queue - ${item.video.title}`);
    const newQueue = queue.slice(1);
    const newHistory = [...history, item];

    // Persist to database (move from queue to history, tracked for session transitions)
    trackOperation(
      queueService.moveToHistory(item.id).catch((error) => {
        log.error("Failed to move item to history in database:", error);
      })
    );

    // Also persist history index reset (tracked for session transitions)
    trackOperation(
      queueService.setHistoryIndex(-1).catch((error) => {
        log.error("Failed to persist history index:", error);
      })
    );

    set({
      queue: newQueue,
      history: newHistory,
      historyIndex: -1,
    });

    return item;
  },

  playNextFromQueue: () => {
    // Always take from queue, ignoring history position.
    // Used for auto-play when a song ends naturally.
    const { queue, history } = get();

    if (queue.length === 0) {
      log.debug("playNextFromQueue: queue empty");
      return null;
    }

    const item = queue[0];
    log.info(`playNextFromQueue: ${item.video.title}`);
    const newQueue = queue.slice(1);
    const newHistory = [...history, item];

    // Persist to database (move from queue to history, tracked for session transitions)
    trackOperation(
      queueService.moveToHistory(item.id).catch((error) => {
        log.error("Failed to move item to history in database:", error);
      })
    );

    // Reset history index to end (tracked for session transitions)
    trackOperation(
      queueService.setHistoryIndex(-1).catch((error) => {
        log.error("Failed to persist history index:", error);
      })
    );

    set({
      queue: newQueue,
      history: newHistory,
      historyIndex: -1,
    });

    return item;
  },

  playPrevious: () => {
    const { history, historyIndex } = get();

    if (history.length === 0) {
      log.debug("playPrevious: history empty");
      return null;
    }

    // Calculate effective index
    const effectiveIndex = historyIndex === -1 ? history.length - 1 : historyIndex;

    // Check if we can go back
    if (effectiveIndex <= 0) {
      log.debug("playPrevious: at start of history");
      return null;
    }

    const prevIndex = effectiveIndex - 1;
    log.info(`playPrevious: ${history[prevIndex].video.title}`);

    // Persist history index (tracked for session transitions)
    trackOperation(
      queueService.setHistoryIndex(prevIndex).catch((error) => {
        log.error("Failed to persist history index:", error);
      })
    );

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

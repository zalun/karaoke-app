import { create } from "zustand";

export interface Video {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
  thumbnailUrl?: string;
  source: "youtube" | "local" | "external";
  youtubeId?: string;
  filePath?: string;
  streamUrl?: string;
}

interface PlayerState {
  currentVideo: Video | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  isLoading: boolean;
  error: string | null;
  seekTime: number | null;

  // Actions
  setCurrentVideo: (video: Video | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setIsFullscreen: (fullscreen: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  seekTo: (time: number) => void;
  clearSeek: () => void;
  reset: () => void;
}

const initialState = {
  currentVideo: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  isFullscreen: false,
  isLoading: false,
  error: null,
  seekTime: null,
};

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initialState,

  setCurrentVideo: (video) => set({ currentVideo: video, error: null }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume, isMuted: volume === 0 }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  seekTo: (time) => set({ seekTime: time }),
  clearSeek: () => set({ seekTime: null }),
  reset: () => set(initialState),
}));

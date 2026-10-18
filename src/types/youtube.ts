export interface SearchResult {
  id: string;
  title: string;
  channel: string;
  duration?: number;
  thumbnail?: string;
  view_count?: number;
}

export interface StreamInfo {
  url: string;
  /** Separate audio stream; set when the video URL is video-only */
  audio_url?: string | null;
  format: string;
  quality: string;
}

export interface VideoInfo {
  id: string;
  title: string;
  channel: string;
  duration?: number;
  thumbnail?: string;
  description?: string;
}

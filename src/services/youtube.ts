import { invoke } from "@tauri-apps/api/core";
import type { SearchResult, StreamInfo, VideoInfo } from "../types";

export type SearchMethod = "api" | "ytdlp" | "none";

export const youtubeService = {
  /**
   * Search using yt-dlp (legacy method)
   */
  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    return invoke<SearchResult[]>("youtube_search", {
      query,
      maxResults,
    });
  },

  /**
   * Search using YouTube Data API v3
   * Requires API key to be configured in settings
   */
  async apiSearch(query: string, maxResults = 10): Promise<SearchResult[]> {
    return invoke<SearchResult[]>("youtube_api_search", {
      query,
      maxResults,
    });
  },

  /**
   * Validate the currently saved YouTube API key
   * SECURITY: Key is read from database on backend, not passed as parameter
   */
  async validateApiKey(): Promise<boolean> {
    return invoke<boolean>("youtube_validate_api_key");
  },

  /**
   * Get the current search method based on configuration
   * Returns "api" | "ytdlp" | "none"
   */
  async getSearchMethod(): Promise<SearchMethod> {
    return invoke<SearchMethod>("youtube_get_search_method");
  },

  async getStreamUrl(videoId: string): Promise<StreamInfo> {
    return invoke<StreamInfo>("youtube_get_stream_url", { videoId });
  },

  async getVideoInfo(videoId: string): Promise<VideoInfo> {
    return invoke<VideoInfo>("youtube_get_info", { videoId });
  },

  async checkAvailable(): Promise<boolean> {
    return invoke<boolean>("youtube_check_available");
  },

  async installYtDlp(method: "brew" | "pip" | "curl"): Promise<{ success: boolean; message: string; output: string }> {
    return invoke<{ success: boolean; message: string; output: string }>("youtube_install_ytdlp", { method });
  },
};

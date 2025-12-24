import { invoke } from "@tauri-apps/api/core";
import type { SearchResult, StreamInfo, VideoInfo } from "../types";

export const youtubeService = {
  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    return invoke<SearchResult[]>("youtube_search", {
      query,
      maxResults,
    });
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

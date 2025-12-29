import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "./logger";
import type { FavoriteVideo, SingerFavorite } from "./session";

const log = createLogger("FavoritesService");

export const favoritesService = {
  async addFavorite(
    singerId: number,
    video: FavoriteVideo
  ): Promise<SingerFavorite> {
    log.info(`Adding favorite for singer ${singerId}: ${video.title}`);
    return await invoke<SingerFavorite>("add_favorite", { singerId, video });
  },

  async removeFavorite(singerId: number, videoId: string): Promise<void> {
    log.info(`Removing favorite for singer ${singerId}: ${videoId}`);
    await invoke("remove_favorite", { singerId, videoId });
  },

  async getSingerFavorites(singerId: number): Promise<SingerFavorite[]> {
    log.debug(`Getting favorites for singer ${singerId}`);
    return await invoke<SingerFavorite[]>("get_singer_favorites", { singerId });
  },

  async bulkAddFavorites(
    singerId: number,
    videos: FavoriteVideo[]
  ): Promise<SingerFavorite[]> {
    log.info(`Bulk adding ${videos.length} favorites for singer ${singerId}`);
    return await invoke<SingerFavorite[]>("bulk_add_favorites", {
      singerId,
      videos,
    });
  },

  /** Check which singers have a video favorited (efficient single query) */
  async checkVideoFavorites(videoId: string): Promise<number[]> {
    log.debug(`Checking favorites for video ${videoId}`);
    return await invoke<number[]>("check_video_favorites", { videoId });
  },
};

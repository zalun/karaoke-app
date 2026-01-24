export { youtubeService } from "./youtube";
export { windowManager } from "./windowManager";
export { keepAwakeService } from "./keepAwake";
export { mediaControlsService } from "./mediaControls";
export type { MediaControlsMetadata } from "./mediaControls";
export { displayManagerService } from "./displayManager";
export type {
  DisplayInfo,
  DisplayConfiguration,
  SavedDisplayConfig,
  WindowState,
} from "./displayManager";
export { logger, createLogger } from "./logger";
export { authService } from "./auth";
export type { AuthTokens, User } from "./auth";
export { createAnonClient, createAuthenticatedClient, isSupabaseConfigured } from "./supabase";
export { sessionService } from "./session";
export type { Singer, Session, FavoriteVideo, SingerFavorite } from "./session";
export { queueService } from "./queue";
export type { QueueItemData, QueueState } from "./queue";
export { favoritesService } from "./favorites";
export { updateService } from "./update";
export type { UpdateInfo } from "./update";
export {
  hostedSessionService,
  getPersistedSessionId,
  persistSessionId,
  clearPersistedSessionId,
} from "./hostedSession";
export type { HostedSession, SessionStats } from "./hostedSession";
export {
  loadYouTubeAPI,
  isYouTubeAPIReady,
  YouTubePlayerState,
  YouTubeErrorCodes,
  getYouTubeErrorMessage,
} from "./youtubeIframe";

/**
 * Extract error message from unknown error type
 * @param err - The caught error (unknown type)
 * @param fallback - Fallback message if error is not an Error instance
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

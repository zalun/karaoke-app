/**
 * TypeScript definitions for YouTube IFrame Player API
 * @see https://developers.google.com/youtube/iframe_api_reference
 */

declare namespace YT {
  /** Player state values */
  const PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };

  /** Player error codes */
  const PlayerError: {
    INVALID_PARAM: 2;
    HTML5_ERROR: 5;
    NOT_FOUND: 100;
    NOT_ALLOWED: 101;
    NOT_ALLOWED_DISGUISED: 150;
  };

  interface PlayerVars {
    /** Auto-play the video. 0 = no (default), 1 = yes */
    autoplay?: 0 | 1;
    /** Show player controls. 0 = hide, 1 = show (default) */
    controls?: 0 | 1;
    /** Disable keyboard controls. 0 = enabled (default), 1 = disabled */
    disablekb?: 0 | 1;
    /** Enable fullscreen button. 0 = disabled, 1 = enabled (default) */
    fs?: 0 | 1;
    /** Hide YouTube logo. 0 = show (default), 1 = modest branding (minimal logo) */
    modestbranding?: 0 | 1;
    /** Show related videos. 0 = same channel only, 1 = any (default) */
    rel?: 0 | 1;
    /** Show video annotations. 1 = show (default), 3 = hide */
    iv_load_policy?: 1 | 3;
    /** Domain for postMessage security */
    origin?: string;
    /** Start time in seconds */
    start?: number;
    /** End time in seconds */
    end?: number;
    /** Enable JS API. Always set to 1 when using API */
    enablejsapi?: 0 | 1;
    /** Widget referrer for analytics */
    widget_referrer?: string;
    /** Playlist ID to play */
    list?: string;
    /** List type (playlist, search, user_uploads) */
    listType?: "playlist" | "search" | "user_uploads";
    /** Loop the video. 0 = no (default), 1 = yes */
    loop?: 0 | 1;
    /** Mute the video initially */
    mute?: 0 | 1;
    /** Restrict to specific language cc */
    cc_lang_pref?: string;
    /** Force captions display */
    cc_load_policy?: 0 | 1;
    /** Interface language (ISO 639-1) */
    hl?: string;
    /** Play inline on iOS */
    playsinline?: 0 | 1;
  }

  interface PlayerEvent {
    target: Player;
    data?: unknown;
  }

  interface OnStateChangeEvent extends PlayerEvent {
    data: -1 | 0 | 1 | 2 | 3 | 5;
  }

  interface OnErrorEvent extends PlayerEvent {
    data: 2 | 5 | 100 | 101 | 150;
  }

  interface OnPlaybackQualityChangeEvent extends PlayerEvent {
    data: string;
  }

  interface OnPlaybackRateChangeEvent extends PlayerEvent {
    data: number;
  }

  interface Events {
    onReady?: (event: PlayerEvent) => void;
    onStateChange?: (event: OnStateChangeEvent) => void;
    onError?: (event: OnErrorEvent) => void;
    onPlaybackQualityChange?: (event: OnPlaybackQualityChangeEvent) => void;
    onPlaybackRateChange?: (event: OnPlaybackRateChangeEvent) => void;
    onApiChange?: (event: PlayerEvent) => void;
    /** Fires when browser blocks autoplay or scripted playback */
    onAutoplayBlocked?: (event: PlayerEvent) => void;
  }

  interface PlayerOptions {
    width?: number | string;
    height?: number | string;
    videoId?: string;
    playerVars?: PlayerVars;
    events?: Events;
    host?: string;
  }

  class Player {
    constructor(elementId: string | HTMLElement, options: PlayerOptions);

    // Queueing functions
    loadVideoById(videoId: string, startSeconds?: number): void;
    loadVideoById(options: {
      videoId: string;
      startSeconds?: number;
      endSeconds?: number;
    }): void;
    cueVideoById(videoId: string, startSeconds?: number): void;
    cueVideoById(options: {
      videoId: string;
      startSeconds?: number;
      endSeconds?: number;
    }): void;

    // Playback controls
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;

    // Volume
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
    setVolume(volume: number): void;
    getVolume(): number;

    // Playback status
    getPlayerState(): -1 | 0 | 1 | 2 | 3 | 5;
    getCurrentTime(): number;
    getDuration(): number;
    getVideoLoadedFraction(): number;

    // Playback quality
    getPlaybackQuality(): string;
    setPlaybackQuality(suggestedQuality: string): void;
    getAvailableQualityLevels(): string[];

    // Playback rate
    getPlaybackRate(): number;
    setPlaybackRate(suggestedRate: number): void;
    getAvailablePlaybackRates(): number[];

    // Player info
    getVideoUrl(): string;
    getVideoEmbedCode(): string;
    getIframe(): HTMLIFrameElement;

    // Cleanup
    destroy(): void;
  }
}

interface Window {
  YT?: typeof YT & {
    Player: typeof YT.Player;
    PlayerState: typeof YT.PlayerState;
  };
  onYouTubeIframeAPIReady?: () => void;
}

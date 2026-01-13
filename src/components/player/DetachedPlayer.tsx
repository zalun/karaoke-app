import { useRef, useEffect, useCallback, useState } from "react";
import { windowManager, type PlayerState } from "../../services/windowManager";
import { createLogger } from "../../services";
import { SETTINGS_KEYS, SETTINGS_DEFAULTS } from "../../stores";
import { useWakeLock } from "../../hooks";
import {
  NextSongOverlay,
  COUNTDOWN_START_THRESHOLD_SECONDS,
} from "./NextSongOverlay";
import { SingerOverlayDisplay } from "./SingerOverlayDisplay";
import { CURRENT_SINGER_OVERLAY_DURATION_MS } from "./CurrentSingerOverlay";
import { YouTubePlayer } from "./YouTubePlayer";
import { NativePlayer } from "./NativePlayer";
import { Z_INDEX_DRAG_OVERLAY } from "../../styles/zIndex";

const log = createLogger("DetachedPlayer");

// Throttle time updates to reduce event frequency (500ms interval)
const TIME_UPDATE_THROTTLE_MS = 500;

// Minimum position (in seconds) to restore when reattaching - avoids seeking to near-zero
export const MIN_RESTORE_POSITION_SECONDS = 1;

export function DetachedPlayer() {
  const lastTimeUpdateRef = useRef<number>(0);
  // Track intended play state via ref to avoid closure timing issues
  const intendedPlayStateRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [shouldRestorePosition, setShouldRestorePosition] = useState(true);
  // Track time remaining for overlay
  const [overlayTimeRemaining, setOverlayTimeRemaining] = useState<number | null>(null);
  const videoTimeRef = useRef({ currentTime: 0, duration: 0 });
  // Track overlay setting via ref for access in callbacks
  const defaultOverlaySeconds = parseInt(SETTINGS_DEFAULTS[SETTINGS_KEYS.NEXT_SONG_OVERLAY_SECONDS], 10);
  const overlaySecondsRef = useRef<number>(defaultOverlaySeconds);
  // Track current singer overlay visibility
  const [showCurrentSingerOverlay, setShowCurrentSingerOverlay] = useState(false);
  const previousVideoIdRef = useRef<string | null>(null);
  // Seek time from main window
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [state, setState] = useState<PlayerState>({
    streamUrl: null,
    videoId: null,
    playbackMode: "youtube",
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
  });

  // Prevent screen from sleeping while playing
  useWakeLock(state.isPlaying && isReady);

  // Listen for state sync from main window
  useEffect(() => {
    let isMounted = true;
    let stateReceived = false;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let unlistenState: (() => void) | undefined;
    let unlistenCommands: (() => void) | undefined;

    const setupListeners = async () => {
      const stateListener = await windowManager.listenForStateSync((newState) => {
        stateReceived = true;
        log.info(`State sync received: videoId=${newState.videoId}, streamUrl=${newState.streamUrl?.substring(0, 50)}..., isPlaying=${newState.isPlaying}, playbackMode=${newState.playbackMode}`);
        log.info(`State sync songs: currentSong=${newState.currentSong?.title ?? 'none'}, nextSong=${newState.nextSong?.title ?? 'none'}, currentSingers=${newState.currentSong?.singers?.length ?? 0}, nextSingers=${newState.nextSong?.singers?.length ?? 0}`);
        if (isMounted) {
          intendedPlayStateRef.current = newState.isPlaying;
          // State sync now always includes song data from PlayerControls.buildPlayerState()
          // The fallback to previous state is kept as a defensive measure
          setState((prevState) => ({
            ...newState,
            currentSong: newState.currentSong ?? prevState.currentSong,
            nextSong: newState.nextSong ?? prevState.nextSong,
          }));
        }
      });

      if (isMounted) {
        unlistenState = stateListener;
      } else {
        stateListener();
        return;
      }

      const commandsListener = await windowManager.listenForCommands((cmd) => {
        if (!isMounted) return;

        log.info(`Command received: ${cmd.command}, value=${cmd.value}`);

        // Update ref for play/pause commands
        if (cmd.command === "play") intendedPlayStateRef.current = true;
        if (cmd.command === "pause") intendedPlayStateRef.current = false;

        switch (cmd.command) {
          case "play":
            setState((s) => {
              log.debug(`Setting isPlaying=true, current videoId=${s.videoId}`);
              return { ...s, isPlaying: true };
            });
            break;
          case "pause":
            setState((s) => {
              log.debug(`Setting isPlaying=false, current videoId=${s.videoId}`);
              return { ...s, isPlaying: false };
            });
            break;
          case "seek":
            if (cmd.value !== undefined) {
              setSeekTime(cmd.value);
            }
            break;
        }
      });

      if (isMounted) {
        unlistenCommands = commandsListener;
      } else {
        commandsListener();
        return;
      }

      // Request initial state with retry mechanism
      const requestWithRetry = async (attempts: number) => {
        if (!isMounted || stateReceived || attempts <= 0) return;

        await windowManager.requestInitialState();

        retryTimeout = setTimeout(() => {
          if (isMounted && !stateReceived) {
            requestWithRetry(attempts - 1);
          }
        }, 100);
      };

      await requestWithRetry(5);
    };

    setupListeners();

    return () => {
      isMounted = false;
      clearTimeout(retryTimeout);
      unlistenState?.();
      unlistenCommands?.();
    };
  }, []);

  // Handle video/stream change
  useEffect(() => {
    const currentVideoId = state.videoId || state.streamUrl;
    if (currentVideoId && currentVideoId !== previousVideoIdRef.current) {
      const isNewVideo = previousVideoIdRef.current !== null;
      if (isNewVideo) {
        setShouldRestorePosition(false);
        setIsReady(false);
      }
      previousVideoIdRef.current = currentVideoId;
    }
  }, [state.videoId, state.streamUrl]);

  // Keep overlay setting ref in sync with state
  useEffect(() => {
    overlaySecondsRef.current = state.nextSongOverlaySeconds ?? defaultOverlaySeconds;
  }, [state.nextSongOverlaySeconds, defaultOverlaySeconds]);

  // Handle ready event
  const handleReady = useCallback(() => {
    setIsReady(true);
    windowManager.emitVideoLoaded();
    setShouldRestorePosition(false);
  }, []);

  // Handle time updates
  const handleTimeUpdate = useCallback((currentTime: number, duration: number) => {
    videoTimeRef.current = { currentTime, duration };

    // Calculate time remaining for overlay
    if (duration > 0) {
      const timeRemaining = Math.ceil(duration - currentTime);
      const overlaySeconds = overlaySecondsRef.current;
      // Only show overlay if enabled (overlaySeconds > 0) and within threshold
      const shouldShowOverlay = overlaySeconds > 0 && timeRemaining <= overlaySeconds && timeRemaining > 0;
      setOverlayTimeRemaining((prev) => {
        if (!shouldShowOverlay) return null;
        if (prev !== timeRemaining) return timeRemaining;
        return prev;
      });
    }

    // Throttle emits to main window
    const now = Date.now();
    if (now - lastTimeUpdateRef.current >= TIME_UPDATE_THROTTLE_MS) {
      lastTimeUpdateRef.current = now;
      windowManager.emitTimeUpdate(currentTime);
    }
  }, []);

  // Handle duration change
  const handleDurationChange = useCallback((duration: number) => {
    if (duration > 0 && isFinite(duration)) {
      windowManager.emitDurationUpdate(duration);
    }
  }, []);

  // Handle video ended
  const handleEnded = useCallback(() => {
    log.info("Video ended, notifying main window");
    windowManager.emitVideoEnded();
  }, []);

  // Handle clear seek
  const handleClearSeek = useCallback(() => {
    setSeekTime(null);
  }, []);

  // Handle autoplay blocked - notify main window
  const handleAutoplayBlocked = useCallback(() => {
    log.info("Autoplay blocked, notifying main window");
    windowManager.emitAutoplayBlocked();
  }, []);

  // Emit final state before window closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (state.streamUrl || state.videoId) {
        windowManager.emitFinalState({
          streamUrl: state.streamUrl,
          videoId: state.videoId,
          playbackMode: state.playbackMode,
          isPlaying: intendedPlayStateRef.current,
          currentTime: videoTimeRef.current.currentTime,
          duration: videoTimeRef.current.duration || state.duration,
          volume: state.volume,
          isMuted: state.isMuted,
        });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state.streamUrl, state.videoId, state.playbackMode, state.duration, state.volume, state.isMuted]);

  // Show current singer overlay when video changes
  useEffect(() => {
    const currentVideoId = state.videoId || state.streamUrl;
    if (
      currentVideoId &&
      previousVideoIdRef.current !== null &&
      state.currentSong?.singers &&
      state.currentSong.singers.length > 0
    ) {
      log.debug(`Showing current singer overlay for ${state.currentSong.singers.length} singers`);
      setShowCurrentSingerOverlay(true);
      const timer = setTimeout(() => {
        setShowCurrentSingerOverlay(false);
      }, CURRENT_SINGER_OVERLAY_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [state.videoId, state.streamUrl, state.currentSong?.singers]);

  // Handle volume changes from main window
  useEffect(() => {
    // Volume is handled by the player components
  }, [state.volume, state.isMuted]);

  // Double-click for fullscreen
  const handleDoubleClick = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  // Determine what to play
  const playbackMode = state.playbackMode || "youtube";
  const canPlayYouTube = playbackMode === "youtube" && state.videoId;
  const canPlayNative = playbackMode === "ytdlp" && state.streamUrl;
  const hasContent = canPlayYouTube || canPlayNative;

  // Debug logging
  log.debug(`Render: playbackMode=${playbackMode}, videoId=${state.videoId}, isPlaying=${state.isPlaying}`);

  // Determine initial seek time (for position restore on initial load)
  const initialSeekTime = shouldRestorePosition && state.currentTime > MIN_RESTORE_POSITION_SECONDS
    ? state.currentTime
    : seekTime;

  return (
    <div className="w-screen h-screen bg-black flex items-center justify-center relative">
      {canPlayYouTube && state.videoId && (
        <YouTubePlayer
          videoId={state.videoId}
          isPlaying={state.isPlaying}
          volume={state.volume}
          isMuted={state.isMuted}
          seekTime={initialSeekTime}
          onReady={handleReady}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onDurationChange={handleDurationChange}
          onClearSeek={handleClearSeek}
          onAutoplayBlocked={handleAutoplayBlocked}
          className="w-full h-full"
        />
      )}
      {/* Always render NativePlayer to preserve user interaction context for autoplay */}
      {/* Show when playing native content OR when no content (for priming overlay) */}
      {/* Hide only when YouTube is playing */}
      <div className={canPlayNative || !hasContent ? "w-full h-full absolute inset-0" : "hidden"}>
        <NativePlayer
          streamUrl={canPlayNative && state.streamUrl ? state.streamUrl : undefined}
          isPlaying={canPlayNative ? state.isPlaying : false}
          volume={state.volume}
          isMuted={state.isMuted}
          seekTime={canPlayNative ? initialSeekTime : null}
          playbackKey={state.playbackId}
          onReady={canPlayNative ? handleReady : undefined}
          onTimeUpdate={canPlayNative ? handleTimeUpdate : undefined}
          onEnded={canPlayNative ? handleEnded : undefined}
          onDurationChange={canPlayNative ? handleDurationChange : undefined}
          onClearSeek={canPlayNative ? handleClearSeek : undefined}
          onAutoplayBlocked={canPlayNative ? handleAutoplayBlocked : undefined}
          className="w-full h-full"
        />
      </div>
      {!isReady && hasContent && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <p className="text-gray-400">Loading...</p>
        </div>
      )}
      {state.nextSong && overlayTimeRemaining !== null && overlayTimeRemaining > 0 && (
        <NextSongOverlay
          title={state.nextSong.title}
          artist={state.nextSong.artist}
          countdown={overlayTimeRemaining <= COUNTDOWN_START_THRESHOLD_SECONDS ? overlayTimeRemaining : undefined}
          singers={state.nextSong.singers?.map((s) => ({
            id: s.id,
            name: s.name,
            unique_name: s.unique_name ?? null,
            color: s.color,
            is_persistent: false,
          }))}
        />
      )}
      {/* Current singer overlay - shows when video changes */}
      {showCurrentSingerOverlay && state.currentSong?.singers && state.currentSong.singers.length > 0 && (
        <SingerOverlayDisplay singers={state.currentSong.singers} />
      )}
      {/* Transparent drag overlay - captures mouse events for window dragging */}
      {/* Both YouTube iframe and native video elements capture events, so we need this overlay */}
      {/* Uses Z_INDEX_DRAG_OVERLAY (40) to stay below play overlay (50) for click-to-play */}
      <div
        data-tauri-drag-region
        className="absolute inset-0"
        style={{ zIndex: Z_INDEX_DRAG_OVERLAY }}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
}

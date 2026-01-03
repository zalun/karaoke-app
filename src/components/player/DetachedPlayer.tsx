import { useRef, useEffect, useCallback, useState } from "react";
import { windowManager, type PlayerState } from "../../services/windowManager";
import { createLogger } from "../../services";
import { useWakeLock } from "../../hooks";
import {
  NextSongOverlay,
  OVERLAY_SHOW_THRESHOLD_SECONDS,
  COUNTDOWN_START_THRESHOLD_SECONDS,
} from "./NextSongOverlay";
import { SingerOverlayDisplay } from "./SingerOverlayDisplay";
import { CURRENT_SINGER_OVERLAY_DURATION_MS } from "./CurrentSingerOverlay";
import { YouTubePlayer } from "./YouTubePlayer";
import { NativePlayer } from "./NativePlayer";

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
        log.info(`State sync received: videoId=${newState.videoId}, isPlaying=${newState.isPlaying}, playbackMode=${newState.playbackMode}`);
        if (isMounted) {
          intendedPlayStateRef.current = newState.isPlaying;
          setState(newState);
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
      const shouldShowOverlay = timeRemaining <= OVERLAY_SHOW_THRESHOLD_SECONDS && timeRemaining > 0;
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
  log.debug(`Render: playbackMode=${playbackMode}, videoId=${state.videoId}, isPlaying=${state.isPlaying}, canPlayYouTube=${canPlayYouTube}, hasContent=${hasContent}`);

  // Determine initial seek time (for position restore on initial load)
  const initialSeekTime = shouldRestorePosition && state.currentTime > MIN_RESTORE_POSITION_SECONDS
    ? state.currentTime
    : seekTime;

  return (
    <div
      className="w-screen h-screen bg-black flex items-center justify-center relative"
      onDoubleClick={handleDoubleClick}
    >
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
          className="w-full h-full"
        />
      )}
      {canPlayNative && state.streamUrl && (
        <NativePlayer
          streamUrl={state.streamUrl}
          isPlaying={state.isPlaying}
          volume={state.volume}
          isMuted={state.isMuted}
          seekTime={initialSeekTime}
          onReady={handleReady}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onDurationChange={handleDurationChange}
          onClearSeek={handleClearSeek}
          className="w-full h-full"
        />
      )}
      {!hasContent && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>Waiting for video...</p>
        </div>
      )}
      {!isReady && hasContent && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
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
    </div>
  );
}

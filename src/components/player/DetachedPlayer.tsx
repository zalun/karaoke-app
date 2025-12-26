import { useRef, useEffect, useCallback, useState } from "react";
import { windowManager, type PlayerState } from "../../services/windowManager";
import { useWakeLock } from "../../hooks";
import {
  NextSongOverlay,
  OVERLAY_SHOW_THRESHOLD_SECONDS,
  COUNTDOWN_START_THRESHOLD_SECONDS,
} from "./NextSongOverlay";

// Throttle time updates to reduce event frequency (500ms interval)
const TIME_UPDATE_THROTTLE_MS = 500;

// Minimum position (in seconds) to restore when reattaching - avoids seeking to near-zero
export const MIN_RESTORE_POSITION_SECONDS = 1;

// Validate stream URL to prevent XSS - only allow http/https schemes
function isValidStreamUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function DetachedPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTimeUpdateRef = useRef<number>(0);
  const pendingCommandRef = useRef<{ command: "play" | "pause" | "seek"; value?: number } | null>(null);
  // Track intended play state via ref to avoid closure timing issues
  const intendedPlayStateRef = useRef(false); // Start paused - user can click play
  const [isReady, setIsReady] = useState(false);
  const [shouldRestorePosition, setShouldRestorePosition] = useState(true);
  const [currentStreamUrl, setCurrentStreamUrl] = useState<string | null>(null);
  // Track time remaining for overlay (only update state when crossing thresholds to reduce re-renders)
  const [overlayTimeRemaining, setOverlayTimeRemaining] = useState<number | null>(null);
  const videoTimeRef = useRef({ currentTime: 0, duration: 0 });
  const [state, setState] = useState<PlayerState>({
    streamUrl: null,
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
        if (isMounted) {
          // Update ref immediately (no async batching)
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
        const video = videoRef.current;
        if (!video) return;

        // Update ref for play/pause commands
        if (cmd.command === "play") intendedPlayStateRef.current = true;
        if (cmd.command === "pause") intendedPlayStateRef.current = false;

        // If video isn't ready, queue the command for later
        if (video.readyState < 3) {
          pendingCommandRef.current = cmd;
          return;
        }

        switch (cmd.command) {
          case "play":
            video.play().catch(console.error);
            break;
          case "pause":
            video.pause();
            break;
          case "seek":
            if (cmd.value !== undefined) {
              video.currentTime = cmd.value;
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

  // Update video source when streamUrl changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (state.streamUrl && state.streamUrl !== currentStreamUrl) {
      // Validate URL before assignment to prevent XSS
      if (!isValidStreamUrl(state.streamUrl)) {
        console.error("Invalid stream URL rejected:", state.streamUrl);
        return;
      }

      const isNewVideo = currentStreamUrl !== null && state.streamUrl !== currentStreamUrl;

      setIsReady(false);
      setCurrentStreamUrl(state.streamUrl);

      // If this is a NEW video (not initial detach), don't restore position
      if (isNewVideo) {
        setShouldRestorePosition(false);
      }

      video.src = state.streamUrl;
      video.load();
    }
  }, [state.streamUrl, currentStreamUrl]);

  // Handle canplay event - set initial time and play if needed
  const handleCanPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || isReady) return;

    setIsReady(true);

    // Restore position only on initial detach, not when switching videos
    if (shouldRestorePosition && state.currentTime > MIN_RESTORE_POSITION_SECONDS) {
      video.currentTime = state.currentTime;
    }

    // Process any pending command that arrived before video was ready
    const pendingCmd = pendingCommandRef.current;
    if (pendingCmd) {
      pendingCommandRef.current = null;
      if (pendingCmd.command === "pause") {
        intendedPlayStateRef.current = false;
      } else if (pendingCmd.command === "play") {
        intendedPlayStateRef.current = true;
      } else if (pendingCmd.command === "seek" && pendingCmd.value !== undefined) {
        video.currentTime = pendingCmd.value;
      }
    }

    // Try to play if we should be playing
    if (intendedPlayStateRef.current) {
      video.play().catch((err) => console.error("Play failed:", err));
    }

    // After first video loads, don't restore position for subsequent videos
    setShouldRestorePosition(false);
  }, [isReady, state.currentTime, shouldRestorePosition]);

  // Handle play state changes (only after video is ready)
  // Only PLAYS video when needed - pause is handled by commands listener
  // Note: state.isPlaying is in deps to trigger effect when state changes, but we use
  // intendedPlayStateRef.current to avoid closure timing issues with React's batching
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !state.streamUrl || !isReady) return;

    if (intendedPlayStateRef.current && video.paused) {
      video.play().catch((err) => console.error("Play failed:", err));
    }
  }, [state.isPlaying, state.streamUrl, isReady]);

  // Handle volume changes from main window
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = state.volume;
    video.muted = state.isMuted;
  }, [state.volume, state.isMuted]);

  // Send time updates back to main window (throttled to reduce event frequency)
  // Also track time remaining for overlay countdown (only update state on threshold crossings)
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Update ref (no re-render)
    videoTimeRef.current = { currentTime: video.currentTime, duration: video.duration || 0 };

    // Calculate time remaining and only update state when overlay visibility changes
    const duration = video.duration || 0;
    if (duration > 0) {
      const timeRemaining = Math.ceil(duration - video.currentTime);
      // Update state only when:
      // - Entering/leaving overlay zone (20s threshold)
      // - During countdown (every second from 10 to 1)
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
      windowManager.emitTimeUpdate(video.currentTime);
    }
  }, []);

  // Emit final state before window closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      const video = videoRef.current;
      if (video && state.streamUrl) {
        windowManager.emitFinalState({
          streamUrl: state.streamUrl,
          isPlaying: !video.paused,
          currentTime: video.currentTime,
          duration: video.duration || state.duration,
          volume: state.volume,
          isMuted: state.isMuted,
        });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state.streamUrl, state.duration, state.volume, state.isMuted]);

  // Handle video ended - notify main window to advance queue
  const handleEnded = useCallback(() => {
    windowManager.emitVideoEnded();
  }, []);

  // Double-click for fullscreen
  const handleDoubleClick = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
  }, []);

  return (
    <div className="w-screen h-screen bg-black flex items-center justify-center relative">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onCanPlay={handleCanPlay}
        onEnded={handleEnded}
        onDoubleClick={handleDoubleClick}
        playsInline
      />
      {(!state.streamUrl || !isReady) && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>{state.streamUrl ? "Loading..." : "Waiting for video..."}</p>
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
            color: s.color,
            is_persistent: false,
          }))}
        />
      )}
    </div>
  );
}

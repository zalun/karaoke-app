import { useRef, useEffect, useCallback, useState } from "react";
import { windowManager, type PlayerState } from "../../services/windowManager";
import { useWakeLock } from "../../hooks";

// Throttle time updates to reduce event frequency (500ms interval)
const TIME_UPDATE_THROTTLE_MS = 500;

export function DetachedPlayer() {
  console.log("[DetachedPlayer] Component rendering...");
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTimeUpdateRef = useRef<number>(0);
  const pendingCommandRef = useRef<{ command: "play" | "pause" | "seek"; value?: number } | null>(null);
  const isMutedForAutoplayRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [shouldRestorePosition, setShouldRestorePosition] = useState(true);
  const [currentStreamUrl, setCurrentStreamUrl] = useState<string | null>(null);
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

    console.log("[DetachedPlayer] Setting up listeners...");

    const setupListeners = async () => {
      const stateListener = await windowManager.listenForStateSync((newState) => {
        console.log("[DetachedPlayer] Received state sync:", newState);
        stateReceived = true;
        if (isMounted) setState(newState);
      });

      if (isMounted) {
        unlistenState = stateListener;
      } else {
        stateListener();
        return;
      }

      const commandsListener = await windowManager.listenForCommands((cmd) => {
        console.log("[DetachedPlayer] Received command:", cmd, "readyState:", videoRef.current?.readyState);
        if (!isMounted) return;
        const video = videoRef.current;
        if (!video) return;

        // If video isn't ready, queue the command for later
        if (video.readyState < 3) {
          console.log("[DetachedPlayer] Video not ready, queuing command");
          pendingCommandRef.current = cmd;
          return;
        }

        switch (cmd.command) {
          case "play":
            console.log("[DetachedPlayer] Executing play command");
            video.play().catch((err) => console.error("[DetachedPlayer] Play failed:", err));
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
    console.log("[DetachedPlayer] handleCanPlay called, isReady:", isReady, "video:", !!video);
    if (!video || isReady) return;

    setIsReady(true);
    console.log("[DetachedPlayer] Video ready, state:", { isPlaying: state.isPlaying, isMuted: state.isMuted, currentTime: state.currentTime });

    // Restore position only on initial detach, not when switching videos
    if (shouldRestorePosition && state.currentTime > 1) {
      console.log("[DetachedPlayer] Restoring position to:", state.currentTime);
      video.currentTime = state.currentTime;
    }

    // Process any pending command that arrived before video was ready
    const pendingCmd = pendingCommandRef.current;
    const shouldPlay = pendingCmd?.command === "play" || (!pendingCmd && state.isPlaying);
    console.log("[DetachedPlayer] pendingCmd:", pendingCmd, "shouldPlay:", shouldPlay);

    if (pendingCmd) {
      pendingCommandRef.current = null;
      if (pendingCmd.command === "pause") {
        video.pause();
      } else if (pendingCmd.command === "seek" && pendingCmd.value !== undefined) {
        video.currentTime = pendingCmd.value;
      }
    }

    if (shouldPlay) {
      console.log("[DetachedPlayer] Attempting to play with muted autoplay...");
      // Use muted autoplay to bypass browser restrictions, then restore volume
      isMutedForAutoplayRef.current = true;
      video.muted = true;
      video.play()
        .then(() => {
          console.log("[DetachedPlayer] Play succeeded! Unmuting...");
          isMutedForAutoplayRef.current = false;
          video.muted = state.isMuted;
        })
        .catch((err) => {
          isMutedForAutoplayRef.current = false;
          console.error("[DetachedPlayer] Autoplay failed:", err);
        });
    }

    // After first video loads, don't restore position for subsequent videos
    setShouldRestorePosition(false);
  }, [isReady, state.currentTime, state.isPlaying, state.isMuted, shouldRestorePosition]);

  // Handle play/pause state changes (only after video is ready)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !state.streamUrl || !isReady) return;

    if (state.isPlaying && video.paused) {
      video.play().catch(console.error);
    } else if (!state.isPlaying && !video.paused) {
      video.pause();
    }
  }, [state.isPlaying, state.streamUrl, isReady]);

  // Handle volume
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = state.volume;
    // Don't change muted state if we're in the middle of muted autoplay
    if (!isMutedForAutoplayRef.current) {
      video.muted = state.isMuted;
    }
  }, [state.volume, state.isMuted]);

  // Send time updates back to main window (throttled to reduce event frequency)
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

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
    <div className="w-screen h-screen bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onCanPlay={handleCanPlay}
        onDoubleClick={handleDoubleClick}
        playsInline
        autoPlay
        muted
      />
      {(!state.streamUrl || !isReady) && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>{state.streamUrl ? "Loading..." : "Waiting for video..."}</p>
        </div>
      )}
    </div>
  );
}

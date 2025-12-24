import { useRef, useEffect, useCallback, useState } from "react";
import { windowManager, type PlayerState } from "../../services/windowManager";

// Throttle time updates to reduce event frequency (500ms interval)
const TIME_UPDATE_THROTTLE_MS = 500;

export function DetachedPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTimeUpdateRef = useRef<number>(0);
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
        if (isMounted) setState(newState);
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
    if (shouldRestorePosition && state.currentTime > 1) {
      video.currentTime = state.currentTime;
    }

    // Start playing if it should be playing
    if (state.isPlaying) {
      video.play().catch(console.error);
    }

    // After first video loads, don't restore position for subsequent videos
    setShouldRestorePosition(false);
  }, [isReady, state.currentTime, state.isPlaying, shouldRestorePosition]);

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

    video.volume = state.isMuted ? 0 : state.volume;
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
      />
      {(!state.streamUrl || !isReady) && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>{state.streamUrl ? "Loading..." : "Waiting for video..."}</p>
        </div>
      )}
    </div>
  );
}

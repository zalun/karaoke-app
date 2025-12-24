import { useRef, useEffect, useCallback, useState } from "react";
import { windowManager, type PlayerState } from "../../services/windowManager";

export function DetachedPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
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
    const setupListeners = async () => {
      const unlistenState = await windowManager.listenForStateSync((newState) => {
        console.log("[DetachedPlayer] Received state sync:", newState);
        setState(newState);
      });

      const unlistenCommands = await windowManager.listenForCommands((cmd) => {
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

      // Request initial state from main window after listeners are set up
      console.log("[DetachedPlayer] Requesting initial state");
      await windowManager.requestInitialState();

      return () => {
        unlistenState();
        unlistenCommands();
      };
    };

    const cleanup = setupListeners();
    return () => {
      cleanup.then((fn) => fn?.());
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

      // If this is a NEW video (not the first load), mark it so we don't restore position
      if (isNewVideo) {
        setIsFirstLoad(false);
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

    // Only restore time position on first load (detach scenario)
    // For new videos, start from the beginning
    if (isFirstLoad && state.currentTime > 1) {
      video.currentTime = state.currentTime;
    }

    // Start playing if it should be playing
    if (state.isPlaying) {
      video.play().catch(console.error);
    }

    // After first load, mark as not first load anymore
    setIsFirstLoad(false);
  }, [isReady, state.currentTime, state.isPlaying, isFirstLoad]);

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

  // Send time updates back to main window
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video) {
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

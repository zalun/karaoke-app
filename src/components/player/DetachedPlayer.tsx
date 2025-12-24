import { useRef, useEffect, useCallback, useState } from "react";
import { windowManager, type PlayerState } from "../../services/windowManager";

export function DetachedPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
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

    if (state.streamUrl && video.src !== state.streamUrl) {
      video.src = state.streamUrl;
      video.load();
    }
  }, [state.streamUrl]);

  // Handle play/pause state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !state.streamUrl) return;

    if (state.isPlaying && video.paused) {
      video.play().catch(console.error);
    } else if (!state.isPlaying && !video.paused) {
      video.pause();
    }
  }, [state.isPlaying, state.streamUrl]);

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
        onDoubleClick={handleDoubleClick}
        playsInline
      />
      {!state.streamUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>Waiting for video...</p>
        </div>
      )}
    </div>
  );
}

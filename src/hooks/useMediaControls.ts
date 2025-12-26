import { useEffect, useRef, useCallback } from "react";
import { mediaControlsService, createLogger } from "../services";
import { usePlayerStore, useQueueStore, getStreamUrlWithCache } from "../stores";

const log = createLogger("useMediaControls");

// Throttle position updates to avoid overwhelming the system
const POSITION_UPDATE_INTERVAL_MS = 1000;

export function useMediaControls() {
  const lastPositionUpdate = useRef<number>(0);

  const {
    currentVideo,
    isPlaying,
    currentTime,
    duration,
    setCurrentVideo,
    setIsPlaying,
    setIsLoading,
    setError,
    seekTo,
  } = usePlayerStore();

  const { playNext, playPrevious, hasNext, hasPrevious } = useQueueStore();

  // Handle next track - similar logic to PlayerControls
  const handleNext = useCallback(async () => {
    log.info("Media key: Next");
    if (!hasNext()) {
      log.debug("No next track available");
      return;
    }
    const nextItem = playNext();
    if (nextItem && nextItem.video.youtubeId) {
      setIsLoading(true);
      try {
        const streamUrl = await getStreamUrlWithCache(nextItem.video.youtubeId);
        setCurrentVideo({ ...nextItem.video, streamUrl });
        setIsPlaying(true);
        log.info(`Now playing: ${nextItem.video.title}`);
      } catch (err) {
        log.error("Failed to play next", err);
        setError("Failed to play next video");
        setIsLoading(false);
      }
    }
  }, [playNext, hasNext, setCurrentVideo, setIsPlaying, setIsLoading, setError]);

  // Handle previous track - similar logic to PlayerControls
  const handlePrevious = useCallback(async () => {
    log.info("Media key: Previous");
    if (!hasPrevious()) {
      log.debug("No previous track available");
      return;
    }
    const prevItem = playPrevious();
    if (prevItem && prevItem.video.youtubeId) {
      setIsLoading(true);
      try {
        const streamUrl = await getStreamUrlWithCache(prevItem.video.youtubeId);
        setCurrentVideo({ ...prevItem.video, streamUrl });
        setIsPlaying(true);
        log.info(`Now playing: ${prevItem.video.title}`);
      } catch (err) {
        log.error("Failed to play previous", err);
        setError("Failed to play previous video");
        setIsLoading(false);
      }
    }
  }, [playPrevious, hasPrevious, setCurrentVideo, setIsPlaying, setIsLoading, setError]);

  // Update metadata when video changes
  useEffect(() => {
    if (currentVideo) {
      mediaControlsService.updateMetadata({
        title: currentVideo.title,
        artist: currentVideo.artist,
        durationSecs: currentVideo.duration ?? duration,
        thumbnailUrl: currentVideo.thumbnailUrl,
      });
    } else {
      mediaControlsService.stop();
    }
  }, [currentVideo?.id, currentVideo?.title, currentVideo?.artist, currentVideo?.thumbnailUrl, duration]);

  // Update playback state when playing/paused changes
  useEffect(() => {
    if (currentVideo) {
      mediaControlsService.updatePlayback(isPlaying, currentTime);
    }
  }, [isPlaying, currentVideo?.id]);

  // Throttled position updates while playing
  useEffect(() => {
    if (!currentVideo || !isPlaying) return;

    const now = Date.now();
    if (now - lastPositionUpdate.current < POSITION_UPDATE_INTERVAL_MS) return;

    lastPositionUpdate.current = now;
    mediaControlsService.updatePlayback(isPlaying, currentTime);
  }, [currentTime, isPlaying, currentVideo?.id]);

  // Set up media key event listeners
  useEffect(() => {
    const unlistenFns: Array<() => void> = [];

    const setupListeners = async () => {
      try {
        unlistenFns.push(
          await mediaControlsService.onPlay(() => {
            log.debug("Media key: Play");
            setIsPlaying(true);
          })
        );

        unlistenFns.push(
          await mediaControlsService.onPause(() => {
            log.debug("Media key: Pause");
            setIsPlaying(false);
          })
        );

        unlistenFns.push(
          await mediaControlsService.onToggle(() => {
            log.debug("Media key: Toggle");
            const current = usePlayerStore.getState().isPlaying;
            setIsPlaying(!current);
          })
        );

        unlistenFns.push(await mediaControlsService.onNext(handleNext));

        unlistenFns.push(await mediaControlsService.onPrevious(handlePrevious));

        unlistenFns.push(
          await mediaControlsService.onStop(() => {
            log.debug("Media key: Stop");
            setIsPlaying(false);
          })
        );

        unlistenFns.push(
          await mediaControlsService.onSeek((delta) => {
            log.debug(`Media key: Seek ${delta}s`);
            const current = usePlayerStore.getState().currentTime;
            const dur = usePlayerStore.getState().duration;
            const newTime = Math.max(0, Math.min(current + delta, dur));
            seekTo(newTime);
          })
        );

        unlistenFns.push(
          await mediaControlsService.onSetPosition((position) => {
            log.debug(`Media key: SetPosition ${position}s`);
            seekTo(position);
          })
        );

        log.info("Media control event listeners set up");
      } catch (err) {
        log.error("Failed to set up media control listeners", err);
      }
    };

    setupListeners();

    return () => {
      unlistenFns.forEach((fn) => fn());
    };
  }, [setIsPlaying, seekTo, handleNext, handlePrevious]);
}

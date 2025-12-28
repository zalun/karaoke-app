import { useEffect, useRef, useCallback } from "react";
import { mediaControlsService, createLogger } from "../services";
import { usePlayerStore, useQueueStore, playVideo } from "../stores";

const log = createLogger("useMediaControls");

// Throttle position updates to avoid overwhelming the system
const POSITION_UPDATE_INTERVAL_MS = 1000;

// Debounce rapid playback state changes to prevent race conditions
const PLAYBACK_DEBOUNCE_MS = 50;

export function useMediaControls() {
  const lastPositionUpdate = useRef<number>(0);
  const playbackDebounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTimeRef = useRef<number>(0);

  const {
    currentVideo,
    isPlaying,
    currentTime,
    duration,
    setIsPlaying,
    seekTo,
  } = usePlayerStore();

  const { playNext, playPrevious, hasNext, hasPrevious } = useQueueStore();

  // Keep currentTimeRef in sync for use in debounced callbacks
  currentTimeRef.current = currentTime;

  // Handle next track
  const handleNext = useCallback(async () => {
    log.info("Media key: Next");
    if (!hasNext()) {
      log.debug("No next track available");
      return;
    }
    const nextItem = playNext();
    if (nextItem) {
      try {
        await playVideo(nextItem.video);
      } catch {
        // Error already logged and state updated by playVideo
      }
    }
  }, [playNext, hasNext]);

  // Handle previous track
  const handlePrevious = useCallback(async () => {
    log.info("Media key: Previous");
    if (!hasPrevious()) {
      log.debug("No previous track available");
      return;
    }
    const prevItem = playPrevious();
    if (prevItem) {
      try {
        await playVideo(prevItem.video);
      } catch {
        // Error already logged and state updated by playVideo
      }
    }
  }, [playPrevious, hasPrevious]);

  // Update metadata only when video changes (not on play/pause).
  // This effect also calls updatePlayback() to ensure Now Playing shows immediately
  // when a new video starts. This may result in a second updatePlayback() call from
  // the debounced effect below (50ms later), which is intentional and harmless -
  // the immediate call ensures responsiveness while the debounced effect handles
  // rapid play/pause toggling.
  useEffect(() => {
    if (currentVideo) {
      // Use a clean thumbnail URL without query params (macOS NSImage handles it better)
      // YouTube thumbnail format: https://i.ytimg.com/vi/{videoId}/hqdefault.jpg
      let thumbnailUrl = currentVideo.thumbnailUrl;
      if (currentVideo.youtubeId) {
        thumbnailUrl = `https://i.ytimg.com/vi/${currentVideo.youtubeId}/hqdefault.jpg`;
      }

      mediaControlsService.updateMetadata({
        title: currentVideo.title,
        artist: currentVideo.artist,
        durationSecs: currentVideo.duration ?? duration,
        thumbnailUrl,
      });
      mediaControlsService.updatePlayback(isPlaying, currentTime);
    } else {
      mediaControlsService.stop();
    }
  }, [currentVideo?.id, currentVideo?.title, currentVideo?.artist, currentVideo?.youtubeId, duration]);

  // Debounced playback state updates when play/pause changes.
  // This prevents race conditions from rapid toggling by coalescing updates.
  //
  // Dependencies explained:
  // - isPlaying: Core trigger - we want to update when play/pause state changes
  // - currentVideo: Needed for the early return guard. When video changes, the
  //   metadata effect above handles the update, so the debounced call here is
  //   redundant but harmless (just confirms the same state after 50ms)
  useEffect(() => {
    if (!currentVideo) return;

    // Clear any pending debounced update
    if (playbackDebounceTimeout.current) {
      clearTimeout(playbackDebounceTimeout.current);
    }

    // Debounce the playback update to handle rapid toggling.
    // Uses currentTimeRef to get latest position without adding currentTime to deps
    // (which would cause excessive re-runs as position updates every frame).
    playbackDebounceTimeout.current = setTimeout(() => {
      // Guard against stale callbacks after cleanup/unmount
      if (playbackDebounceTimeout.current) {
        mediaControlsService.updatePlayback(isPlaying, currentTimeRef.current);
        playbackDebounceTimeout.current = null;
      }
    }, PLAYBACK_DEBOUNCE_MS);

    return () => {
      if (playbackDebounceTimeout.current) {
        clearTimeout(playbackDebounceTimeout.current);
        playbackDebounceTimeout.current = null; // Null ref so guard check is effective
      }
    };
  }, [isPlaying, currentVideo]);

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
            const { isPlaying: current, setIsPlaying: setState } = usePlayerStore.getState();
            setState(!current);
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

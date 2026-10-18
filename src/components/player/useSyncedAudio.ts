import { useEffect, type RefObject } from "react";
import { createLogger } from "../../services";

const log = createLogger("SyncedAudio");

/** Audio is re-seeked to the video position when they drift further apart than this */
export const AUDIO_DRIFT_THRESHOLD_SECONDS = 0.3;

interface SyncedAudioOptions {
  /** Whether playback should be running (store state), so a buffering pause can resume */
  isPlayingRef: RefObject<boolean>;
  /** Called when the browser refuses to start the audio without a user gesture */
  onBlocked?: () => void;
}

/**
 * Slave a separate <audio> element to a video-only <video> element.
 *
 * YouTube serves most videos to yt-dlp as separate video-only and audio-only
 * streams. The video element is the clock: audio follows its play, pause,
 * seek and buffering. When the audio runs out of data the video pauses until
 * the audio can continue, so the two never play out of step.
 */
export function useSyncedAudio(
  videoRef: RefObject<HTMLVideoElement | null>,
  audioRef: RefObject<HTMLAudioElement | null>,
  audioUrl: string | undefined,
  { isPlayingRef, onBlocked }: SyncedAudioOptions
): void {
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || !audioUrl) return;

    // Set when we paused the video ourselves because the audio was buffering
    let pausedForAudio = false;

    const alignAudio = () => {
      if (Math.abs(audio.currentTime - video.currentTime) > AUDIO_DRIFT_THRESHOLD_SECONDS) {
        audio.currentTime = video.currentTime;
      }
    };

    const playAudio = () => {
      alignAudio();
      audio.play().catch((e: DOMException) => {
        if (e.name === "NotAllowedError") {
          log.info("Audio autoplay blocked, pausing video until user starts playback");
          video.pause();
          onBlocked?.();
        } else if (e.name !== "AbortError") {
          log.error(`Failed to play audio: ${e.name} - ${e.message}`);
        }
      });
    };

    const handleVideoPlaying = () => {
      pausedForAudio = false;
      playAudio();
    };

    const handleVideoPause = () => audio.pause();
    const handleVideoSeeking = () => {
      audio.currentTime = video.currentTime;
    };

    const handleVideoTimeUpdate = () => {
      if (!audio.paused && !audio.seeking && !video.seeking) alignAudio();
    };

    const handleAudioWaiting = () => {
      if (video.paused) return;
      log.debug("Audio buffering, pausing video");
      pausedForAudio = true;
      video.pause();
    };

    const handleAudioCanPlay = () => {
      if (!pausedForAudio || !isPlayingRef.current) return;
      log.debug("Audio buffered, resuming video");
      pausedForAudio = false;
      video.play().catch((e: DOMException) => {
        log.error(`Failed to resume video after audio buffering: ${e.name} - ${e.message}`);
      });
    };

    video.addEventListener("playing", handleVideoPlaying);
    video.addEventListener("pause", handleVideoPause);
    video.addEventListener("waiting", handleVideoPause);
    video.addEventListener("ended", handleVideoPause);
    video.addEventListener("seeking", handleVideoSeeking);
    video.addEventListener("timeupdate", handleVideoTimeUpdate);
    audio.addEventListener("waiting", handleAudioWaiting);
    audio.addEventListener("canplay", handleAudioCanPlay);

    // Video may already be playing when the audio URL arrives
    if (!video.paused) playAudio();

    return () => {
      video.removeEventListener("playing", handleVideoPlaying);
      video.removeEventListener("pause", handleVideoPause);
      video.removeEventListener("waiting", handleVideoPause);
      video.removeEventListener("ended", handleVideoPause);
      video.removeEventListener("seeking", handleVideoSeeking);
      video.removeEventListener("timeupdate", handleVideoTimeUpdate);
      audio.removeEventListener("waiting", handleAudioWaiting);
      audio.removeEventListener("canplay", handleAudioCanPlay);
      audio.pause();
    };
  }, [videoRef, audioRef, audioUrl, isPlayingRef, onBlocked]);
}

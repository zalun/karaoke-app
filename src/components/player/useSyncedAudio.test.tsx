import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { useRef } from "react";
import { useSyncedAudio, AUDIO_DRIFT_THRESHOLD_SECONDS } from "./useSyncedAudio";

vi.mock("../../services", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

/** Make a media element's playback state writable and its play/pause observable (jsdom has no media engine) */
function stubMedia(el: HTMLMediaElement) {
  let paused = true;
  Object.defineProperty(el, "paused", { configurable: true, get: () => paused });
  Object.defineProperty(el, "seeking", { configurable: true, value: false, writable: true });
  let time = 0;
  Object.defineProperty(el, "currentTime", {
    configurable: true,
    get: () => time,
    set: (t: number) => { time = t; },
  });
  const play = vi.fn(() => {
    paused = false;
    return Promise.resolve();
  });
  const pause = vi.fn(() => {
    paused = true;
  });
  el.play = play;
  el.pause = pause;
  return { play, pause, setPaused: (p: boolean) => { paused = p; } };
}

function Harness({
  audioUrl,
  isPlaying = true,
  onBlocked,
  onElements,
}: {
  audioUrl?: string;
  isPlaying?: boolean;
  onBlocked?: () => void;
  onElements: (video: HTMLVideoElement, audio: HTMLAudioElement) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  useSyncedAudio(videoRef, audioRef, audioUrl, { isPlayingRef, onBlocked });
  return (
    <>
      <video
        ref={(el) => {
          videoRef.current = el;
          if (el && audioRef.current) onElements(el, audioRef.current);
        }}
      />
      <audio
        ref={(el) => {
          audioRef.current = el;
          if (el && videoRef.current) onElements(videoRef.current, el);
        }}
      />
    </>
  );
}

function setup(props: { audioUrl?: string; isPlaying?: boolean; onBlocked?: () => void } = {}) {
  let video!: HTMLVideoElement;
  let audio!: HTMLAudioElement;
  let videoStub!: ReturnType<typeof stubMedia>;
  let audioStub!: ReturnType<typeof stubMedia>;
  const onElements = (v: HTMLVideoElement, a: HTMLAudioElement) => {
    if (video) return;
    video = v;
    audio = a;
    videoStub = stubMedia(v);
    audioStub = stubMedia(a);
  };
  const result = render(
    <Harness audioUrl="https://example.com/audio" {...props} onElements={onElements} />
  );
  return { video, audio, videoStub, audioStub, ...result };
}

describe("useSyncedAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts audio at the video position when the video starts playing", () => {
    const { video, audio, audioStub } = setup();
    video.currentTime = 12;

    video.dispatchEvent(new Event("playing"));

    expect(audioStub.play).toHaveBeenCalled();
    expect(audio.currentTime).toBe(12);
  });

  it("pauses audio when the video pauses, stalls or ends", () => {
    const { video, audioStub } = setup();

    video.dispatchEvent(new Event("pause"));
    video.dispatchEvent(new Event("waiting"));
    video.dispatchEvent(new Event("ended"));

    expect(audioStub.pause).toHaveBeenCalledTimes(3);
  });

  it("moves audio to the video position on seek", () => {
    const { video, audio } = setup();
    video.currentTime = 42;

    video.dispatchEvent(new Event("seeking"));

    expect(audio.currentTime).toBe(42);
  });

  it("corrects drift beyond the threshold during playback", () => {
    const { video, audio, audioStub } = setup();
    audioStub.setPaused(false);
    video.currentTime = 10;
    audio.currentTime = 10 - AUDIO_DRIFT_THRESHOLD_SECONDS - 0.1;

    video.dispatchEvent(new Event("timeupdate"));

    expect(audio.currentTime).toBe(10);
  });

  it("leaves small drift alone", () => {
    const { video, audio, audioStub } = setup();
    audioStub.setPaused(false);
    video.currentTime = 10;
    audio.currentTime = 10 - AUDIO_DRIFT_THRESHOLD_SECONDS / 2;

    video.dispatchEvent(new Event("timeupdate"));

    expect(audio.currentTime).toBe(10 - AUDIO_DRIFT_THRESHOLD_SECONDS / 2);
  });

  it("pauses the video while audio buffers and resumes when audio can play", () => {
    const { audio, videoStub } = setup();
    videoStub.setPaused(false);

    audio.dispatchEvent(new Event("waiting"));
    expect(videoStub.pause).toHaveBeenCalled();

    audio.dispatchEvent(new Event("canplay"));
    expect(videoStub.play).toHaveBeenCalled();
  });

  it("does not resume after buffering if the user paused meanwhile", () => {
    let video!: HTMLVideoElement;
    let audio!: HTMLAudioElement;
    let videoStub!: ReturnType<typeof stubMedia>;
    const onElements = (v: HTMLVideoElement, a: HTMLAudioElement) => {
      if (video) return;
      video = v;
      audio = a;
      videoStub = stubMedia(v);
      stubMedia(a);
    };
    const { rerender } = render(
      <Harness audioUrl="https://example.com/audio" isPlaying onElements={onElements} />
    );
    videoStub.setPaused(false);
    audio.dispatchEvent(new Event("waiting"));

    rerender(<Harness audioUrl="https://example.com/audio" isPlaying={false} onElements={onElements} />);
    audio.dispatchEvent(new Event("canplay"));

    expect(videoStub.play).not.toHaveBeenCalled();
    expect(video).toBeDefined();
  });

  it("pauses the video and reports when audio autoplay is blocked", async () => {
    const onBlocked = vi.fn();
    const { video, audioStub, videoStub } = setup({ onBlocked });
    audioStub.play.mockImplementation(() =>
      Promise.reject(new DOMException("blocked", "NotAllowedError"))
    );

    video.dispatchEvent(new Event("playing"));

    await vi.waitFor(() => expect(onBlocked).toHaveBeenCalled());
    expect(videoStub.pause).toHaveBeenCalled();
  });

  it("does nothing without an audio URL", () => {
    const { video, audioStub } = setup({ audioUrl: undefined });

    video.dispatchEvent(new Event("playing"));

    expect(audioStub.play).not.toHaveBeenCalled();
  });
});

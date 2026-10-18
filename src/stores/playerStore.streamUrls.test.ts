import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services", () => ({
  youtubeService: {
    getStreamUrl: vi.fn(),
  },
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  emitSignal: vi.fn().mockResolvedValue(undefined),
  APP_SIGNALS: {},
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn(() => "macos"),
}));

import { usePlayerStore, getStreamUrlWithCache, toStreamUrls } from "./playerStore";
import { youtubeService } from "../services";

const getStreamUrl = vi.mocked(youtubeService.getStreamUrl);

describe("toStreamUrls", () => {
  it("maps a muxed stream to a video URL without audio", () => {
    expect(toStreamUrls({ url: "https://v", audio_url: null, format: "mp4", quality: "best" })).toEqual({
      streamUrl: "https://v",
      audioStreamUrl: undefined,
    });
  });

  it("maps split streams to video and audio URLs", () => {
    expect(toStreamUrls({ url: "https://v", audio_url: "https://a", format: "mp4", quality: "best" })).toEqual({
      streamUrl: "https://v",
      audioStreamUrl: "https://a",
    });
  });

  it("clears a stale audio URL when spread over a video", () => {
    const video = { streamUrl: "https://old-v", audioStreamUrl: "https://old-a" };
    const next = { ...video, ...toStreamUrls({ url: "https://v", format: "mp4", quality: "best" }) };
    expect(next.audioStreamUrl).toBeUndefined();
  });
});

describe("getStreamUrlWithCache", () => {
  beforeEach(() => {
    usePlayerStore.setState({ prefetchedStreamUrl: null });
    vi.clearAllMocks();
  });

  it("returns both URLs from a fresh fetch", async () => {
    getStreamUrl.mockResolvedValue({ url: "https://v", audio_url: "https://a", format: "mp4", quality: "best" });

    await expect(getStreamUrlWithCache("abc123")).resolves.toEqual({
      streamUrl: "https://v",
      audioStreamUrl: "https://a",
    });
  });

  it("returns both URLs from the prefetch cache without fetching", async () => {
    usePlayerStore.getState().setPrefetchedStreamUrl("abc123", {
      streamUrl: "https://cached-v",
      audioStreamUrl: "https://cached-a",
    });

    await expect(getStreamUrlWithCache("abc123")).resolves.toEqual({
      streamUrl: "https://cached-v",
      audioStreamUrl: "https://cached-a",
    });
    expect(getStreamUrl).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().prefetchedStreamUrl).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { DetachedPlayer } from "./DetachedPlayer";
import type { PlayerState } from "../../services/windowManager";

// =============================================================================
// Mocks
// =============================================================================

let stateSyncCallback: ((state: PlayerState) => void) | null = null;
const mockEmitFinalState = vi.fn();
const nativePlayerProps: Array<Record<string, unknown>> = [];

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setAlwaysOnTop: vi.fn() }),
}));

vi.mock("../../services/windowManager", () => ({
  windowManager: {
    listenForStateSync: vi.fn((cb: (state: PlayerState) => void) => {
      stateSyncCallback = cb;
      return Promise.resolve(() => {});
    }),
    listenForCommands: vi.fn(() => Promise.resolve(() => {})),
    requestInitialState: vi.fn(() => Promise.resolve()),
    emitVideoLoaded: vi.fn(),
    emitTimeUpdate: vi.fn(),
    emitDurationUpdate: vi.fn(),
    emitVideoEnded: vi.fn(),
    emitAutoplayBlocked: vi.fn(),
    emitFinalState: (state: unknown) => mockEmitFinalState(state),
  },
}));

vi.mock("../../services", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../stores", () => ({
  SETTINGS_KEYS: { NEXT_SONG_OVERLAY_SECONDS: "next_song_overlay_seconds" },
  SETTINGS_DEFAULTS: { next_song_overlay_seconds: "20" },
}));

vi.mock("../../hooks", () => ({
  useWakeLock: vi.fn(),
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock("../session", () => ({
  JoinCodeQR: () => null,
}));

vi.mock("./YouTubePlayer", () => ({
  YouTubePlayer: () => null,
}));

vi.mock("./NativePlayer", () => ({
  NativePlayer: (props: Record<string, unknown>) => {
    nativePlayerProps.push(props);
    return null;
  },
}));

// =============================================================================
// Helpers
// =============================================================================

function makeState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    streamUrl: "v",
    audioStreamUrl: "a",
    videoId: "abc123",
    playbackMode: "ytdlp",
    isPlaying: false,
    currentTime: 0,
    duration: 100,
    volume: 1,
    isMuted: false,
    ...overrides,
  };
}

async function renderAndSync(state: PlayerState) {
  render(<DetachedPlayer />);
  await waitFor(() => expect(stateSyncCallback).not.toBeNull());
  act(() => {
    stateSyncCallback!(state);
  });
}

const lastNativeProps = () => nativePlayerProps[nativePlayerProps.length - 1];

// =============================================================================
// Tests
// =============================================================================

describe("DetachedPlayer audioStreamUrl propagation", () => {
  beforeEach(() => {
    stateSyncCallback = null;
    nativePlayerProps.length = 0;
    mockEmitFinalState.mockClear();
  });

  it("passes audioUrl to NativePlayer in ytdlp mode", async () => {
    await renderAndSync(makeState({ playbackMode: "ytdlp" }));

    await waitFor(() => {
      expect(lastNativeProps().streamUrl).toBe("v");
      expect(lastNativeProps().audioUrl).toBe("a");
    });
  });

  it("does not pass audioUrl to NativePlayer in youtube mode", async () => {
    await renderAndSync(makeState({ playbackMode: "youtube" }));

    await waitFor(() => {
      expect(lastNativeProps().audioUrl).toBeUndefined();
    });
  });

  it("includes audioStreamUrl in the final state emitted on beforeunload", async () => {
    await renderAndSync(makeState({ playbackMode: "ytdlp" }));

    await waitFor(() => expect(lastNativeProps().audioUrl).toBe("a"));

    window.dispatchEvent(new Event("beforeunload"));

    expect(mockEmitFinalState).toHaveBeenCalledWith(
      expect.objectContaining({ streamUrl: "v", audioStreamUrl: "a" })
    );
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { UpdateInfo } from "../services/update";

const mockCheck = vi.fn();
const mockInstall = vi.fn();
const mockRestart = vi.fn();
const mockNotify = vi.fn();
const mockDismiss = vi.fn();

vi.mock("../services", () => ({
  updateService: {
    checkForUpdate: (...args: unknown[]) => mockCheck(...args),
    install: (...args: unknown[]) => mockInstall(...args),
    restart: (...args: unknown[]) => mockRestart(...args),
  },
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("./notificationStore", () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
  useNotificationStore: { getState: () => ({ dismiss: mockDismiss }) },
}));

const RELEASE_URL = "https://github.com/zalun/karaoke-app/releases/tag/v9.9.9";

function updateInfo(overrides: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    latest_version: "v9.9.9",
    current_version: "0.9.1",
    update_available: true,
    release_url: RELEASE_URL,
    download_url: RELEASE_URL,
    can_install: true,
    ...overrides,
  };
}

// Fresh module per test: installUpdate keeps an in-progress flag at module level
async function loadStore() {
  vi.resetModules();
  return import("./updateStore");
}

describe("updateAction", () => {
  it("offers an in-app install where the platform supports it", async () => {
    const { updateAction } = await loadStore();

    const action = updateAction(updateInfo());

    expect(action.label).toBe("Install & restart");
    expect(action.url).toBeUndefined();
    expect(action.onClick).toBeTypeOf("function");
  });

  it("links to the release page where in-app install is not supported", async () => {
    const { updateAction } = await loadStore();

    expect(updateAction(updateInfo({ can_install: false }))).toEqual({
      label: "Download",
      url: RELEASE_URL,
    });
  });
});

describe("installUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockInstall.mockResolvedValue(undefined);
    mockRestart.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Run an install through the "Restarting…" delay */
  async function runInstall(installUpdate: (info: UpdateInfo) => Promise<void>) {
    const done = installUpdate(updateInfo());
    await vi.runAllTimersAsync();
    await done;
  }

  it("installs, announces the restart, then restarts", async () => {
    const { installUpdate, RESTART_DELAY_MS } = await loadStore();

    const done = installUpdate(updateInfo());
    expect(mockNotify).toHaveBeenCalledWith(
      "info",
      "Downloading update v9.9.9… HomeKaraoke restarts when it is ready."
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(mockNotify).toHaveBeenCalledWith("success", "Update v9.9.9 installed. Restarting…");
    expect(mockRestart).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS);
    await done;

    expect(mockRestart).toHaveBeenCalled();
  });

  it("replaces the visible notification with each update message", async () => {
    const { installUpdate } = await loadStore();

    await runInstall(installUpdate);

    // Without dismissing first, notify() would only queue behind the visible bar
    expect(mockDismiss).toHaveBeenCalledTimes(mockNotify.mock.calls.length);
  });

  it("shows the cause and the release page and does not restart when install fails", async () => {
    mockInstall.mockRejectedValue({ type: "install", message: "bad signature" });
    const { installUpdate } = await loadStore();

    await runInstall(installUpdate);

    expect(mockRestart).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      "error",
      "Could not install the update: bad signature",
      { label: "Download", url: RELEASE_URL }
    );
  });

  it("allows a retry after a failed install", async () => {
    mockInstall.mockRejectedValueOnce(new Error("offline"));
    const { installUpdate } = await loadStore();

    await runInstall(installUpdate);
    await runInstall(installUpdate);

    expect(mockInstall).toHaveBeenCalledTimes(2);
    expect(mockRestart).toHaveBeenCalledTimes(1);
  });

  it("does not start a second install while one is running", async () => {
    let finishInstall!: () => void;
    mockInstall.mockReturnValue(new Promise<void>((resolve) => { finishInstall = resolve; }));
    const { installUpdate } = await loadStore();

    const first = installUpdate(updateInfo());
    await installUpdate(updateInfo());
    finishInstall();
    await vi.runAllTimersAsync();
    await first;

    expect(mockInstall).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith("info", "Update v9.9.9 is already downloading…");
  });

  it("asks for a manual restart when restarting fails", async () => {
    mockRestart.mockRejectedValue(new Error("restart failed"));
    const { installUpdate } = await loadStore();

    await runInstall(installUpdate);

    expect(mockNotify).toHaveBeenCalledWith(
      "warning",
      "Update installed. Restart HomeKaraoke to use it."
    );
  });
});

describe("checkForUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("notifies with the platform's update action", async () => {
    mockCheck.mockResolvedValue(updateInfo({ can_install: false }));
    const { checkForUpdate } = await loadStore();

    await checkForUpdate();

    expect(mockNotify).toHaveBeenCalledWith("info", "Update available: v9.9.9", {
      label: "Download",
      url: RELEASE_URL,
    });
  });
});

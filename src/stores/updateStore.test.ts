import { describe, it, expect, vi, beforeEach } from "vitest";
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
    mockInstall.mockResolvedValue(undefined);
    mockRestart.mockResolvedValue(undefined);
  });

  it("installs, then restarts", async () => {
    const { installUpdate } = await loadStore();

    await installUpdate(updateInfo());

    expect(mockDismiss).toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith("info", "Downloading update v9.9.9…");
    expect(mockInstall).toHaveBeenCalled();
    expect(mockRestart).toHaveBeenCalled();
    expect(mockInstall.mock.invocationCallOrder[0]).toBeLessThan(
      mockRestart.mock.invocationCallOrder[0]
    );
  });

  it("offers the release page and does not restart when install fails", async () => {
    mockInstall.mockRejectedValue({ type: "install", message: "bad signature" });
    const { installUpdate } = await loadStore();

    await installUpdate(updateInfo());

    expect(mockRestart).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith("error", "Could not install the update", {
      label: "Download",
      url: RELEASE_URL,
    });
  });

  it("allows a retry after a failed install", async () => {
    mockInstall.mockRejectedValueOnce(new Error("offline"));
    const { installUpdate } = await loadStore();

    await installUpdate(updateInfo());
    await installUpdate(updateInfo());

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
    await first;

    expect(mockInstall).toHaveBeenCalledTimes(1);
  });

  it("asks for a manual restart when restarting fails", async () => {
    mockRestart.mockRejectedValue(new Error("restart failed"));
    const { installUpdate } = await loadStore();

    await installUpdate(updateInfo());

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

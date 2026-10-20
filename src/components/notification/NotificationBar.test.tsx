import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { NotificationBar } from "./NotificationBar";
import { useNotificationStore, type NotificationAction } from "../../stores/notificationStore";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../services", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function showNotification(action: NotificationAction) {
  useNotificationStore.setState({
    current: {
      id: "1",
      type: "info",
      message: "Update available: v9.9.9",
      timestamp: Date.now(),
      action,
    },
    isVisible: true,
    isHiding: false,
    showLast: false,
    moreCount: 0,
  });
}

describe("NotificationBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a GitHub action URL in the browser", () => {
    const url = "https://github.com/zalun/karaoke-app/releases/tag/v9.9.9";
    showNotification({ label: "Download", url });
    render(<NotificationBar />);

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    expect(openUrl).toHaveBeenCalledWith(url);
  });

  it("does not open a URL outside GitHub", () => {
    showNotification({ label: "Download", url: "https://example.com/app.dmg" });
    render(<NotificationBar />);

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    expect(openUrl).not.toHaveBeenCalled();
  });

  it("runs an onClick action instead of opening a URL", () => {
    const onClick = vi.fn();
    showNotification({ label: "Retry", onClick });
    render(<NotificationBar />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onClick).toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });
});

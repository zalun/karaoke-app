import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { HostSessionModal } from "./HostSessionModal";

interface MockHostedSession {
  id: string;
  sessionCode: string;
  joinUrl: string;
  qrCodeUrl: string;
  stats: { totalGuests: number; pendingRequests: number };
}

interface MockSessionState {
  hostedSession: MockHostedSession | null;
  showHostModal: boolean;
  closeHostModal: ReturnType<typeof vi.fn>;
  stopHosting: ReturnType<typeof vi.fn>;
}

interface MockSettingsState {
  settings: Record<string, string>;
}

let mockSessionStore: MockSessionState;
let mockSettingsStore: MockSettingsState;

vi.mock("../../stores", () => ({
  useSessionStore: () => mockSessionStore,
}));

vi.mock("../../stores/settingsStore", () => ({
  SETTINGS_KEYS: {
    AUTO_ACCEPT_GUEST_REQUESTS: "auto_accept_guest_requests",
  },
  useSettingsStore: (selector?: (state: MockSettingsState) => unknown) => {
    if (selector) {
      return selector(mockSettingsStore);
    }
    return mockSettingsStore;
  },
}));

vi.mock("../../stores/notificationStore", () => ({
  notify: vi.fn(),
}));

vi.mock("./JoinCodeQR", () => ({
  JoinCodeQR: () => <div data-testid="qr-mock" />,
}));

vi.mock("lucide-react", () => ({
  X: () => <span />,
  Copy: () => <span />,
  Check: () => <span />,
  StopCircle: () => <span />,
  Users: () => <span />,
  Clock: () => <span />,
  ShieldCheck: () => <span data-testid="shield-icon" />,
}));

function setup(autoAccept: boolean) {
  mockSessionStore = {
    hostedSession: {
      id: "session-1",
      sessionCode: "HK-TEST-0001",
      joinUrl: "https://homekaraoke.app/join/HK-TEST-0001",
      qrCodeUrl: "https://example.com/qr",
      stats: { totalGuests: 1, pendingRequests: 0 },
    },
    showHostModal: true,
    closeHostModal: vi.fn(),
    stopHosting: vi.fn(),
  };
  mockSettingsStore = {
    settings: {
      auto_accept_guest_requests: autoAccept ? "true" : "false",
    },
  };
}

describe("HostSessionModal — manual-approval badge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the Manual approval: ON badge when auto-accept is off (host opted out)", () => {
    setup(false);
    render(<HostSessionModal />);
    const badge = screen.getByTestId("manual-approval-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Manual approval: ON");
  });

  it("does not render the badge when auto-accept is on (default)", () => {
    setup(true);
    render(<HostSessionModal />);
    expect(screen.queryByTestId("manual-approval-badge")).not.toBeInTheDocument();
  });
});

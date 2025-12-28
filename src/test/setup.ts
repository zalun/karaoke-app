import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Tauri APIs that are used by the app
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: vi.fn(),
  getAllWebviewWindows: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@tauri-apps/api/window", () => ({
  availableMonitors: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: vi.fn(),
  LogicalSize: vi.fn(),
}));

// Mock logger to avoid Tauri plugin calls in tests
vi.mock("../services/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

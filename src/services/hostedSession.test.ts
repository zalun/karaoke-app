import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri API
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock logger
vi.mock("./logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocking
import {
  persistSessionId,
  getPersistedSessionId,
  clearPersistedSessionId,
} from "./hostedSession";

describe("hostedSession persistence functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("persistSessionId", () => {
    it("should call settings_set with the correct key and session ID", async () => {
      mockInvoke.mockResolvedValue(undefined);

      await persistSessionId("test-session-123");

      expect(mockInvoke).toHaveBeenCalledWith("settings_set", {
        key: "hosted_session_id",
        value: "test-session-123",
      });
    });

    it("should propagate errors from invoke", async () => {
      mockInvoke.mockRejectedValue(new Error("Database error"));

      await expect(persistSessionId("test-session")).rejects.toThrow(
        "Database error"
      );
    });
  });

  describe("getPersistedSessionId", () => {
    it("should call settings_get with the correct key", async () => {
      mockInvoke.mockResolvedValue("stored-session-id");

      const result = await getPersistedSessionId();

      expect(mockInvoke).toHaveBeenCalledWith("settings_get", {
        key: "hosted_session_id",
      });
      expect(result).toBe("stored-session-id");
    });

    it("should return null when no session ID is stored", async () => {
      mockInvoke.mockResolvedValue(null);

      const result = await getPersistedSessionId();

      expect(result).toBeNull();
    });

    it("should return null when session ID is empty string", async () => {
      mockInvoke.mockResolvedValue("");

      const result = await getPersistedSessionId();

      expect(result).toBeNull();
    });

    it("should return null when session ID is whitespace only", async () => {
      mockInvoke.mockResolvedValue("   ");

      const result = await getPersistedSessionId();

      expect(result).toBeNull();
    });

    it("should propagate errors from invoke", async () => {
      mockInvoke.mockRejectedValue(new Error("Database error"));

      await expect(getPersistedSessionId()).rejects.toThrow("Database error");
    });
  });

  describe("clearPersistedSessionId", () => {
    it("should call settings_set with empty string to clear the session ID", async () => {
      mockInvoke.mockResolvedValue(undefined);

      await clearPersistedSessionId();

      expect(mockInvoke).toHaveBeenCalledWith("settings_set", {
        key: "hosted_session_id",
        value: "",
      });
    });

    it("should propagate errors from invoke", async () => {
      mockInvoke.mockRejectedValue(new Error("Database error"));

      await expect(clearPersistedSessionId()).rejects.toThrow("Database error");
    });
  });
});

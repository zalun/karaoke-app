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
  ApiError,
  persistSessionId,
  getPersistedSessionId,
  clearPersistedSessionId,
  runLegacyHostedSessionMigration,
} from "./hostedSession";

describe("ApiError", () => {
  it("should capture statusCode correctly", () => {
    const error = new ApiError(404, "Not found");
    expect(error.statusCode).toBe(404);
  });

  it("should capture message correctly", () => {
    const error = new ApiError(401, "Unauthorized");
    expect(error.message).toBe("Unauthorized");
  });

  it("should set name property to ApiError", () => {
    const error = new ApiError(500, "Server error");
    expect(error.name).toBe("ApiError");
  });

  it("should work with instanceof check", () => {
    const error = new ApiError(403, "Forbidden");
    expect(error instanceof ApiError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });

  it("should capture various status codes correctly", () => {
    const codes = [200, 201, 400, 401, 403, 404, 500, 502, 503];
    for (const code of codes) {
      const error = new ApiError(code, `Status ${code}`);
      expect(error.statusCode).toBe(code);
      expect(error.message).toBe(`Status ${code}`);
    }
  });
});

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

  describe("runLegacyHostedSessionMigration", () => {
    it("should skip migration if already done", async () => {
      // Migration flag already set
      mockInvoke.mockImplementation((cmd: string, args: unknown) => {
        if (cmd === "settings_get") {
          const { key } = args as { key: string };
          if (key === "hosted_session_legacy_migration_done") {
            return Promise.resolve("true");
          }
        }
        return Promise.resolve(null);
      });

      await runLegacyHostedSessionMigration();

      // Should only check migration flag, not get or clear the legacy ID
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith("settings_get", {
        key: "hosted_session_legacy_migration_done",
      });
    });

    it("should clear legacy ID and mark migration done", async () => {
      // Migration not done, legacy ID exists
      mockInvoke.mockImplementation((cmd: string, args: unknown) => {
        if (cmd === "settings_get") {
          const { key } = args as { key: string };
          if (key === "hosted_session_legacy_migration_done") {
            return Promise.resolve(null);
          }
          if (key === "hosted_session_id") {
            return Promise.resolve("legacy-session-123");
          }
        }
        return Promise.resolve(undefined);
      });

      await runLegacyHostedSessionMigration();

      // Should: check migration flag, get legacy ID, clear legacy ID, mark done
      expect(mockInvoke).toHaveBeenCalledWith("settings_get", {
        key: "hosted_session_legacy_migration_done",
      });
      expect(mockInvoke).toHaveBeenCalledWith("settings_get", {
        key: "hosted_session_id",
      });
      expect(mockInvoke).toHaveBeenCalledWith("settings_set", {
        key: "hosted_session_id",
        value: "",
      });
      expect(mockInvoke).toHaveBeenCalledWith("settings_set", {
        key: "hosted_session_legacy_migration_done",
        value: "true",
      });
    });

    it("should mark migration done even if no legacy ID exists", async () => {
      // Migration not done, no legacy ID
      mockInvoke.mockImplementation((cmd: string, args: unknown) => {
        if (cmd === "settings_get") {
          const { key } = args as { key: string };
          if (key === "hosted_session_legacy_migration_done") {
            return Promise.resolve(null);
          }
          if (key === "hosted_session_id") {
            return Promise.resolve(null);
          }
        }
        return Promise.resolve(undefined);
      });

      await runLegacyHostedSessionMigration();

      // Should: check migration flag, get legacy ID (null), mark done
      // Should NOT clear the legacy ID (since it doesn't exist)
      const setCalls = mockInvoke.mock.calls.filter(
        (call: unknown[]) => call[0] === "settings_set"
      );
      expect(setCalls).toHaveLength(1);
      expect(setCalls[0]).toEqual([
        "settings_set",
        { key: "hosted_session_legacy_migration_done", value: "true" },
      ]);
    });

    it("should not throw on migration failure", async () => {
      // Migration check throws error
      mockInvoke.mockRejectedValue(new Error("Database error"));

      // Should not throw - migration failure shouldn't block app
      await expect(runLegacyHostedSessionMigration()).resolves.toBeUndefined();
    });

    it("should handle partial failure gracefully", async () => {
      let callCount = 0;
      mockInvoke.mockImplementation((cmd: string, args: unknown) => {
        callCount++;
        if (cmd === "settings_get") {
          const { key } = args as { key: string };
          if (key === "hosted_session_legacy_migration_done") {
            return Promise.resolve(null);
          }
          if (key === "hosted_session_id") {
            return Promise.resolve("legacy-id");
          }
        }
        if (cmd === "settings_set" && callCount > 2) {
          // Fail on marking migration done
          return Promise.reject(new Error("Failed to mark done"));
        }
        return Promise.resolve(undefined);
      });

      // Should not throw
      await expect(runLegacyHostedSessionMigration()).resolves.toBeUndefined();
    });
  });
});

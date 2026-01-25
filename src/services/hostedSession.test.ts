import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri API
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock fetch from plugin-http
const mockFetch = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
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
  hostedSessionService,
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

describe("hostedSessionService.getRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error when access token is empty", async () => {
    await expect(
      hostedSessionService.getRequests("", "session-123")
    ).rejects.toThrow("Access token is required");

    await expect(
      hostedSessionService.getRequests("   ", "session-123")
    ).rejects.toThrow("Access token is required");
  });

  it("should throw error when session ID is empty", async () => {
    await expect(
      hostedSessionService.getRequests("token-123", "")
    ).rejects.toThrow("Session ID is required");

    await expect(
      hostedSessionService.getRequests("token-123", "   ")
    ).rejects.toThrow("Session ID is required");
  });

  it("should call fetch with correct URL and headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await hostedSessionService.getRequests("token-123", "session-456");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/session/session-456/requests"),
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer token-123",
        },
      })
    );
  });

  it("should include status query parameter when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await hostedSessionService.getRequests("token-123", "session-456", "pending");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/session\/session-456\/requests\?status=pending$/),
      expect.any(Object)
    );
  });

  it("should return array of SongRequest objects", async () => {
    const mockResponse = [
      {
        id: "req-1",
        title: "Song Title",
        status: "pending",
        guest_name: "John",
        requested_at: "2024-01-15T10:30:00Z",
        youtube_id: "abc123",
        artist: "Artist Name",
        duration: 180,
        thumbnail_url: "https://example.com/thumb.jpg",
      },
      {
        id: "req-2",
        title: "Another Song",
        status: "pending",
        guest_name: "Jane",
        requested_at: "2024-01-15T10:31:00Z",
      },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await hostedSessionService.getRequests("token", "session");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "req-1",
      title: "Song Title",
      status: "pending",
      guest_name: "John",
      requested_at: "2024-01-15T10:30:00Z",
      youtube_id: "abc123",
      artist: "Artist Name",
      duration: 180,
      thumbnail_url: "https://example.com/thumb.jpg",
    });
    expect(result[1]).toEqual({
      id: "req-2",
      title: "Another Song",
      status: "pending",
      guest_name: "Jane",
      requested_at: "2024-01-15T10:31:00Z",
      youtube_id: undefined,
      artist: undefined,
      duration: undefined,
      thumbnail_url: undefined,
    });
  });

  it("should throw ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    });

    await expect(
      hostedSessionService.getRequests("token", "session")
    ).rejects.toThrow(ApiError);

    try {
      await hostedSessionService.getRequests("token", "session");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(403);
    }
  });

  it("should throw network error on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("Network unavailable"));

    await expect(
      hostedSessionService.getRequests("token", "session")
    ).rejects.toThrow("Network error: Network unavailable");
  });
});

describe("hostedSessionService.approveRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error when access token is empty", async () => {
    await expect(
      hostedSessionService.approveRequest("", "session-123", "request-456")
    ).rejects.toThrow("Access token is required");

    await expect(
      hostedSessionService.approveRequest("   ", "session-123", "request-456")
    ).rejects.toThrow("Access token is required");
  });

  it("should throw error when session ID is empty", async () => {
    await expect(
      hostedSessionService.approveRequest("token-123", "", "request-456")
    ).rejects.toThrow("Session ID is required");

    await expect(
      hostedSessionService.approveRequest("token-123", "   ", "request-456")
    ).rejects.toThrow("Session ID is required");
  });

  it("should throw error when request ID is empty", async () => {
    await expect(
      hostedSessionService.approveRequest("token-123", "session-456", "")
    ).rejects.toThrow("Request ID is required");

    await expect(
      hostedSessionService.approveRequest("token-123", "session-456", "   ")
    ).rejects.toThrow("Request ID is required");
  });

  it("should call PATCH with correct URL, headers, and body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
    });

    await hostedSessionService.approveRequest("token-123", "session-456", "request-789");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/session/session-456/requests"),
      expect.objectContaining({
        method: "PATCH",
        headers: {
          Authorization: "Bearer token-123",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "approve", requestId: "request-789" }),
      })
    );
  });

  it("should resolve successfully on ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
    });

    await expect(
      hostedSessionService.approveRequest("token", "session", "request")
    ).resolves.toBeUndefined();
  });

  it("should throw ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Request not found"),
    });

    await expect(
      hostedSessionService.approveRequest("token", "session", "request")
    ).rejects.toThrow(ApiError);

    try {
      await hostedSessionService.approveRequest("token", "session", "request");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(404);
    }
  });

  it("should throw network error on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    await expect(
      hostedSessionService.approveRequest("token", "session", "request")
    ).rejects.toThrow("Network error: Connection refused");
  });
});

describe("hostedSessionService.rejectRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error when access token is empty", async () => {
    await expect(
      hostedSessionService.rejectRequest("", "session-123", "request-456")
    ).rejects.toThrow("Access token is required");

    await expect(
      hostedSessionService.rejectRequest("   ", "session-123", "request-456")
    ).rejects.toThrow("Access token is required");
  });

  it("should throw error when session ID is empty", async () => {
    await expect(
      hostedSessionService.rejectRequest("token-123", "", "request-456")
    ).rejects.toThrow("Session ID is required");

    await expect(
      hostedSessionService.rejectRequest("token-123", "   ", "request-456")
    ).rejects.toThrow("Session ID is required");
  });

  it("should throw error when request ID is empty", async () => {
    await expect(
      hostedSessionService.rejectRequest("token-123", "session-456", "")
    ).rejects.toThrow("Request ID is required");

    await expect(
      hostedSessionService.rejectRequest("token-123", "session-456", "   ")
    ).rejects.toThrow("Request ID is required");
  });

  it("should call PATCH with correct URL, headers, and body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
    });

    await hostedSessionService.rejectRequest("token-123", "session-456", "request-789");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/session/session-456/requests"),
      expect.objectContaining({
        method: "PATCH",
        headers: {
          Authorization: "Bearer token-123",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "reject", requestId: "request-789" }),
      })
    );
  });

  it("should resolve successfully on ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
    });

    await expect(
      hostedSessionService.rejectRequest("token", "session", "request")
    ).resolves.toBeUndefined();
  });

  it("should throw ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Request not found"),
    });

    await expect(
      hostedSessionService.rejectRequest("token", "session", "request")
    ).rejects.toThrow(ApiError);

    try {
      await hostedSessionService.rejectRequest("token", "session", "request");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(404);
    }
  });

  it("should throw network error on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    await expect(
      hostedSessionService.rejectRequest("token", "session", "request")
    ).rejects.toThrow("Network error: Connection refused");
  });
});

describe("hostedSessionService.approveAllRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error when access token is empty", async () => {
    await expect(
      hostedSessionService.approveAllRequests("", "session-123", ["req-1"])
    ).rejects.toThrow("Access token is required");

    await expect(
      hostedSessionService.approveAllRequests("   ", "session-123", ["req-1"])
    ).rejects.toThrow("Access token is required");
  });

  it("should throw error when session ID is empty", async () => {
    await expect(
      hostedSessionService.approveAllRequests("token-123", "", ["req-1"])
    ).rejects.toThrow("Session ID is required");

    await expect(
      hostedSessionService.approveAllRequests("token-123", "   ", ["req-1"])
    ).rejects.toThrow("Session ID is required");
  });

  it("should throw error when request IDs array is empty", async () => {
    await expect(
      hostedSessionService.approveAllRequests("token-123", "session-456", [])
    ).rejects.toThrow("Request IDs are required");
  });

  it("should call PATCH with correct URL, headers, and body for single request", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
    });

    await hostedSessionService.approveAllRequests("token-123", "session-456", ["request-789"]);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/session/session-456/requests"),
      expect.objectContaining({
        method: "PATCH",
        headers: {
          Authorization: "Bearer token-123",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "approve", requestIds: ["request-789"] }),
      })
    );
  });

  it("should call PATCH with multiple request IDs", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
    });

    await hostedSessionService.approveAllRequests("token-123", "session-456", ["req-1", "req-2", "req-3"]);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/session/session-456/requests"),
      expect.objectContaining({
        body: JSON.stringify({ action: "approve", requestIds: ["req-1", "req-2", "req-3"] }),
      })
    );
  });

  it("should resolve successfully on ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
    });

    await expect(
      hostedSessionService.approveAllRequests("token", "session", ["req-1"])
    ).resolves.toBeUndefined();
  });

  it("should throw ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Invalid request"),
    });

    await expect(
      hostedSessionService.approveAllRequests("token", "session", ["req-1"])
    ).rejects.toThrow(ApiError);

    try {
      await hostedSessionService.approveAllRequests("token", "session", ["req-1"]);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(400);
    }
  });

  it("should throw network error on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    await expect(
      hostedSessionService.approveAllRequests("token", "session", ["req-1"])
    ).rejects.toThrow("Network error: Connection refused");
  });
});

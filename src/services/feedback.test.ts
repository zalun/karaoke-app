import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectContext, deriveOsShort, submitFeedback } from "./feedback";

const mockInvoke = vi.fn();
const mockGetVersion = vi.fn();
const mockFetch = vi.fn();
let mockRecent: Array<{ type: string; message: string; timestamp: number }> = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => mockInvoke(cmd, args),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => mockGetVersion(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));

/** Build a minimal fetch Response stand-in for the parts submitFeedback uses. */
function mockResponse(status: number, body: unknown, opts: { jsonThrows?: boolean } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: opts.jsonThrows
      ? () => Promise.reject(new SyntaxError("Unexpected token < in JSON"))
      : () => Promise.resolve(body),
  };
}

vi.mock("../stores/notificationStore", () => ({
  useNotificationStore: { getState: () => ({ recent: mockRecent }) },
}));

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

describe("deriveOsShort", () => {
  it("derives macOS from a Mac user agent", () => {
    expect(deriveOsShort("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macOS");
  });

  it("derives Windows from a Windows user agent", () => {
    expect(deriveOsShort("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
  });

  it("derives Linux from an X11 user agent", () => {
    expect(deriveOsShort("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Linux");
  });

  it("returns undefined for an unrecognised user agent", () => {
    expect(deriveOsShort("SomeRandomAgent/1.0")).toBeUndefined();
  });
});

describe("collectContext", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockGetVersion.mockReset();
    mockRecent = [];
    mockGetVersion.mockResolvedValue("1.2.3");
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
  });

  it("collects app version and short OS", async () => {
    const { context } = await collectContext({ includeLogs: false });
    expect(context.appVersion).toBe("1.2.3");
    expect(context.osShort).toBe("macOS");
    expect(context.osVersion).toContain("Macintosh");
  });

  it("does not invoke get_log_tail when logs are opted out", async () => {
    const { context, logsFailed } = await collectContext({ includeLogs: false });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(context.logTail).toBeUndefined();
    expect(logsFailed).toBe(false);
  });

  it("includes the log tail when logs are enabled", async () => {
    mockInvoke.mockResolvedValue("[INFO] hello");
    const { context, logsFailed } = await collectContext({ includeLogs: true });
    expect(mockInvoke).toHaveBeenCalledWith("get_log_tail", { lines: 50 });
    expect(context.logTail).toBe("[INFO] hello");
    expect(logsFailed).toBe(false);
  });

  it("flags logsFailed and omits logTail when get_log_tail rejects", async () => {
    mockInvoke.mockRejectedValue(new Error("no log dir"));
    const { context, logsFailed } = await collectContext({ includeLogs: true });
    expect(context.logTail).toBeUndefined();
    expect(logsFailed).toBe(true);
  });

  it("attaches only the most recent error/warning notifications, capped at 10", async () => {
    mockRecent = [
      { type: "info", message: "ignored info", timestamp: 1 },
      { type: "success", message: "ignored success", timestamp: 2 },
      ...Array.from({ length: 12 }, (_, i) => ({
        type: i % 2 === 0 ? "error" : "warning",
        message: `problem ${i}`,
        timestamp: 100 + i,
      })),
    ];
    const { context } = await collectContext({ includeLogs: false });
    expect(context.notifications).toHaveLength(10);
    // Keeps the most recent ones (the last of the 12 error/warning entries)
    expect(context.notifications?.at(-1)?.message).toBe("problem 11");
    expect(context.notifications?.every((n) => n.type === "error" || n.type === "warning")).toBe(true);
  });
});

describe("submitFeedback", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("POSTs the payload as JSON to the feedback endpoint", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, { ok: true }));
    await submitFeedback({ type: "bug", title: "T", body: "B" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/feedback");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toMatchObject({ type: "bug", title: "T", body: "B" });
  });

  it("returns the GitHub URL on a 200 success", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(200, { ok: true, githubIssueUrl: "https://github.com/zalun/karaoke-app/issues/7" })
    );
    const result = await submitFeedback({ type: "bug", title: "T", body: "B" });
    expect(result).toEqual({
      status: 200,
      ok: true,
      githubIssueUrl: "https://github.com/zalun/karaoke-app/issues/7",
      error: undefined,
    });
  });

  it("does not treat a non-2xx response as success even if the body says ok:true", async () => {
    mockFetch.mockResolvedValue(mockResponse(500, { ok: true }));
    const result = await submitFeedback({ type: "bug", title: "T", body: "B" });
    expect(result.status).toBe(500);
    expect(result.ok).toBe(false);
  });

  it("surfaces a 429 as a non-ok result with the server error", async () => {
    mockFetch.mockResolvedValue(mockResponse(429, { ok: false, error: "rate limited" }));
    const result = await submitFeedback({ type: "bug", title: "T", body: "B" });
    expect(result.status).toBe(429);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("rate limited");
  });

  it("falls back gracefully when the response body is not JSON", async () => {
    mockFetch.mockResolvedValue(mockResponse(200, undefined, { jsonThrows: true }));
    const result = await submitFeedback({ type: "bug", title: "T", body: "B" });
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.githubIssueUrl).toBeUndefined();
  });

  it("returns a transport-failure sentinel when fetch rejects", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));
    const result = await submitFeedback({ type: "bug", title: "T", body: "B" });
    expect(result.status).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network down");
  });
});

import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { createLogger } from "./logger";
import { FEEDBACK_ENDPOINT } from "../constants";
// Imported from the concrete modules (not the services barrel) to avoid an
// import cycle: notificationStore imports the services barrel.
import { useNotificationStore } from "../stores/notificationStore";
import type { FeedbackType } from "../stores/feedbackStore";

const log = createLogger("FeedbackService");

/** Number of log lines requested for the report (backend caps at 100). */
const LOG_TAIL_LINES = 50;
/** Max recent error/warning notifications attached to a report. */
const MAX_NOTIFICATIONS = 10;

export type { FeedbackType };
export type OsShort = "macOS" | "Windows" | "Linux";

/** A notification entry as sent in the report context. */
export interface FeedbackNotification {
  type: string;
  message: string;
  timestamp: number;
}

/** Auto-collected application context attached to a feedback report. */
export interface FeedbackContext {
  appVersion?: string;
  /**
   * Raw navigator.userAgent. Intended to be persisted privately; the public
   * GitHub issue carries only `osShort` (privacy split enforced backend-side).
   */
  osVersion?: string;
  osShort?: OsShort;
  notifications?: FeedbackNotification[];
  logTail?: string;
}

/** A feedback report payload sent to the backend. */
export interface FeedbackPayload {
  type: FeedbackType;
  title: string;
  body: string;
  email?: string;
  context?: FeedbackContext;
}

/** Result of collecting context, including whether log attachment failed. */
export interface CollectContextResult {
  context: FeedbackContext;
  /** True when logs were requested but `get_log_tail` rejected. */
  logsFailed: boolean;
}

/** Outcome of a submission attempt. */
export interface FeedbackResult {
  status: number;
  ok: boolean;
  githubIssueUrl?: string;
  error?: string;
}

/** Derive a short OS label from `navigator.userAgent`. */
export function deriveOsShort(userAgent: string): OsShort | undefined {
  if (/Mac/i.test(userAgent)) return "macOS";
  if (/Win/i.test(userAgent)) return "Windows";
  if (/Linux|X11/i.test(userAgent)) return "Linux";
  return undefined;
}

/**
 * Collect application context for a feedback report.
 *
 * Gathers the app version, OS info, and up to {@link MAX_NOTIFICATIONS} recent
 * error/warning notifications. The log tail is only fetched when `includeLogs`
 * is true; a rejection there is non-fatal — `logsFailed` is set and the report
 * proceeds without `logTail`.
 */
export async function collectContext({
  includeLogs,
}: {
  includeLogs: boolean;
}): Promise<CollectContextResult> {
  const userAgent = navigator.userAgent;
  const context: FeedbackContext = {
    osVersion: userAgent,
    osShort: deriveOsShort(userAgent),
  };

  try {
    context.appVersion = await getVersion();
  } catch (err) {
    log.warn("Failed to read app version for feedback:", err);
  }

  const notifications = useNotificationStore
    .getState()
    .recent.filter((n) => n.type === "error" || n.type === "warning")
    .slice(-MAX_NOTIFICATIONS)
    .map((n) => ({ type: n.type, message: n.message, timestamp: n.timestamp }));
  if (notifications.length > 0) {
    context.notifications = notifications;
  }

  let logsFailed = false;
  if (includeLogs) {
    try {
      context.logTail = await invoke<string>("get_log_tail", { lines: LOG_TAIL_LINES });
    } catch (err) {
      log.warn("Failed to collect log tail for feedback:", err);
      logsFailed = true;
    }
  }

  return { context, logsFailed };
}

/**
 * Submit a feedback report to the backend.
 *
 * Returns the HTTP status alongside the parsed body so callers can distinguish
 * rate limiting (429) from other failures. Never throws on non-2xx responses;
 * a transport-level failure surfaces as `{ status: 0, ok: false }`.
 */
export async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResult> {
  log.info(`Submitting ${payload.type} feedback`);
  try {
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let parsed: { ok?: boolean; githubIssueUrl?: string; error?: string } = {};
    try {
      parsed = (await response.json()) as typeof parsed;
    } catch (err) {
      // Non-JSON body (e.g. a gateway error page). Log so the fallback is traceable.
      log.warn(`Feedback response body was not JSON (status=${response.status}):`, err);
    }

    return {
      status: response.status,
      // Only a 2xx counts as success; never let a body `{ ok: true }` override a
      // non-2xx status (e.g. a 500 with a misleading body).
      ok: response.ok && (parsed.ok ?? true),
      githubIssueUrl: parsed.githubIssueUrl,
      error: parsed.error,
    };
  } catch (err) {
    log.error("Feedback submission request failed:", err);
    return { status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

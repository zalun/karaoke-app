/**
 * Frontend logging service using @tauri-apps/plugin-log
 *
 * This integrates with the Rust backend logging so all logs go to:
 * - Log file (~/Library/Logs/{app}/karaoke.log on macOS)
 * - Stdout (in dev mode)
 * - Webview console (when attachConsole is called)
 *
 * The debug mode toggle controls whether debug-level logs are shown
 * in the webview console, but they always go to the log file.
 */

import {
  trace as tauriTrace,
  debug as tauriDebug,
  info as tauriInfo,
  warn as tauriWarn,
  error as tauriError,
  attachConsole,
} from "@tauri-apps/plugin-log";
import { listen } from "@tauri-apps/api/event";

const STORAGE_KEY = "karaoke:debug-mode";

class Logger {
  private debugEnabled: boolean;
  private consoleAttached = false;

  constructor() {
    // Load persisted preference
    this.debugEnabled = localStorage.getItem(STORAGE_KEY) === "true";

    // Listen for menu toggle events from Tauri
    this.setupMenuListener();

    // Attach console to see Rust logs in browser console
    this.attachConsoleIfDebug();
  }

  private async setupMenuListener(): Promise<void> {
    try {
      await listen<boolean>("debug-mode-changed", (event) => {
        this.setDebugEnabled(event.payload);
      });
    } catch {
      // Not in Tauri context (e.g., during tests)
    }
  }

  private async attachConsoleIfDebug(): Promise<void> {
    if (this.debugEnabled && !this.consoleAttached) {
      try {
        await attachConsole();
        this.consoleAttached = true;
      } catch {
        // May fail if not in Tauri context
      }
    }
  }

  get isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    localStorage.setItem(STORAGE_KEY, String(enabled));

    if (enabled) {
      tauriInfo("[Debug Mode Enabled] Verbose logging is now active");
      this.attachConsoleIfDebug();
    } else {
      tauriInfo("[Debug Mode Disabled] Verbose logging is now off");
    }
  }

  /**
   * Create a scoped logger for a specific context
   */
  scope(context: string): ScopedLogger {
    return new ScopedLogger(context);
  }
}

/**
 * Scoped logger for a specific context - avoids repeating context name
 *
 * Logs always go to the log file (via tauri-plugin-log).
 * Debug-level logs are filtered in the console based on debug mode.
 */
class ScopedLogger {
  constructor(private context: string) {}

  private formatMessage(message: string): string {
    return `[${this.context}] ${message}`;
  }

  trace(message: string, data?: unknown): void {
    const formatted = this.formatMessage(message);
    if (data !== undefined) {
      tauriTrace(`${formatted} ${JSON.stringify(data)}`);
    } else {
      tauriTrace(formatted);
    }
  }

  debug(message: string, data?: unknown): void {
    const formatted = this.formatMessage(message);
    if (data !== undefined) {
      tauriDebug(`${formatted} ${JSON.stringify(data)}`);
    } else {
      tauriDebug(formatted);
    }
  }

  info(message: string, data?: unknown): void {
    const formatted = this.formatMessage(message);
    if (data !== undefined) {
      tauriInfo(`${formatted} ${JSON.stringify(data)}`);
    } else {
      tauriInfo(formatted);
    }
  }

  warn(message: string, data?: unknown): void {
    const formatted = this.formatMessage(message);
    if (data !== undefined) {
      tauriWarn(`${formatted} ${JSON.stringify(data)}`);
    } else {
      tauriWarn(formatted);
    }
  }

  error(message: string, data?: unknown): void {
    const formatted = this.formatMessage(message);
    if (data !== undefined) {
      tauriError(`${formatted} ${JSON.stringify(data)}`);
    } else {
      tauriError(formatted);
    }
  }
}

// Singleton instance
export const logger = new Logger();

// Convenience function to create scoped loggers
export function createLogger(context: string): ScopedLogger {
  return logger.scope(context);
}

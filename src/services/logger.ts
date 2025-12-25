import { listen } from "@tauri-apps/api/event";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

const STORAGE_KEY = "karaoke:debug-mode";

class Logger {
  private debugEnabled: boolean;
  private contexts: Set<string> = new Set();

  constructor() {
    // Load persisted preference
    this.debugEnabled = localStorage.getItem(STORAGE_KEY) === "true";

    // Listen for menu toggle events from Tauri
    this.setupMenuListener();
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

  get isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    localStorage.setItem(STORAGE_KEY, String(enabled));
    if (enabled) {
      console.log(
        "%c[Debug Mode Enabled]",
        "color: #22c55e; font-weight: bold",
        "Verbose logging is now active"
      );
    } else {
      console.log(
        "%c[Debug Mode Disabled]",
        "color: #6b7280; font-weight: bold",
        "Verbose logging is now off"
      );
    }
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString().slice(11, 23); // HH:mm:ss.SSS
  }

  private formatEntry(entry: LogEntry): string {
    return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.context}] ${entry.message}`;
  }

  private log(level: LogLevel, context: string, message: string, data?: unknown): void {
    // Always log errors and warnings
    // Only log debug/info when debug mode is enabled
    if (level !== "error" && level !== "warn" && !this.debugEnabled) {
      return;
    }

    this.contexts.add(context);

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      context,
      message,
      data,
    };

    const formatted = this.formatEntry(entry);
    const styles = this.getStyles(level);

    switch (level) {
      case "debug":
        if (data !== undefined) {
          console.debug(`%c${formatted}`, styles, data);
        } else {
          console.debug(`%c${formatted}`, styles);
        }
        break;
      case "info":
        if (data !== undefined) {
          console.info(`%c${formatted}`, styles, data);
        } else {
          console.info(`%c${formatted}`, styles);
        }
        break;
      case "warn":
        if (data !== undefined) {
          console.warn(`%c${formatted}`, styles, data);
        } else {
          console.warn(`%c${formatted}`, styles);
        }
        break;
      case "error":
        if (data !== undefined) {
          console.error(`%c${formatted}`, styles, data);
        } else {
          console.error(`%c${formatted}`, styles);
        }
        break;
    }
  }

  private getStyles(level: LogLevel): string {
    switch (level) {
      case "debug":
        return "color: #94a3b8"; // gray
      case "info":
        return "color: #3b82f6"; // blue
      case "warn":
        return "color: #f59e0b"; // amber
      case "error":
        return "color: #ef4444"; // red
    }
  }

  /**
   * Create a scoped logger for a specific context
   */
  scope(context: string): ScopedLogger {
    return new ScopedLogger(this, context);
  }

  debug(context: string, message: string, data?: unknown): void {
    this.log("debug", context, message, data);
  }

  info(context: string, message: string, data?: unknown): void {
    this.log("info", context, message, data);
  }

  warn(context: string, message: string, data?: unknown): void {
    this.log("warn", context, message, data);
  }

  error(context: string, message: string, data?: unknown): void {
    this.log("error", context, message, data);
  }

  /**
   * Get all contexts that have been used for logging
   */
  getContexts(): string[] {
    return Array.from(this.contexts).sort();
  }
}

/**
 * Scoped logger for a specific context - avoids repeating context name
 */
class ScopedLogger {
  constructor(
    private logger: Logger,
    private context: string
  ) {}

  debug(message: string, data?: unknown): void {
    this.logger.debug(this.context, message, data);
  }

  info(message: string, data?: unknown): void {
    this.logger.info(this.context, message, data);
  }

  warn(message: string, data?: unknown): void {
    this.logger.warn(this.context, message, data);
  }

  error(message: string, data?: unknown): void {
    this.logger.error(this.context, message, data);
  }
}

// Singleton instance
export const logger = new Logger();

// Convenience function to create scoped loggers
export function createLogger(context: string): ScopedLogger {
  return logger.scope(context);
}

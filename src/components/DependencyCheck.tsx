import { useEffect, useState } from "react";
import { createLogger } from "../services";
import { useSettingsStore, usePlayerStore, SETTINGS_KEYS } from "../stores";

const log = createLogger("DependencyCheck");

/**
 * Parse volume setting and return a valid volume value (0-1).
 * Handles both "remember" mode (uses lastVolume) and fixed percentages.
 */
function getInitialVolume(defaultVolume: string, lastVolume: string): number {
  if (defaultVolume === "remember") {
    // Use last remembered volume, default to 1 (100%) if not set or invalid
    const parsed = parseFloat(lastVolume);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
    return 1;
  }

  // Fixed percentage: "25", "50", "75", "100"
  const percentage = parseInt(defaultVolume, 10);
  if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
    return percentage / 100;
  }

  // Fallback to 100%
  return 1;
}

interface DependencyCheckProps {
  onReady: () => void;
}

/**
 * DependencyCheck component - loads settings and checks for yt-dlp only if needed.
 * YouTube iframe mode (default) works without yt-dlp, so we skip the check.
 * The yt-dlp check is also done lazily when opening Settings → Advanced.
 */
export function DependencyCheck({ onReady }: DependencyCheckProps) {
  const [isLoading, setIsLoading] = useState(true);
  const { loadSettings, getSetting, checkYtDlpAvailability } = useSettingsStore();

  useEffect(() => {
    const init = async () => {
      try {
        // Load settings from database first
        await loadSettings();

        const playbackMode = getSetting(SETTINGS_KEYS.PLAYBACK_MODE);

        if (playbackMode === "ytdlp") {
          // Only check yt-dlp if user has it enabled
          log.info("Playback mode is yt-dlp, checking availability");
          await checkYtDlpAvailability();
        } else {
          log.info("Playback mode is YouTube iframe, skipping yt-dlp check");
        }

        // Apply initial volume from settings
        const defaultVolume = getSetting(SETTINGS_KEYS.DEFAULT_VOLUME);
        const lastVolume = getSetting(SETTINGS_KEYS.LAST_VOLUME);
        const initialVolume = getInitialVolume(defaultVolume, lastVolume);
        usePlayerStore.getState().setVolume(initialVolume);
        log.info(`Initial volume set to ${Math.round(initialVolume * 100)}% (mode: ${defaultVolume})`);
      } catch (err) {
        log.error("Failed to initialize settings:", err);
        // Continue anyway - app can still work with defaults
      }

      setIsLoading(false);
      onReady();
    };

    init();
    // Run only once on mount - Zustand store functions are stable references
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Starting up...</p>
        </div>
      </div>
    );
  }

  return null;
}

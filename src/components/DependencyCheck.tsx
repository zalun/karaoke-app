import { useEffect, useState } from "react";
import { createLogger } from "../services";
import { useSettingsStore, SETTINGS_KEYS } from "../stores";

const log = createLogger("DependencyCheck");

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
      } catch (err) {
        log.error("Failed to initialize settings:", err);
        // Continue anyway - app can still work with defaults
      }

      setIsLoading(false);
      onReady();
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

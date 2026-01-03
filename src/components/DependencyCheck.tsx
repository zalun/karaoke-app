import { useState, useEffect, useCallback } from "react";
import { youtubeService, createLogger } from "../services";
import { useSettingsStore } from "../stores";

const log = createLogger("DependencyCheck");

interface DependencyCheckProps {
  onReady: () => void;
}

/**
 * DependencyCheck component - checks for yt-dlp availability but doesn't block.
 * YouTube iframe mode works without yt-dlp, so we just detect availability
 * and store it for the Advanced settings toggle.
 */
export function DependencyCheck({ onReady }: DependencyCheckProps) {
  const [checking, setChecking] = useState(true);
  const { setYtDlpAvailable } = useSettingsStore();

  const checkYtDlp = useCallback(async () => {
    log.info("Checking yt-dlp availability");
    setChecking(true);

    try {
      const available = await youtubeService.checkAvailable();
      log.info(`yt-dlp available: ${available}`);
      setYtDlpAvailable(available);
    } catch (err) {
      log.warn("Failed to check yt-dlp availability", err);
      setYtDlpAvailable(false);
    }

    // Always continue to app - YouTube iframe mode doesn't require yt-dlp
    setChecking(false);
    onReady();
  }, [onReady, setYtDlpAvailable]);

  useEffect(() => {
    checkYtDlp();
  }, [checkYtDlp]);

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Starting up...</p>
        </div>
      </div>
    );
  }

  // After checking, return null - component is only for initial check
  return null;
}

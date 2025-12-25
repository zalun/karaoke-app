import { useState, useEffect, useCallback, useRef } from "react";
import { youtubeService, createLogger } from "../services";

const log = createLogger("DependencyCheck");

type InstallMethod = "brew" | "pip" | "curl";

interface DependencyCheckProps {
  onReady: () => void;
}

export function DependencyCheck({ onReady }: DependencyCheckProps) {
  const [checking, setChecking] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installMethod, setInstallMethod] = useState<InstallMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  const checkYtDlp = useCallback(async () => {
    log.info("Checking yt-dlp availability");
    setChecking(true);
    setError(null);

    try {
      const available = await youtubeService.checkAvailable();
      if (available) {
        log.info("yt-dlp is available");
        onReady();
      } else {
        log.warn("yt-dlp not found");
        setChecking(false);
      }
    } catch (err) {
      log.error("Failed to check yt-dlp", err);
      setChecking(false);
    }
  }, [onReady]);

  useEffect(() => {
    checkYtDlp();
  }, [checkYtDlp]);

  useEffect(() => {
    // Auto-scroll output to bottom
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleInstall = async (method: InstallMethod) => {
    log.info(`Installing yt-dlp via ${method}`);
    setInstalling(true);
    setInstallMethod(method);
    setError(null);
    setOutput(null);

    try {
      const result = await youtubeService.installYtDlp(method);
      setOutput(result.output);

      if (result.success) {
        log.info(`yt-dlp installed successfully via ${method}`);
        // Wait a moment then re-check
        setTimeout(() => checkYtDlp(), 1000);
      } else {
        log.error(`yt-dlp installation failed: ${result.message}`);
        setError(result.message);
      }
    } catch (err) {
      log.error("yt-dlp installation error", err);
      setError(err instanceof Error ? err.message : "Installation failed");
    } finally {
      setInstalling(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Checking dependencies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-gray-800 rounded-lg p-6 shadow-xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-4">yt-dlp not found</div>
          <p className="text-gray-400">
            This application requires yt-dlp to search and play YouTube videos.
            Choose an installation method below.
          </p>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {output && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Installation output:</span>
              {!installing && (
                <button
                  onClick={() => setOutput(null)}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Clear
                </button>
              )}
            </div>
            <pre
              ref={outputRef}
              className="bg-gray-900 rounded p-3 text-xs text-green-400 max-h-48 overflow-auto font-mono whitespace-pre-wrap"
            >
              {output}
            </pre>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-300">Choose installation method:</h3>

          {/* Homebrew */}
          <button
            onClick={() => handleInstall("brew")}
            disabled={installing}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-wait rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {installing && installMethod === "brew" ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Installing with Homebrew...
              </>
            ) : (
              <>
                <span className="text-lg">🍺</span>
                Install with Homebrew
              </>
            )}
          </button>

          {/* pip */}
          <button
            onClick={() => handleInstall("pip")}
            disabled={installing}
            className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-wait rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {installing && installMethod === "pip" ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Installing with pip...
              </>
            ) : (
              <>
                <span className="text-lg">🐍</span>
                Install with pip
              </>
            )}
          </button>

          {/* Direct download */}
          <button
            onClick={() => handleInstall("curl")}
            disabled={installing}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-wait rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {installing && installMethod === "curl" ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Downloading binary...
              </>
            ) : (
              <>
                <span className="text-lg">📦</span>
                Download binary directly
              </>
            )}
          </button>

          <div className="border-t border-gray-700 pt-3 mt-4">
            <div className="bg-gray-700 rounded p-3 text-sm">
              <p className="text-gray-400 mb-2">Or install manually in Terminal:</p>
              <code className="block bg-gray-900 p-2 rounded text-green-400 text-xs">
                brew install yt-dlp
              </code>
              <code className="block bg-gray-900 p-2 rounded text-green-400 text-xs mt-1">
                pip3 install yt-dlp
              </code>
              <p className="text-gray-500 text-xs mt-2">
                More options at{" "}
                <a
                  href="https://github.com/yt-dlp/yt-dlp#installation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  github.com/yt-dlp/yt-dlp
                </a>
              </p>
            </div>
          </div>

          <button
            onClick={checkYtDlp}
            disabled={checking || installing}
            className="w-full py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm transition-colors"
          >
            Check Again
          </button>
        </div>
      </div>
    </div>
  );
}

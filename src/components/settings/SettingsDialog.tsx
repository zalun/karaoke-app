import { useEffect, useState, useCallback } from "react";
import {
  X,
  Settings,
  Play,
  Monitor,
  List,
  HardDrive,
  Info,
  FolderOpen,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  Trash2,
  FolderPlus,
  Youtube,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore, useLibraryStore, usePlayerStore, SETTINGS_KEYS, notify } from "../../stores";
import { updateService, createLogger, youtubeService } from "../../services";
import type { SettingsTab } from "../../stores";

const log = createLogger("SettingsDialog");

const TABS: { id: SettingsTab; label: string; icon: typeof Play }[] = [
  { id: "playback", label: "Playback", icon: Play },
  { id: "display", label: "Display", icon: Monitor },
  { id: "queue", label: "Queue & History", icon: List },
  { id: "library", label: "Library", icon: HardDrive },
  { id: "advanced", label: "YouTube", icon: Youtube },
  { id: "about", label: "About", icon: Info },
];

export function SettingsDialog() {
  const {
    showSettingsDialog,
    closeSettingsDialog,
    activeTab,
    setActiveTab,
    isLoading,
    loadError,
    getSetting,
    setSetting,
    resetToDefaults,
    loadSettings,
  } = useSettingsStore();

  // Handle keyboard navigation
  useEffect(() => {
    if (!showSettingsDialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSettingsDialog();
        return;
      }

      // Arrow key navigation between tabs
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
        let newIndex: number;

        if (e.key === "ArrowUp") {
          newIndex = currentIndex <= 0 ? TABS.length - 1 : currentIndex - 1;
        } else {
          newIndex = currentIndex >= TABS.length - 1 ? 0 : currentIndex + 1;
        }

        setActiveTab(TABS[newIndex].id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSettingsDialog, closeSettingsDialog, activeTab, setActiveTab]);

  if (!showSettingsDialog) {
    return null;
  }

  const handleOpenLogFolder = async () => {
    try {
      log.info("Opening log folder via command");
      await invoke("open_log_folder");
    } catch (error) {
      log.error("Failed to open log folder:", error);
      notify("error", "Failed to open log folder");
    }
  };

  const handleResetToDefaults = async () => {
    try {
      await resetToDefaults();
      notify("success", "Settings reset to defaults");
    } catch (error) {
      log.error("Failed to reset settings:", error);
      notify("error", "Failed to reset settings");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-[700px] max-h-[80vh] shadow-xl border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Settings size={20} className="text-blue-400" />
            <h3 className="text-lg font-medium text-white">Settings</h3>
          </div>
          <button
            onClick={closeSettingsDialog}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex min-h-0">
          {/* Tab List */}
          <div className="w-48 border-r border-gray-700 py-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    activeTab === tab.id
                      ? "bg-gray-700 text-white"
                      : "text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
                  }`}
                >
                  <Icon size={18} />
                  <span className="text-sm">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="text-gray-400">Loading settings...</div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <AlertTriangle size={48} className="text-red-500 mb-4" />
                <div className="text-lg font-medium text-white mb-2">
                  Failed to load settings
                </div>
                <div className="text-sm text-gray-400 mb-4 max-w-md">
                  {loadError}
                </div>
                <button
                  onClick={() => loadSettings()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                {activeTab === "playback" && (
                  <PlaybackSettings
                    getSetting={getSetting}
                    setSetting={setSetting}
                  />
                )}
                {activeTab === "display" && (
                  <DisplaySettings
                    getSetting={getSetting}
                    setSetting={setSetting}
                  />
                )}
                {activeTab === "queue" && (
                  <QueueSettings
                    getSetting={getSetting}
                    setSetting={setSetting}
                  />
                )}
                {activeTab === "library" && (
                  <LibrarySettings
                    getSetting={getSetting}
                    setSetting={setSetting}
                  />
                )}
                {activeTab === "advanced" && (
                  <AdvancedSettings
                    getSetting={getSetting}
                    setSetting={setSetting}
                    onResetToDefaults={handleResetToDefaults}
                  />
                )}
                {activeTab === "about" && (
                  <AboutSettings onOpenLogFolder={handleOpenLogFolder} />
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-700">
          <button
            onClick={closeSettingsDialog}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface SettingsSectionProps {
  getSetting: (key: string) => string;
  setSetting: (key: string, value: string) => Promise<void>;
}

// Helper to wrap setSetting with error handling
function createSettingHandler(
  setSetting: (key: string, value: string) => Promise<void>
) {
  return async (key: string, value: string) => {
    try {
      await setSetting(key, value);
    } catch (error) {
      log.error(`Failed to save setting ${key}:`, error);
      notify("error", "Failed to save setting");
    }
  };
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between py-3">
      <div className="flex-1 pr-4">
        <div className="text-sm font-medium text-white">{label}</div>
        {description && (
          <div className="text-xs text-gray-400 mt-0.5">{description}</div>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SelectInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-gray-600"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function PlaybackSettings({ getSetting, setSetting }: SettingsSectionProps) {
  const handleChange = createSettingHandler(setSetting);

  return (
    <div>
      <h4 className="text-lg font-medium text-white mb-4">Playback</h4>

      {/* TODO: Implement these settings - Issue #152: Video Quality
      <SettingRow
        label="Video Quality"
        description="Maximum quality for YouTube videos"
      >
        <SelectInput
          value={getSetting(SETTINGS_KEYS.VIDEO_QUALITY)}
          options={[
            { value: "best", label: "Best Available" },
            { value: "1080", label: "1080p" },
            { value: "720", label: "720p" },
            { value: "480", label: "480p" },
          ]}
          onChange={(v) => handleChange(SETTINGS_KEYS.VIDEO_QUALITY, v)}
        />
      </SettingRow>
      */}

      <SettingRow
        label="Autoplay Next Song"
        description="Automatically play the next song in queue"
      >
        <ToggleSwitch
          checked={getSetting(SETTINGS_KEYS.AUTOPLAY_NEXT) === "true"}
          onChange={(v) =>
            handleChange(SETTINGS_KEYS.AUTOPLAY_NEXT, v ? "true" : "false")
          }
        />
      </SettingRow>

      <SettingRow
        label="Default Volume"
        description="Volume level when app starts"
      >
        <SelectInput
          value={getSetting(SETTINGS_KEYS.DEFAULT_VOLUME)}
          options={[
            { value: "remember", label: "Remember Last" },
            { value: "25", label: "25%" },
            { value: "50", label: "50%" },
            { value: "75", label: "75%" },
            { value: "100", label: "100%" },
          ]}
          onChange={(v) => {
            handleChange(SETTINGS_KEYS.DEFAULT_VOLUME, v);
            // Apply volume immediately when changing to a fixed percentage
            if (v !== "remember") {
              const percentage = parseInt(v, 10);
              if (!isNaN(percentage)) {
                usePlayerStore.getState().setVolume(percentage / 100);
                log.info(`Applied volume: ${percentage}%`);
              }
            } else {
              // When switching to "remember", use last saved volume or current volume
              const lastVolume = getSetting(SETTINGS_KEYS.LAST_VOLUME);
              const parsed = parseFloat(lastVolume);
              if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
                usePlayerStore.getState().setVolume(parsed);
                log.info(`Applied remembered volume: ${Math.round(parsed * 100)}%`);
              }
            }
          }}
        />
      </SettingRow>

      {/* TODO: Issue #155: Prefetch Next Video
      <SettingRow
        label="Prefetch Next Video"
        description="Pre-load stream URL before current song ends"
      >
        <SelectInput
          value={getSetting(SETTINGS_KEYS.PREFETCH_SECONDS)}
          options={[
            { value: "0", label: "Never" },
            { value: "10", label: "10 seconds before" },
            { value: "20", label: "20 seconds before" },
            { value: "30", label: "30 seconds before" },
          ]}
          onChange={(v) => handleChange(SETTINGS_KEYS.PREFETCH_SECONDS, v)}
        />
      </SettingRow>
      */}
    </div>
  );
}

function DisplaySettings(_: SettingsSectionProps) {
  return (
    <div>
      <h4 className="text-lg font-medium text-white mb-4">Display</h4>

      <div className="text-gray-400 text-sm">
        Display settings are coming soon.
      </div>

      {/* TODO: Issue #156: Next Song Overlay
      <SettingRow
        label="Next Song Overlay"
        description="Show upcoming song info before current song ends"
      >
        <SelectInput
          value={getSetting(SETTINGS_KEYS.NEXT_SONG_OVERLAY_SECONDS)}
          options={[
            { value: "0", label: "Off" },
            { value: "10", label: "10 seconds" },
            { value: "20", label: "20 seconds" },
            { value: "30", label: "30 seconds" },
          ]}
          onChange={(v) =>
            handleChange(SETTINGS_KEYS.NEXT_SONG_OVERLAY_SECONDS, v)
          }
        />
      </SettingRow>
      */}

      {/* TODO: Issue #157: Singer Announcement
      <SettingRow
        label="Singer Announcement"
        description="Duration to show current singer name"
      >
        <SelectInput
          value={getSetting(SETTINGS_KEYS.SINGER_ANNOUNCEMENT_SECONDS)}
          options={[
            { value: "0", label: "Off" },
            { value: "3", label: "3 seconds" },
            { value: "5", label: "5 seconds" },
            { value: "8", label: "8 seconds" },
          ]}
          onChange={(v) =>
            handleChange(SETTINGS_KEYS.SINGER_ANNOUNCEMENT_SECONDS, v)
          }
        />
      </SettingRow>
      */}

      {/* TODO: Issue #158: Remember Player Position
      <SettingRow
        label="Remember Player Position"
        description="Restore detached player window position"
      >
        <ToggleSwitch
          checked={getSetting(SETTINGS_KEYS.REMEMBER_PLAYER_POSITION) === "true"}
          onChange={(v) =>
            handleChange(SETTINGS_KEYS.REMEMBER_PLAYER_POSITION, v ? "true" : "false")
          }
        />
      </SettingRow>
      */}
    </div>
  );
}

function QueueSettings(_: SettingsSectionProps) {
  return (
    <div>
      <h4 className="text-lg font-medium text-white mb-4">Queue & History</h4>

      <div className="text-gray-400 text-sm">
        Queue & History settings are coming soon.
      </div>

      {/* TODO: Issue #159: History Limit
      <SettingRow
        label="History Limit"
        description="Maximum number of songs to keep in history"
      >
        <SelectInput
          value={getSetting(SETTINGS_KEYS.HISTORY_LIMIT)}
          options={[
            { value: "50", label: "50 songs" },
            { value: "100", label: "100 songs" },
            { value: "200", label: "200 songs" },
            { value: "unlimited", label: "Unlimited" },
          ]}
          onChange={(v) => handleChange(SETTINGS_KEYS.HISTORY_LIMIT, v)}
        />
      </SettingRow>
      */}

      {/* TODO: Issue #160: Clear Queue on Exit
      <SettingRow
        label="Clear Queue on Exit"
        description="What to do with the queue when closing the app"
      >
        <SelectInput
          value={getSetting(SETTINGS_KEYS.CLEAR_QUEUE_ON_EXIT)}
          options={[
            { value: "never", label: "Never" },
            { value: "always", label: "Always" },
            { value: "ask", label: "Ask" },
          ]}
          onChange={(v) => handleChange(SETTINGS_KEYS.CLEAR_QUEUE_ON_EXIT, v)}
        />
      </SettingRow>
      */}
    </div>
  );
}


function AdvancedSettings({
  getSetting,
  setSetting,
  onResetToDefaults,
}: SettingsSectionProps & {
  onResetToDefaults: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [apiKey, setApiKey] = useState(getSetting(SETTINGS_KEYS.YOUTUBE_API_KEY) || "");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const ytDlpAvailable = useSettingsStore((state) => state.ytDlpAvailable);
  const ytDlpChecking = useSettingsStore((state) => state.ytDlpChecking);
  const checkYtDlpAvailability = useSettingsStore((state) => state.checkYtDlpAvailability);
  const handleChange = createSettingHandler(setSetting);

  // Subscribe directly to the API key setting value for stable dependency
  const storedApiKey = useSettingsStore(
    (state) => state.settings[SETTINGS_KEYS.YOUTUBE_API_KEY] || ""
  );

  // Update local API key state when stored value changes
  useEffect(() => {
    setApiKey(storedApiKey);
  }, [storedApiKey]);

  const handleReset = () => {
    setShowConfirm(false);
    onResetToDefaults();
  };

  const handleRecheck = () => {
    checkYtDlpAvailability(true); // force recheck
  };

  const handleSaveKey = async () => {
    try {
      await setSetting(SETTINGS_KEYS.YOUTUBE_API_KEY, apiKey);
      notify("success", "API key saved");
    } catch (error) {
      log.error("Failed to save API key:", error);
      notify("error", "Failed to save API key");
    }
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setTestStatus("error");
      setTestMessage("Please enter an API key first");
      return;
    }

    setTestStatus("testing");
    setTestMessage("");

    try {
      // Save the key first, then test the saved key
      // SECURITY: Key is read from database on backend, not passed via IPC
      await setSetting(SETTINGS_KEYS.YOUTUBE_API_KEY, apiKey);
      const valid = await youtubeService.validateApiKey();
      if (valid) {
        setTestStatus("success");
        setTestMessage("API key saved and validated");
      } else {
        setTestStatus("error");
        setTestMessage("Invalid API key");
      }
    } catch (error) {
      setTestStatus("error");
      const errorMsg = error instanceof Error ? error.message : "Validation failed";
      setTestMessage(errorMsg);
      log.error("API key validation failed:", error);
    }
  };

  return (
    <div>
      <h4 className="text-lg font-medium text-white mb-4">YouTube</h4>

      {/* YouTube API Key Section */}
      <div className="mb-6 p-4 bg-gray-700/30 rounded-lg">
        <h5 className="text-sm font-medium text-gray-300 mb-2">
          YouTube Data API Key
        </h5>
        <p className="text-xs text-gray-500 mb-3">
          Required for YouTube search. Get a free API key from the{" "}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
          >
            Google Cloud Console
            <ExternalLink size={12} />
          </a>
          . Free tier: ~100 searches/day.
        </p>

        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white pr-10 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveKey}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleTestKey}
              disabled={testStatus === "testing"}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm rounded transition-colors flex items-center gap-2"
            >
              {testStatus === "testing" ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Testing...
                </>
              ) : (
                "Save & Test"
              )}
            </button>
          </div>

          {/* Test result */}
          {testStatus !== "idle" && testStatus !== "testing" && (
            <div
              className={`flex items-center gap-2 text-sm ${
                testStatus === "success" ? "text-green-400" : "text-red-400"
              }`}
            >
              {testStatus === "success" ? (
                <CheckCircle size={16} />
              ) : (
                <XCircle size={16} />
              )}
              {testMessage}
            </div>
          )}
        </div>
      </div>

      {/* Search Method Selection - only show yt-dlp option when available */}
      {ytDlpAvailable ? (
        <>
          <SettingRow
            label="Search Method"
            description="How to search for YouTube videos"
          >
            <SelectInput
              value={getSetting(SETTINGS_KEYS.YOUTUBE_SEARCH_METHOD)}
              options={[
                { value: "api", label: "YouTube API" },
                { value: "ytdlp", label: "yt-dlp" },
              ]}
              onChange={(v) => handleChange(SETTINGS_KEYS.YOUTUBE_SEARCH_METHOD, v)}
            />
          </SettingRow>

          <div className="mb-6 text-xs text-gray-500">
            <p className="mb-1">
              <strong>YouTube API:</strong> Official API, ~100 searches/day free. Requires API key above.
            </p>
            <p>
              <strong>yt-dlp:</strong> Unofficial. Requires yt-dlp installed.
            </p>
          </div>

          <SettingRow
            label="Video Streaming Mode"
            description="How to play YouTube videos"
          >
            <SelectInput
              value={getSetting(SETTINGS_KEYS.PLAYBACK_MODE)}
              options={[
                { value: "youtube", label: "YouTube Embed" },
                { value: "ytdlp", label: "yt-dlp" },
              ]}
              onChange={(v) => handleChange(SETTINGS_KEYS.PLAYBACK_MODE, v)}
            />
          </SettingRow>

          <div className="mb-6 text-xs text-gray-500">
            <p className="mb-1">
              <strong>YouTube Embed:</strong> Simple and reliable. Uses YouTube's built-in player.
            </p>
            <p>
              <strong>yt-dlp:</strong> Unofficial. Requires yt-dlp installed.
            </p>
          </div>
        </>
      ) : (
        <div className="text-sm text-gray-400 mb-6">
          {ytDlpChecking ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              Checking yt-dlp availability...
            </div>
          ) : (
            <>
              yt-dlp is not installed.{" "}
              <button
                onClick={handleRecheck}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Recheck
              </button>{" "}
              after installing to enable advanced search and playback options.
            </>
          )}
        </div>
      )}

      <div className="pt-4 mt-4">
        {showConfirm ? (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-yellow-200 mb-2">
                  Reset all settings to defaults?
                </div>
                <div className="text-xs text-yellow-300/70 mb-3">
                  This will restore all settings to their original values. This action cannot be undone.
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleReset}
                    className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-sm rounded transition-colors"
                  >
                    Reset Settings
                  </button>
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            <RotateCcw size={16} />
            Reset All Settings to Defaults
          </button>
        )}
      </div>
    </div>
  );
}

function AboutSettings({
  onOpenLogFolder,
}: {
  onOpenLogFolder: () => void;
}) {
  const [isChecking, setIsChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const handleCheckForUpdate = useCallback(async () => {
    setIsChecking(true);
    setUpdateStatus(null);

    try {
      const info = await updateService.checkForUpdate();

      if (info.update_available) {
        setUpdateStatus(`Update available: ${info.latest_version}`);
        notify("info", `Update available: ${info.latest_version}`, {
          label: "Download",
          url: info.download_url,
        });
      } else {
        setUpdateStatus("You're on the latest version");
        notify("success", "You're on the latest version");
      }
    } catch (error) {
      log.error("Failed to check for updates:", error);
      setUpdateStatus("Failed to check for updates");
      notify("error", "Failed to check for updates");
    } finally {
      setIsChecking(false);
    }
  }, []);

  return (
    <div>
      <h4 className="text-lg font-medium text-white mb-4">About</h4>

      <div className="space-y-4">
        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className="text-2xl font-bold text-white mb-1">HomeKaraoke</div>
          <div className="text-sm text-gray-400">
            Version {__APP_VERSION__}
          </div>
        </div>

        <div className="text-sm text-gray-400">
          Home karaoke application with YouTube streaming, queue management, and
          singer tracking.
        </div>

        <div className="pt-4 border-t border-gray-700 space-y-3">
          <button
            onClick={handleCheckForUpdate}
            disabled={isChecking}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors w-full"
          >
            <RefreshCw size={16} className={isChecking ? "animate-spin" : ""} />
            {isChecking ? "Checking..." : "Check for Updates"}
          </button>
          {updateStatus && (
            <div className="text-sm text-gray-400 text-center">
              {updateStatus}
            </div>
          )}

          <button
            onClick={onOpenLogFolder}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors w-full"
          >
            <FolderOpen size={16} />
            Open Log Folder
          </button>
        </div>

        <div className="pt-4 border-t border-gray-700">
          <div className="text-xs text-gray-500">
            <a
              href="https://homekaraoke.app"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-300"
            >
              homekaraoke.app
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function LibrarySettings({ getSetting, setSetting }: SettingsSectionProps) {
  const {
    folders,
    stats,
    isLoadingFolders,
    isScanning,
    loadFolders,
    addFolder,
    removeFolder,
    scanFolder,
    scanAll,
    loadStats,
  } = useLibraryStore();
  const handleChange = createSettingHandler(setSetting);

  const [scanOptions, setScanOptions] = useState({
    createHkmeta: true,
    fetchSongInfo: true,
    fetchLyrics: true,
    regenerate: false,
    generateThumbnails: true,
  });

  // Load folders and stats when tab is shown
  useEffect(() => {
    loadFolders();
    loadStats();
  }, [loadFolders, loadStats]);

  const handleAddFolder = useCallback(async () => {
    try {
      // Use Tauri's file dialog
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select folder to add to library",
      });

      if (selected && typeof selected === "string") {
        await addFolder(selected);
        notify("success", "Folder added to library");
        loadStats();
      }
    } catch (error) {
      log.error("Failed to add folder:", error);
      notify("error", "Failed to add folder");
    }
  }, [addFolder, loadStats]);

  const handleRemoveFolder = useCallback(
    async (folderId: number, folderName: string) => {
      try {
        await removeFolder(folderId);
        notify("success", `Removed "${folderName}" from library`);
        loadStats();
      } catch (error) {
        log.error("Failed to remove folder:", error);
        notify("error", "Failed to remove folder");
      }
    },
    [removeFolder, loadStats]
  );

  const handleScanFolder = useCallback(
    async (folderId: number) => {
      try {
        const result = await scanFolder(folderId, {
          create_hkmeta: scanOptions.createHkmeta,
          fetch_song_info: scanOptions.fetchSongInfo,
          fetch_lyrics: scanOptions.fetchLyrics,
          regenerate: scanOptions.regenerate,
          generate_thumbnails: scanOptions.generateThumbnails,
        });
        let message = `Scan complete: ${result.files_found} files found`;
        if (result.thumbnails_failed > 0) {
          message += ` (${result.thumbnails_failed} thumbnail failures)`;
        }
        notify("success", message);
        loadStats();
      } catch (error) {
        log.error("Failed to scan folder:", error);
        notify("error", "Failed to scan folder");
      }
    },
    [scanFolder, scanOptions, loadStats]
  );

  const handleScanAll = useCallback(async () => {
    try {
      const results = await scanAll({
        create_hkmeta: scanOptions.createHkmeta,
        fetch_song_info: scanOptions.fetchSongInfo,
        fetch_lyrics: scanOptions.fetchLyrics,
        regenerate: scanOptions.regenerate,
        generate_thumbnails: scanOptions.generateThumbnails,
      });
      const totalFiles = results.reduce((sum, r) => sum + r.files_found, 0);
      const totalThumbFailed = results.reduce((sum, r) => sum + r.thumbnails_failed, 0);
      let message = `Scan complete: ${totalFiles} files found`;
      if (totalThumbFailed > 0) {
        message += ` (${totalThumbFailed} thumbnail failures)`;
      }
      notify("success", message);
      loadStats();
    } catch (error) {
      log.error("Failed to scan all folders:", error);
      notify("error", "Failed to scan folders");
    }
  }, [scanAll, scanOptions, loadStats]);

  return (
    <div>
      <h4 className="text-lg font-medium text-white mb-4">Local Library</h4>

      {/* Search Options */}
      <div className="mb-6">
        <div className="text-sm font-medium text-gray-300 mb-2">
          Search Options
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={getSetting(SETTINGS_KEYS.SEARCH_INCLUDE_LYRICS) === "true"}
              onChange={(e) =>
                handleChange(SETTINGS_KEYS.SEARCH_INCLUDE_LYRICS, e.target.checked ? "true" : "false")
              }
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">
              Include lyrics in search
            </span>
          </label>
          <p className="text-xs text-gray-500 ml-6">
            When enabled, search will also match lyrics content from .hkmeta.json files
          </p>
        </div>
      </div>

      {/* Watched Folders */}
      <div className="mb-6">
        <div className="text-sm font-medium text-gray-300 mb-2">
          Watched Folders
        </div>

        {isLoadingFolders ? (
          <div className="text-gray-400 text-sm py-4">Loading folders...</div>
        ) : folders.length === 0 ? (
          <div className="bg-gray-700/30 rounded-lg p-4 text-center">
            <FolderOpen size={32} className="mx-auto text-gray-500 mb-2" />
            <p className="text-gray-400 text-sm">No folders configured</p>
            <p className="text-gray-500 text-xs mt-1">
              Add folders to search local karaoke files
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center gap-2 bg-gray-700/50 rounded-lg p-3"
              >
                <FolderOpen size={18} className="text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{folder.name}</div>
                  <div className="text-xs text-gray-400 truncate">{folder.path}</div>
                  <div className="text-xs text-gray-500">
                    {folder.file_count} files
                    {folder.last_scan_at &&
                      ` · Last scan: ${new Date(folder.last_scan_at).toLocaleDateString()}`}
                  </div>
                </div>
                <button
                  onClick={() => handleScanFolder(folder.id)}
                  disabled={isScanning}
                  className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
                >
                  {isScanning ? "..." : "Rescan"}
                </button>
                <button
                  onClick={() => handleRemoveFolder(folder.id, folder.name)}
                  className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded transition-colors"
                  title="Remove folder"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleAddFolder}
          className="mt-3 flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors w-full justify-center"
        >
          <FolderPlus size={16} />
          Add Folder...
        </button>
      </div>

      {/* Rescan Options */}
      <div className="mb-6">
        <div className="text-sm font-medium text-gray-300 mb-2">
          Rescan Options
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scanOptions.createHkmeta}
              onChange={(e) =>
                setScanOptions((prev) => ({
                  ...prev,
                  createHkmeta: e.target.checked,
                }))
              }
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">
              Create .hkmeta.json files for new videos
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scanOptions.fetchSongInfo}
              onChange={(e) =>
                setScanOptions((prev) => ({
                  ...prev,
                  fetchSongInfo: e.target.checked,
                }))
              }
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">
              Fetch song info from MusicBrainz
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scanOptions.fetchLyrics}
              onChange={(e) =>
                setScanOptions((prev) => ({
                  ...prev,
                  fetchLyrics: e.target.checked,
                }))
              }
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">
              Fetch lyrics from Lrclib
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scanOptions.regenerate}
              onChange={(e) =>
                setScanOptions((prev) => ({
                  ...prev,
                  regenerate: e.target.checked,
                }))
              }
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">
              Regenerate existing metadata
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scanOptions.generateThumbnails}
              onChange={(e) =>
                setScanOptions((prev) => ({
                  ...prev,
                  generateThumbnails: e.target.checked,
                }))
              }
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">
              Generate thumbnails (requires ffmpeg)
            </span>
          </label>
        </div>
      </div>

      {/* Library Stats */}
      <div className="mb-6">
        <div className="text-sm font-medium text-gray-300 mb-2">
          Library Stats
        </div>
        <div className="bg-gray-700/30 rounded-lg p-3 text-sm text-gray-400">
          {stats ? (
            <>
              {stats.total_files} videos indexed · {stats.total_folders} folders
              {stats.last_scan_at && (
                <span className="ml-1">
                  · Last scan: {new Date(stats.last_scan_at).toLocaleString()}
                </span>
              )}
            </>
          ) : (
            "No stats available"
          )}
        </div>
      </div>

      {/* Rescan All Button */}
      <button
        onClick={handleScanAll}
        disabled={isScanning || folders.length === 0}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors w-full justify-center"
      >
        <RefreshCw size={16} className={isScanning ? "animate-spin" : ""} />
        {isScanning ? "Scanning..." : "Rescan All Folders"}
      </button>
    </div>
  );
}

// Define global type for the version
declare const __APP_VERSION__: string;

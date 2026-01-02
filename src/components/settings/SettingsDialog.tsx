import { useEffect, useState, useCallback } from "react";
import {
  X,
  Settings,
  Play,
  Monitor,
  List,
  Wrench,
  Info,
  FolderOpen,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore, SETTINGS_KEYS, notify } from "../../stores";
import { updateService, createLogger } from "../../services";
import type { SettingsTab } from "../../stores";

const log = createLogger("SettingsDialog");

const TABS: { id: SettingsTab; label: string; icon: typeof Play }[] = [
  { id: "playback", label: "Playback", icon: Play },
  { id: "display", label: "Display", icon: Monitor },
  { id: "queue", label: "Queue & History", icon: List },
  { id: "advanced", label: "Advanced", icon: Wrench },
  { id: "about", label: "About", icon: Info },
];

export function SettingsDialog() {
  const {
    showSettingsDialog,
    closeSettingsDialog,
    activeTab,
    setActiveTab,
    isLoading,
    getSetting,
    setSetting,
    resetToDefaults,
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
                {activeTab === "advanced" && (
                  <AdvancedSettings onResetToDefaults={handleResetToDefaults} />
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
    <div className="flex items-start justify-between py-3 border-b border-gray-700 last:border-b-0">
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

      <SettingRow
        label="Video Quality"
        description="Maximum quality for YouTube videos (not yet implemented)"
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

      <SettingRow
        label="Autoplay Next Song"
        description="Automatically play the next song in queue (not yet implemented)"
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
        description="Volume level when app starts (not yet implemented)"
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
          onChange={(v) => handleChange(SETTINGS_KEYS.DEFAULT_VOLUME, v)}
        />
      </SettingRow>

      <SettingRow
        label="Prefetch Next Video"
        description="Pre-load stream URL before current song ends (not yet implemented)"
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
    </div>
  );
}

function DisplaySettings({ getSetting, setSetting }: SettingsSectionProps) {
  const handleChange = createSettingHandler(setSetting);

  return (
    <div>
      <h4 className="text-lg font-medium text-white mb-4">Display</h4>

      <SettingRow
        label="Next Song Overlay"
        description="Show upcoming song info before current song ends (not yet implemented)"
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

      <SettingRow
        label="Singer Announcement"
        description="Duration to show current singer name (not yet implemented)"
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

      <SettingRow
        label="Remember Player Position"
        description="Restore detached player window position (not yet implemented)"
      >
        <ToggleSwitch
          checked={getSetting(SETTINGS_KEYS.REMEMBER_PLAYER_POSITION) === "true"}
          onChange={(v) =>
            handleChange(SETTINGS_KEYS.REMEMBER_PLAYER_POSITION, v ? "true" : "false")
          }
        />
      </SettingRow>
    </div>
  );
}

function QueueSettings({ getSetting, setSetting }: SettingsSectionProps) {
  const handleChange = createSettingHandler(setSetting);

  return (
    <div>
      <h4 className="text-lg font-medium text-white mb-4">Queue & History</h4>

      <SettingRow
        label="History Limit"
        description="Maximum number of songs to keep in history (not yet implemented)"
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

      <SettingRow
        label="Clear Queue on Exit"
        description="What to do with the queue when closing the app (not yet implemented)"
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
    </div>
  );
}

function AdvancedSettings({
  onResetToDefaults,
}: {
  onResetToDefaults: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleReset = () => {
    setShowConfirm(false);
    onResetToDefaults();
  };

  return (
    <div>
      <h4 className="text-lg font-medium text-white mb-4">Advanced</h4>

      <div className="text-sm text-gray-400 mb-6">
        Platform-specific settings will appear here in future updates.
      </div>

      <div className="pt-4 border-t border-gray-700">
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

// Define global type for the version
declare const __APP_VERSION__: string;

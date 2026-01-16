import { X, Monitor, Check } from "lucide-react";
import { useDisplayStore } from "../../stores";

export function DisplayRestoreDialog() {
  const {
    showRestoreDialog,
    pendingRestore,
    rememberChoice,
    isLoading,
    setRememberChoice,
    restoreLayout,
    dismissRestore,
  } = useDisplayStore();

  if (!showRestoreDialog || !pendingRestore) {
    return null;
  }

  const { savedConfig } = pendingRestore;
  const displayNames = savedConfig.display_names;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-4 w-96 shadow-xl border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Monitor size={20} className="text-blue-400" />
            <h3 className="text-lg font-medium text-white">
              Display Configuration Detected
            </h3>
          </div>
          <button
            onClick={dismissRestore}
            disabled={isLoading}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Dismiss"
            aria-label="Dismiss"
          >
            <X size={20} />
          </button>
        </div>

        {/* Display names */}
        <div className="mb-4">
          <p className="text-gray-300 mb-2">
            Detected:{" "}
            <strong className="text-white">{displayNames.join(", ")}</strong>
          </p>
          <p className="text-gray-400 text-sm">
            Would you like to restore the saved window layout for this
            configuration?
          </p>
        </div>

        {/* Remember choice checkbox */}
        <label className="flex items-center gap-2 text-gray-300 text-sm mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
            disabled={isLoading}
            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-gray-800"
          />
          <span>Remember my choice for this configuration</span>
        </label>

        {/* Saved config info */}
        {savedConfig.description && (
          <div className="mb-4 p-2 bg-gray-700/50 rounded text-sm text-gray-300">
            {savedConfig.description}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end border-t border-gray-700 pt-4">
          <button
            onClick={dismissRestore}
            disabled={isLoading}
            className="px-3 py-1.5 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            Not Now
          </button>
          <button
            onClick={() => restoreLayout()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded transition-colors"
          >
            <Check size={14} />
            {isLoading ? "Restoring..." : "Restore Layout"}
          </button>
        </div>
      </div>
    </div>
  );
}

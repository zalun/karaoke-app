import { X, Download, ExternalLink } from "lucide-react";
import { useUpdateStore } from "../../stores";

export function UpdateNotification() {
  const { updateInfo, isDismissed, dismissUpdate } = useUpdateStore();

  // Don't show if no update, already dismissed, or not available
  if (!updateInfo || !updateInfo.update_available || isDismissed) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm animate-slide-in">
      <div className="bg-blue-900/90 border border-blue-700 rounded-lg p-4 shadow-xl backdrop-blur">
        <div className="flex items-start gap-3">
          <Download className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-white">Update Available</h4>
            <p className="text-xs text-blue-200 mt-1">
              Version {updateInfo.latest_version} is now available.
              {updateInfo.release_name && (
                <span className="block text-blue-300 mt-0.5">
                  {updateInfo.release_name}
                </span>
              )}
            </p>
            <div className="flex gap-2 mt-3">
              <a
                href={updateInfo.download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Download
              </a>
              <a
                href={updateInfo.release_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-300 hover:text-white transition-colors"
              >
                Release Notes
              </a>
            </div>
          </div>
          <button
            onClick={dismissUpdate}
            className="text-blue-400 hover:text-white transition-colors flex-shrink-0"
            aria-label="Dismiss update notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

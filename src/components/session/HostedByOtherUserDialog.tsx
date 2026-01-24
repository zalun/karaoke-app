import { X, AlertTriangle } from "lucide-react";
import { useSessionStore } from "../../stores";

/**
 * Dialog shown when the current user is not the owner of the hosted session.
 * This informs the user that another user was hosting this session,
 * preserving privacy by not showing the original host's email.
 */
export function HostedByOtherUserDialog() {
  const { showHostedByOtherUserDialog, closeHostedByOtherUserDialog } =
    useSessionStore();

  if (!showHostedByOtherUserDialog) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-4 w-96 shadow-xl border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-yellow-400" />
            <h3 className="text-lg font-medium text-white">
              Session hosted by another user
            </h3>
          </div>
          <button
            onClick={closeHostedByOtherUserDialog}
            className="text-gray-400 hover:text-white transition-colors"
            title="Dismiss"
            aria-label="Dismiss"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="mb-4">
          <p className="text-gray-300 mb-2">
            This session was being hosted by another user.
          </p>
          <p className="text-gray-400 text-sm">
            They need to sign in and stop hosting, or the session will expire
            automatically.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end border-t border-gray-700 pt-4">
          <button
            onClick={closeHostedByOtherUserDialog}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

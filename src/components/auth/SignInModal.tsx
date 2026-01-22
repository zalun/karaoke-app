import { Loader2, ExternalLink } from "lucide-react";

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal that shows while user is completing authentication in the browser.
 * The browser is already open when this modal is shown.
 */
export function SignInModal({ isOpen, onClose }: SignInModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-md mx-4 p-6">
        {/* Content */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 text-blue-400 mb-4">
            <Loader2 size={28} className="animate-spin" />
          </div>

          <h2 className="text-xl font-semibold text-white mb-2">
            Complete Sign In
          </h2>

          <p className="text-gray-400 mb-4">
            A browser window has opened for you to sign in.
          </p>

          <div className="bg-gray-700/50 rounded-lg p-4 mb-6 text-left">
            <div className="flex items-start gap-3 text-sm text-gray-300">
              <ExternalLink size={18} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-white mb-1">In the browser:</p>
                <ol className="list-decimal list-inside space-y-1 text-gray-400">
                  <li>Sign in with Google, Apple, or Email</li>
                  <li>Authorize the HomeKaraoke app</li>
                  <li>You'll be returned here automatically</li>
                </ol>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

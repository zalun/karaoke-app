import { useState } from "react";
import { X, ExternalLink, Loader2 } from "lucide-react";
import { useAuthStore } from "../../stores";

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal that explains the sign-in process and provides a button to open the browser.
 * Shows while waiting for the user to complete authentication in the browser.
 */
export function SignInModal({ isOpen, onClose }: SignInModalProps) {
  const { signIn, isLoading } = useAuthStore();
  const [waitingForAuth, setWaitingForAuth] = useState(false);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setWaitingForAuth(true);
    try {
      await signIn();
      // signIn opens the browser - we stay in "waiting" state until
      // the deep link callback is received (handled by authStore)
    } catch (error) {
      // Error logged in store
      setWaitingForAuth(false);
    }
  };

  const handleClose = () => {
    setWaitingForAuth(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-md mx-4 p-6">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className="text-center">
          <div className="text-5xl mb-4">🔐</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Sign in to HomeKaraoke
          </h2>
          <p className="text-gray-400 mb-6">
            Sign in to access your cloud playlists, sync favorites, and host karaoke sessions.
          </p>

          {waitingForAuth || isLoading ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3 text-blue-400">
                <Loader2 size={24} className="animate-spin" />
                <span>Waiting for sign in...</span>
              </div>
              <p className="text-sm text-gray-500">
                Complete the sign in process in your browser, then return here.
              </p>
              <button
                onClick={handleClose}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={handleSignIn}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
              >
                <ExternalLink size={18} />
                <span>Open Browser to Sign In</span>
              </button>

              <p className="text-xs text-gray-500">
                You'll be redirected to homekaraoke.app to sign in with Google, Apple, or Email.
              </p>

              <button
                onClick={handleClose}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Continue without account
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

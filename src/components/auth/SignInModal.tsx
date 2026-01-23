import { useState } from "react";
import { Loader2, ExternalLink, ClipboardPaste } from "lucide-react";
import { useAuthStore } from "../../stores";
import { authService } from "../../services/auth";

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal that shows while user is completing authentication in the browser.
 * Includes a fallback to paste the callback URL manually (for dev mode).
 */
export function SignInModal({ isOpen, onClose }: SignInModalProps) {
  const { handleAuthCallback } = useAuthStore();
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleManualSubmit = async () => {
    setError(null);
    try {
      // Parse the URL to extract query params
      const url = new URL(manualUrl);
      const params: Record<string, string> = {};

      // First try query parameters
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });

      // If no query params, check hash fragment (Supabase uses hash)
      if (Object.keys(params).length === 0 && url.hash) {
        const fragment = url.hash.substring(1);
        fragment.split("&").forEach((pair) => {
          const [key, value] = pair.split("=");
          if (key && value) {
            params[key] = decodeURIComponent(value);
          }
        });
      }

      if (!params.access_token || !params.refresh_token) {
        setError("Invalid callback URL - missing tokens");
        return;
      }

      // Validate state for CSRF protection (required for manual input too)
      if (!params.state) {
        setError("Invalid callback URL - missing state parameter");
        return;
      }

      if (!authService.validateState(params.state)) {
        setError("Security validation failed - please try signing in again");
        return;
      }

      await handleAuthCallback(params);
      onClose();
    } catch {
      setError("Invalid URL format");
    }
  };

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

          <div className="bg-gray-700/50 rounded-lg p-4 mb-4 text-left">
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

          {/* Manual URL input fallback */}
          {showManualInput ? (
            <div className="mb-4 text-left">
              <label className="block text-sm text-gray-400 mb-2">
                Paste the callback URL from the browser:
              </label>
              <input
                type="text"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="homekaraoke://auth/callback?..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              {error && (
                <p className="text-red-400 text-sm mt-1">{error}</p>
              )}
              <button
                onClick={handleManualSubmit}
                disabled={!manualUrl}
                className="mt-2 w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white text-sm rounded-lg transition-colors"
              >
                Submit
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowManualInput(true)}
              className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors mb-4 mx-auto"
            >
              <ClipboardPaste size={14} />
              <span>Paste callback URL manually</span>
            </button>
          )}

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

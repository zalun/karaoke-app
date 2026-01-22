import { useState, useEffect } from "react";
import { Loader2, LogIn, WifiOff } from "lucide-react";
import { useAuthStore } from "../../stores";
import { UserMenu } from "./UserMenu";
import { SignInModal } from "./SignInModal";

/**
 * AuthStatus displays the current authentication state in a compact form:
 * - Loading spinner while checking auth status
 * - Sign In button when not authenticated (opens modal)
 * - UserMenu when authenticated
 * - Offline indicator when network is unavailable
 */
export function AuthStatus() {
  const { isAuthenticated, isLoading, isOffline, user } = useAuthStore();
  const [showSignInModal, setShowSignInModal] = useState(false);

  // Close modal when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setShowSignInModal(false);
    }
  }, [isAuthenticated]);

  // Show loading state during initial auth check
  if (isLoading && !isAuthenticated && !user) {
    return (
      <div className="flex items-center justify-center p-2">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // Show user menu when authenticated
  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-2">
        {isOffline && <OfflineIndicator />}
        <UserMenu />
      </div>
    );
  }

  // Show compact sign-in button when not authenticated
  return (
    <>
      <div className="flex items-center gap-2">
        {isOffline && <OfflineIndicator />}
        <button
          onClick={() => setShowSignInModal(true)}
          disabled={isOffline}
          title={isOffline ? "Sign in unavailable while offline" : undefined}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <LogIn size={16} />
          <span>Sign In</span>
        </button>
      </div>

      <SignInModal
        isOpen={showSignInModal}
        onClose={() => setShowSignInModal(false)}
      />
    </>
  );
}

/**
 * Compact offline indicator shown next to auth controls
 */
function OfflineIndicator() {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 text-xs text-yellow-400 bg-yellow-900/30 rounded-lg"
      title="You are offline. Some features may be unavailable."
    >
      <WifiOff size={14} />
      <span>Offline</span>
    </div>
  );
}

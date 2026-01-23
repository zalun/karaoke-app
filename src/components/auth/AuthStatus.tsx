import { useState, useEffect } from "react";
import { Loader2, LogIn, LogOut, User, WifiOff } from "lucide-react";
import { useAuthStore } from "../../stores";
import { UserMenu } from "./UserMenu";
import { SignInModal } from "./SignInModal";

/**
 * AuthStatus displays the current authentication state in a compact form:
 * - Loading spinner while checking auth status (initial load only)
 * - Sign In button when not authenticated (opens browser + modal)
 * - UserMenu when authenticated
 * - Offline indicator when network is unavailable
 */
export function AuthStatus() {
  const { isAuthenticated, isLoading, isOffline, user, signIn, cancelSignIn } = useAuthStore();
  const [showSignInModal, setShowSignInModal] = useState(false);

  // Close modal when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setShowSignInModal(false);
    }
  }, [isAuthenticated]);

  const handleSignIn = async () => {
    // Show modal and open browser immediately
    setShowSignInModal(true);
    try {
      await signIn();
    } catch {
      // Error logged in store, close modal on failure
      setShowSignInModal(false);
    }
  };

  // Show user menu when authenticated with user profile
  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-2">
        {isOffline && <OfflineIndicator />}
        <UserMenu />
      </div>
    );
  }

  // Show simple signed-in state when authenticated but no user profile
  if (isAuthenticated && !user) {
    return (
      <div className="flex items-center gap-2">
        {isOffline && <OfflineIndicator />}
        <button
          onClick={() => useAuthStore.getState().signOut()}
          disabled={isLoading}
          title="Sign Out"
          className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center text-white hover:bg-green-600 transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <User size={18} />}
        </button>
      </div>
    );
  }

  // Show loading state during initial auth check (not when signing in)
  // We check !showSignInModal to keep the modal visible during sign-in
  if (isLoading && !showSignInModal) {
    return (
      <div className="flex items-center gap-2">
        {isOffline && <OfflineIndicator />}
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
          <Loader2 size={18} className="animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  // Show sign-in button (and modal if open) when not authenticated
  return (
    <>
      <div className="flex items-center gap-2">
        {isOffline && <OfflineIndicator />}
        <button
          onClick={handleSignIn}
          disabled={isOffline || isLoading}
          title={isOffline ? "Sign in unavailable while offline" : "Sign In"}
          className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          <LogIn size={18} />
        </button>
      </div>

      <SignInModal
        isOpen={showSignInModal}
        onClose={() => {
          setShowSignInModal(false);
          cancelSignIn();
        }}
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

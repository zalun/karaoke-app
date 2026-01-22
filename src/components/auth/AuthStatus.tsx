import { Loader2, LogIn } from "lucide-react";
import { useAuthStore } from "../../stores";
import { UserMenu } from "./UserMenu";

/**
 * AuthStatus displays the current authentication state in a compact form:
 * - Loading spinner while checking auth status
 * - Sign In button when not authenticated
 * - UserMenu when authenticated
 */
export function AuthStatus() {
  const { isAuthenticated, isLoading, user, signIn } = useAuthStore();

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
    return <UserMenu />;
  }

  // Show compact sign-in button when not authenticated
  return (
    <button
      onClick={() => signIn()}
      disabled={isLoading}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
    >
      <LogIn size={16} />
      <span>Sign In</span>
    </button>
  );
}

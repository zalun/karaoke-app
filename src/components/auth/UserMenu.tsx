import { useState, useRef, useEffect } from "react";
import { LogOut } from "lucide-react";
import { useAuthStore } from "../../stores";

export function UserMenu() {
  const { user, signOut, isLoading } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  // Reset avatar error state when user changes (e.g., different account)
  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatarUrl]);

  if (!user) return null;

  const handleSignOut = async () => {
    setIsOpen(false);
    try {
      await signOut();
    } catch {
      // Error is logged in the store
    }
  };

  // Get initials for avatar fallback
  const initials = user.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="rounded-full hover:ring-2 hover:ring-gray-600 transition-all disabled:opacity-50"
        title={user.displayName}
      >
        {/* Avatar */}
        {user.avatarUrl && !avatarError ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName}
            className="w-8 h-8 rounded-full object-cover"
            onError={() => setAvatarError(true)}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-medium text-white">
            {initials}
          </div>
        )}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          {/* User info header */}
          <div className="px-4 py-2 border-b border-gray-700">
            <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            disabled={isLoading}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <LogOut size={16} className="text-gray-400" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

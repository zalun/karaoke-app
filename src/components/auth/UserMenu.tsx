import { useState, useRef, useEffect } from "react";
import { LogOut, Settings, ChevronDown } from "lucide-react";
import { useAuthStore } from "../../stores";

export function UserMenu() {
  const { user, signOut, isLoading } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
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
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
      >
        {/* Avatar */}
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName}
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-medium text-white">
            {initials}
          </div>
        )}
        {/* Name (hidden on small screens) */}
        <span className="hidden sm:block text-sm text-gray-200 max-w-[120px] truncate">
          {user.displayName}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <a
              href="https://homekaraoke.app/account"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Settings size={16} className="text-gray-400" />
              Account Settings
            </a>
            <button
              onClick={handleSignOut}
              disabled={isLoading}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <LogOut size={16} className="text-gray-400" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

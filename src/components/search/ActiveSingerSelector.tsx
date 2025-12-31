import { useSessionStore } from "../../stores";
import { SingerAvatar } from "../singers";
import { ChevronDown, User } from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

export function ActiveSingerSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const session = useSessionStore((state) => state.session);
  const singers = useSessionStore((state) => state.singers);
  const activeSingerId = useSessionStore((state) => state.activeSingerId);
  const setActiveSinger = useSessionStore((state) => state.setActiveSinger);
  const getSingerById = useSessionStore((state) => state.getSingerById);

  const activeSinger = activeSingerId ? getSingerById(activeSingerId) : null;

  // All menu options: null (No singer) + all singers
  const menuOptions = useMemo(() => [null, ...singers.map((s) => s.id)], [singers]);

  // Handle selection - defined before handleKeyDown to avoid stale closure
  const handleSelect = useCallback(
    async (singerId: number | null) => {
      await setActiveSinger(singerId);
      setIsOpen(false);
      setFocusedIndex(-1);
      buttonRef.current?.focus();
    },
    [setActiveSinger]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Focus management when dropdown opens
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && menuItemsRef.current[focusedIndex]) {
      menuItemsRef.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!isOpen) {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
          event.preventDefault();
          setIsOpen(true);
          setFocusedIndex(0);
        }
        return;
      }

      switch (event.key) {
        case "Escape":
          event.preventDefault();
          setIsOpen(false);
          setFocusedIndex(-1);
          buttonRef.current?.focus();
          break;
        case "ArrowDown":
          event.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, menuOptions.length - 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          if (focusedIndex >= 0) {
            handleSelect(menuOptions[focusedIndex]);
          }
          break;
        case "Tab":
          setIsOpen(false);
          setFocusedIndex(-1);
          break;
      }
    },
    [isOpen, focusedIndex, menuOptions, handleSelect]
  );

  // Don't render if no active session
  if (!session) {
    return null;
  }

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setFocusedIndex(0);
    } else {
      setFocusedIndex(-1);
    }
  };

  return (
    <div className="relative flex items-center gap-2 text-sm" onKeyDown={handleKeyDown}>
      <span className="text-gray-400" id="active-singer-label">
        Adding as:
      </span>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        aria-labelledby="active-singer-label"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
      >
        {activeSinger ? (
          <>
            <SingerAvatar name={activeSinger.name} color={activeSinger.color} size="sm" />
            <span className="text-white">{activeSinger.name}</span>
          </>
        ) : (
          <>
            <User size={16} className="text-gray-400" />
            <span className="text-gray-400">No singer</span>
          </>
        )}
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          role="listbox"
          aria-labelledby="active-singer-label"
          aria-activedescendant={focusedIndex >= 0 ? `singer-option-${focusedIndex}` : undefined}
          className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[200px] z-50"
        >
          {/* No singer option */}
          <button
            ref={(el) => (menuItemsRef.current[0] = el)}
            id="singer-option-0"
            role="option"
            aria-selected={!activeSingerId}
            onClick={() => handleSelect(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 transition-colors rounded-t-lg ${
              !activeSingerId ? "bg-gray-700" : ""
            } ${focusedIndex === 0 ? "ring-2 ring-inset ring-blue-500" : ""}`}
          >
            <User size={16} className="text-gray-400" />
            <span className="text-gray-300">No singer</span>
          </button>

          {singers.length > 0 && (
            <div className="border-t border-gray-700">
              {singers.map((singer, index) => (
                <button
                  ref={(el) => (menuItemsRef.current[index + 1] = el)}
                  key={singer.id}
                  id={`singer-option-${index + 1}`}
                  role="option"
                  aria-selected={activeSingerId === singer.id}
                  onClick={() => handleSelect(singer.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 transition-colors ${
                    activeSingerId === singer.id ? "bg-gray-700" : ""
                  } ${index === singers.length - 1 ? "rounded-b-lg" : ""} ${
                    focusedIndex === index + 1 ? "ring-2 ring-inset ring-blue-500" : ""
                  }`}
                >
                  <SingerAvatar name={singer.name} color={singer.color} size="sm" />
                  <span className="text-gray-200">{singer.name}</span>
                </button>
              ))}
            </div>
          )}

          {singers.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-700 rounded-b-lg">
              No singers in session. Add singers in the Session panel.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

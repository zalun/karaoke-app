import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Users, Check, UserPlus, Star } from "lucide-react";
import { useSessionStore, useFavoritesStore } from "../../stores";
import { SingerAvatar } from "./SingerAvatar";
import { sessionService } from "../../services";

const DROPDOWN_WIDTH = 200;
const DROPDOWN_OFFSET_Y = 8;
const DROPDOWN_MAX_HEIGHT = 300;
const DROPDOWN_MARGIN = 8;

interface DropdownPosition {
  top: number;
  left: number;
  openAbove: boolean;
  maxHeight: number;
}

interface SingerPickerProps {
  queueItemId: string;
  className?: string;
}

export function SingerPicker({ queueItemId, className = "" }: SingerPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showNewSinger, setShowNewSinger] = useState(false);
  const [newSingerName, setNewSingerName] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>({ top: 0, left: 0, openAbove: true, maxHeight: DROPDOWN_MAX_HEIGHT });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    session,
    singers,
    getQueueItemSingerIds,
    assignSingerToQueueItem,
    removeSingerFromQueueItem,
    createSinger,
    loadSingers,
  } = useSessionStore();

  const {
    persistentSingers,
    loadPersistentSingers,
  } = useFavoritesStore();

  const assignedSingerIds = getQueueItemSingerIds(queueItemId);

  // Persistent singers not yet in session
  const availablePersistentSingers = persistentSingers.filter(
    (ps) => !singers.some((s) => s.id === ps.id)
  );

  // Load persistent singers when dropdown opens
  useEffect(() => {
    if (isOpen) {
      loadPersistentSingers();
    }
  }, [isOpen, loadPersistentSingers]);

  // Calculate and update dropdown position
  const updateDropdownPosition = useCallback(() => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const spaceAbove = rect.top - DROPDOWN_MARGIN;
    const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_MARGIN;

    // Check if dropdown can fit in each direction
    const canFitAbove = spaceAbove >= DROPDOWN_MAX_HEIGHT;
    const canFitBelow = spaceBelow >= DROPDOWN_MAX_HEIGHT;

    // Prefer opening above if it fits, otherwise open below if it fits,
    // otherwise open where there's more space
    const openAbove = canFitAbove || (!canFitBelow && spaceAbove > spaceBelow);

    // Calculate actual max height based on available space
    const availableSpace = openAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(DROPDOWN_MAX_HEIGHT, availableSpace - DROPDOWN_OFFSET_Y);

    setDropdownPosition({
      top: openAbove ? rect.top - DROPDOWN_OFFSET_Y : rect.bottom + DROPDOWN_OFFSET_Y,
      left: Math.max(DROPDOWN_MARGIN, Math.min(rect.right - DROPDOWN_WIDTH, window.innerWidth - DROPDOWN_WIDTH - DROPDOWN_MARGIN)),
      openAbove,
      maxHeight: Math.max(100, maxHeight), // Ensure minimum usable height
    });
  }, []);

  // Update dropdown position when opened and on window resize
  useEffect(() => {
    if (!isOpen) return;

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    return () => window.removeEventListener("resize", updateDropdownPosition);
  }, [isOpen, updateDropdownPosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
        setShowNewSinger(false);
        setNewSingerName("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Focus input when showing new singer form
  useEffect(() => {
    if (showNewSinger && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewSinger]);

  // Don't render if no active session
  if (!session) {
    return null;
  }

  const handleToggleSinger = async (singerId: number) => {
    if (assignedSingerIds.includes(singerId)) {
      await removeSingerFromQueueItem(queueItemId, singerId);
    } else {
      await assignSingerToQueueItem(queueItemId, singerId);
    }
  };

  // Add an existing persistent singer to the current session and assign to queue item
  const handleAddPersistentSingerToSession = async (singerId: number) => {
    if (!session) return;
    await sessionService.addSingerToSession(session.id, singerId);
    await loadSingers();
    await assignSingerToQueueItem(queueItemId, singerId);
  };

  const handleCreateAndAssign = async () => {
    if (!newSingerName.trim()) return;

    const singer = await createSinger(newSingerName.trim());
    await assignSingerToQueueItem(queueItemId, singer.id);

    setNewSingerName("");
    setShowNewSinger(false);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCreateAndAssign();
    } else if (e.key === "Escape") {
      setShowNewSinger(false);
      setNewSingerName("");
      setIsOpen(false);
    }
  };

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[220px] flex flex-col"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        transform: dropdownPosition.openAbove ? "translateY(-100%)" : "translateY(0)",
        maxHeight: `${dropdownPosition.maxHeight}px`,
        zIndex: 9999,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="overflow-y-auto flex-1">
        {/* Session Singers */}
        {singers.length > 0 && (
          <div className="py-1">
            <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wide">
              Session Singers
            </div>
            {singers.map((singer) => {
              const isAssigned = assignedSingerIds.includes(singer.id);
              return (
                <button
                  key={singer.id}
                  onClick={() => handleToggleSinger(singer.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 transition-colors"
                >
                  <SingerAvatar
                    name={singer.name}
                    color={singer.color}
                    size="sm"
                  />
                  <span className="text-sm text-gray-200 flex-1 text-left">
                    {singer.name}
                    {singer.is_persistent && (
                      <Star size={10} className="inline ml-1 text-yellow-500" />
                    )}
                  </span>
                  {isAssigned && (
                    <Check size={16} className="text-green-500" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Available Persistent Singers (not yet in session) */}
        {availablePersistentSingers.length > 0 && (
          <div className={`py-1 ${singers.length > 0 ? "border-t border-gray-700" : ""}`}>
            <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Star size={10} className="text-yellow-500" />
              Add Persistent Singer
            </div>
            {availablePersistentSingers.map((singer) => (
              <button
                key={singer.id}
                onClick={() => handleAddPersistentSingerToSession(singer.id)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 transition-colors"
              >
                <SingerAvatar
                  name={singer.name}
                  color={singer.color}
                  size="sm"
                />
                <span className="text-sm text-gray-200 flex-1 text-left">
                  {singer.name}
                  {singer.unique_name && (
                    <span className="text-gray-400 text-xs ml-1">
                      ({singer.unique_name})
                    </span>
                  )}
                </span>
                <UserPlus size={14} className="text-blue-400" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`flex-shrink-0 ${singers.length > 0 || availablePersistentSingers.length > 0 ? "border-t border-gray-700" : ""}`}>
        {showNewSinger ? (
          <div className="p-2 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newSingerName}
              onChange={(e) => setNewSingerName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="New session singer..."
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleCreateAndAssign}
              disabled={!newSingerName.trim()}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 rounded text-sm text-white transition-colors"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewSinger(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-blue-400 hover:bg-gray-700 transition-colors"
          >
            <UserPlus size={16} />
            <span className="text-sm">New session singer...</span>
          </button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1.5 rounded-full bg-gray-600 hover:bg-blue-600 text-gray-200 hover:text-white transition-colors ring-1 ring-gray-500 hover:ring-blue-500"
        title="Assign singers"
      >
        <Users size={14} />
      </button>
      {createPortal(dropdown, document.body)}
    </div>
  );
}

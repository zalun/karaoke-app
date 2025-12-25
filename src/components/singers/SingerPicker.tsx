import { useState, useRef, useEffect } from "react";
import { Plus, Check, UserPlus } from "lucide-react";
import { useSessionStore } from "../../stores";
import { SingerAvatar } from "./SingerAvatar";

interface SingerPickerProps {
  queueItemId: string;
  className?: string;
}

export function SingerPicker({ queueItemId, className = "" }: SingerPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showNewSinger, setShowNewSinger] = useState(false);
  const [newSingerName, setNewSingerName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    session,
    singers,
    getQueueItemSingerIds,
    assignSingerToQueueItem,
    removeSingerFromQueueItem,
    createSinger,
  } = useSessionStore();

  const assignedSingerIds = getQueueItemSingerIds(queueItemId);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowNewSinger(false);
        setNewSingerName("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const handleCreateAndAssign = async () => {
    if (!newSingerName.trim()) return;

    const singer = await createSinger(newSingerName.trim());
    await assignSingerToQueueItem(queueItemId, singer.id);

    setNewSingerName("");
    setShowNewSinger(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCreateAndAssign();
    } else if (e.key === "Escape") {
      setShowNewSinger(false);
      setNewSingerName("");
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
        title="Assign singers"
      >
        <Plus size={16} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[200px]">
          {singers.length > 0 && (
            <div className="py-1">
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
                    </span>
                    {isAssigned && (
                      <Check size={16} className="text-green-500" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="border-t border-gray-700">
            {showNewSinger ? (
              <div className="p-2 flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newSingerName}
                  onChange={(e) => setNewSingerName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Singer name..."
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
                <span className="text-sm">New singer...</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

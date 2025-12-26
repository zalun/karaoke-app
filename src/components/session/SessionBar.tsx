import { useState, useEffect, useRef } from "react";
import { Play, Square, Users, UserPlus } from "lucide-react";
import { useSessionStore } from "../../stores";
import { SingerAvatar, SingerChip } from "../singers";

const MAX_VISIBLE_SINGERS = 10;

export function SessionBar() {
  const {
    session,
    singers,
    isLoading,
    queueSingerAssignments,
    startSession,
    endSession,
    loadSession,
    createSinger,
    deleteSinger,
  } = useSessionStore();

  // Check if a singer is assigned to any queue item
  const isSingerAssigned = (singerId: number): boolean => {
    for (const singerIds of queueSingerAssignments.values()) {
      if (singerIds.includes(singerId)) return true;
    }
    return false;
  };

  const [showSingers, setShowSingers] = useState(false);
  const [showNewSinger, setShowNewSinger] = useState(false);
  const [newSingerName, setNewSingerName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Load session on mount
  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Focus input when showing new singer form
  useEffect(() => {
    if (showNewSinger && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewSinger]);

  const handleCreateSinger = async () => {
    const name = newSingerName.trim();
    if (!name) return;
    try {
      await createSinger(name);
      setNewSingerName("");
      setShowNewSinger(false);
    } catch (error) {
      console.error("Failed to create singer:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCreateSinger();
    } else if (e.key === "Escape") {
      setShowNewSinger(false);
      setNewSingerName("");
    }
  };

  const handleStartSession = async () => {
    await startSession();
  };

  const handleEndSession = async () => {
    await endSession();
  };

  if (!session) {
    return (
      <div className="bg-gray-800 rounded-lg px-4 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">No active session</span>
          <button
            onClick={handleStartSession}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
          >
            <Play size={14} />
            Start Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {session.name && <span className="text-sm text-gray-400">{session.name}</span>}
          </div>

          {/* Singers indicator */}
          <button
            onClick={() => setShowSingers(!showSingers)}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-700 transition-colors"
          >
            <Users size={14} className="text-gray-400" />
            {singers.length > 0 ? (
              <div className="flex -space-x-1">
                {singers.slice(0, MAX_VISIBLE_SINGERS).map((singer) => (
                  <SingerAvatar
                    key={singer.id}
                    name={singer.name}
                    color={singer.color}
                    size="sm"
                    className={`ring-1 ring-gray-800 ${!isSingerAssigned(singer.id) ? "opacity-50" : ""}`}
                  />
                ))}
                {singers.length > MAX_VISIBLE_SINGERS && (
                  <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs text-gray-300 ring-1 ring-gray-800">
                    +{singers.length - MAX_VISIBLE_SINGERS}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-xs text-gray-400">No singers</span>
            )}
          </button>
        </div>

        <button
          onClick={handleEndSession}
          disabled={isLoading}
          className="p-1.5 bg-red-600/80 hover:bg-red-600 disabled:bg-gray-600 text-white rounded transition-colors"
          title="End Session"
        >
          <Square size={16} />
        </button>
      </div>

      {/* Expandable singers panel */}
      {showSingers && (
        <div className="mt-2 pt-2 border-t border-gray-600">
          <div className="flex flex-wrap items-center gap-2">
            {singers.map((singer) => (
              <SingerChip
                key={singer.id}
                name={singer.name}
                color={singer.color}
                faded={!isSingerAssigned(singer.id)}
                onRemove={() => deleteSinger(singer.id)}
              />
            ))}
            {showNewSinger ? (
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newSingerName}
                  onChange={(e) => setNewSingerName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Singer name..."
                  className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 w-32"
                />
                <button
                  onClick={handleCreateSinger}
                  disabled={!newSingerName.trim()}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 rounded text-sm text-white transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowNewSinger(false);
                    setNewSingerName("");
                  }}
                  className="text-gray-400 hover:text-gray-200 text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewSinger(true)}
                className="flex items-center gap-1 px-2 py-1 text-blue-400 hover:bg-gray-700 rounded transition-colors text-sm"
              >
                <UserPlus size={14} />
                Add singer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

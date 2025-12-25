import { useState, useEffect } from "react";
import { Play, Square, Users } from "lucide-react";
import { useSessionStore } from "../../stores";
import { SingerAvatar, SingerChip } from "../singers";

export function SessionBar() {
  const {
    session,
    singers,
    isLoading,
    startSession,
    endSession,
    loadSession,
    deleteSinger,
  } = useSessionStore();

  const [showSingers, setShowSingers] = useState(false);

  // Load session on mount
  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleStartSession = async () => {
    await startSession();
  };

  const handleEndSession = async () => {
    if (confirm("End the current session? Non-persistent singers will be removed.")) {
      await endSession();
    }
  };

  if (!session) {
    return (
      <div className="bg-gray-800/50 border-b border-gray-700 px-4 py-2">
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
    <div className="bg-gray-800/50 border-b border-gray-700 px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-gray-200">
              Session Active
              {session.name && <span className="text-gray-400 ml-1">({session.name})</span>}
            </span>
          </div>

          {/* Singers indicator */}
          <button
            onClick={() => setShowSingers(!showSingers)}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-700 transition-colors"
          >
            <Users size={14} className="text-gray-400" />
            {singers.length > 0 ? (
              <div className="flex -space-x-1">
                {singers.slice(0, 4).map((singer) => (
                  <SingerAvatar
                    key={singer.id}
                    name={singer.name}
                    color={singer.color}
                    size="sm"
                    className="ring-1 ring-gray-800"
                  />
                ))}
                {singers.length > 4 && (
                  <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs text-gray-300 ring-1 ring-gray-800">
                    +{singers.length - 4}
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
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/80 hover:bg-red-600 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
        >
          <Square size={14} />
          End Session
        </button>
      </div>

      {/* Expandable singers panel */}
      {showSingers && singers.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <div className="flex flex-wrap gap-2">
            {singers.map((singer) => (
              <SingerChip
                key={singer.id}
                name={singer.name}
                color={singer.color}
                onRemove={
                  singer.is_persistent
                    ? undefined
                    : () => deleteSinger(singer.id)
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

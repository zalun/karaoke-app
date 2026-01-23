import { useState, useEffect, useRef } from "react";
import { Play, Square, Users, UserPlus, X, Trash2, Pencil, Check, FolderOpen, Star, Globe, Loader2 } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useSessionStore, useFavoritesStore, useAuthStore, notify } from "../../stores";
import { SingerAvatar, SingerChip } from "../singers";
import { sessionService, createLogger } from "../../services";
import { HostSessionModal } from "./HostSessionModal";

const log = createLogger("SessionBar");
const MAX_VISIBLE_SINGERS = 10;

export function SessionBar() {
  const [createError, setCreateError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const {
    session,
    singers,
    isLoading,
    queueSingerAssignments,
    showRenameDialog,
    showLoadDialog,
    recentSessions,
    recentSessionSingers,
    hostedSession,
    startSession,
    endSession,
    loadSession,
    createSinger,
    removeSingerFromSession,
    renameSession,
    switchToSession,
    openRenameDialog,
    closeRenameDialog,
    openLoadDialog,
    closeLoadDialog,
    deleteSession,
    renameStoredSession,
    loadSingers,
    hostSession,
    openHostModal,
  } = useSessionStore();

  const { isAuthenticated } = useAuthStore();

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

  // Hosting state
  const [isHostingLoading, setIsHostingLoading] = useState(false);
  
  // State for editing stored session names
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");
  const editSessionInputRef = useRef<HTMLInputElement>(null);

  // State for confirming session deletion
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<number | null>(null);

  // Load session on mount
  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Listen for menu event to show rename dialog
  useEffect(() => {
    let mounted = true;
    let unlistenFn: (() => void) | null = null;

    listen("show-rename-session-dialog", () => {
      if (mounted && session) {
        setRenameValue(session.name || "");
        setRenameError(null);
        openRenameDialog();
      }
    }).then((fn) => {
      if (mounted) {
        unlistenFn = fn;
      } else {
        fn(); // Component already unmounted, clean up immediately
      }
    });

    return () => {
      mounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, [session, openRenameDialog]);

  // Listen for menu event to show load session dialog
  useEffect(() => {
    let mounted = true;
    let unlistenFn: (() => void) | null = null;

    listen("show-load-session-dialog", () => {
      if (mounted) {
        openLoadDialog();
      }
    }).then((fn) => {
      if (mounted) {
        unlistenFn = fn;
      } else {
        fn(); // Component already unmounted, clean up immediately
      }
    });

    return () => {
      mounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, [openLoadDialog]);

  // Focus rename input when dialog opens
  useEffect(() => {
    if (showRenameDialog && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [showRenameDialog]);

  // Focus input when showing new singer form
  useEffect(() => {
    if (showNewSinger && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewSinger]);

  // Focus input when editing session name
  useEffect(() => {
    if (editingSessionId && editSessionInputRef.current) {
      editSessionInputRef.current.focus();
      editSessionInputRef.current.select();
    }
  }, [editingSessionId]);

  const handleCreateSinger = async () => {
    const name = newSingerName.trim();
    if (!name) return;
    setCreateError(null);
    try {
      await createSinger(name);
      setNewSingerName("");
      setShowNewSinger(false);
    } catch (error) {
      // Handle both Error objects and Tauri command errors ({type, message})
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? (error as { message: string }).message
            : "Failed to create singer";
      setCreateError(message);
    }
  };

  const handleRemoveSinger = async (singerId: number) => {
    setRemoveError(null);
    try {
      await removeSingerFromSession(singerId);
    } catch (error) {
      // Handle both Error objects and Tauri command errors ({type, message})
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? (error as { message: string }).message
            : "Failed to remove singer";
      setRemoveError(message);
      log.error("Failed to remove singer:", error);
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

  const handleHostSession = async () => {
    setIsHostingLoading(true);
    try {
      await hostSession();
      notify("success", "Session is now hosted! Guests can join with the code.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to host session";
      log.error(`Failed to host session: ${message}`);
      notify("error", "Failed to host session. Please try again.");
    } finally {
      setIsHostingLoading(false);
    }
  };

  const handleEndSession = async () => {
    await endSession();
  };

  const handleRenameSession = async () => {
    const name = renameValue.trim();
    if (!name) return;
    setRenameError(null);
    try {
      await renameSession(name);
    } catch (error) {
      // Handle both Error objects and Tauri command errors ({type, message})
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? (error as { message: string }).message
            : "Failed to rename session";
      setRenameError(message);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSession();
    } else if (e.key === "Escape") {
      closeRenameDialog();
      setRenameError(null);
    }
  };

  const { persistentSingers, loadPersistentSingers, openLoadFavoritesDialog } = useFavoritesStore();
  const [showPersistentDropdown, setShowPersistentDropdown] = useState(false);

  // Persistent singers not yet in session
  const availablePersistentSingers = (persistentSingers || []).filter(
    (ps) => !singers.some((s) => s.id === ps.id)
  );

  // Load persistent singers when dropdown opens
  useEffect(() => {
    if (showPersistentDropdown) {
      loadPersistentSingers();
    }
  }, [showPersistentDropdown, loadPersistentSingers]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showPersistentDropdown) return;
    const handleClick = () => setShowPersistentDropdown(false);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showPersistentDropdown]);

  const handleAddPersistentSinger = async (singerId: number) => {
    if (!session) return;
    try {
      await sessionService.addSingerToSession(session.id, singerId);
      await loadSingers();
      setShowPersistentDropdown(false);
    } catch (error) {
      log.error("Failed to add persistent singer:", error);
    }
  };

  const handleMakePermanent = async (singerId: number) => {
    try {
      await sessionService.updateSinger(singerId, { isPersistent: true });
      await loadSingers();
      await loadPersistentSingers();
    } catch (error) {
      log.error("Failed to make singer permanent:", error);
    }
  };

  const startEditingSession = (sessionId: number, currentName: string | null) => {
    setEditingSessionId(sessionId);
    setEditingSessionName(currentName || "");
  };

  const cancelEditingSession = () => {
    setEditingSessionId(null);
    setEditingSessionName("");
  };

  const saveEditingSession = async () => {
    if (!editingSessionId) return;
    const name = editingSessionName.trim();
    if (!name) return;
    try {
      await renameStoredSession(editingSessionId, name);
      setEditingSessionId(null);
      setEditingSessionName("");
    } catch {
      // Error is logged in the store
    }
  };

  const handleEditSessionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      saveEditingSession();
    } else if (e.key === "Escape") {
      cancelEditingSession();
    }
  };

  // Render the Stored Sessions dialog (always available, even without active session)
  const loadSessionDialog = showLoadDialog && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-4 w-96 shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">Stored Sessions</h3>
          <button
            onClick={() => {
              closeLoadDialog();
              cancelEditingSession();
            }}
            className="text-gray-400 hover:text-white"
            title="Close"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {recentSessions.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No saved sessions</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentSessions.map((s) => {
                const isCurrentSession = s.id === session?.id;
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-2 rounded transition-colors ${
                      isCurrentSession
                        ? "bg-gray-700 text-gray-500"
                        : "bg-gray-700 hover:bg-gray-600 text-white"
                    }`}
                  >
                    {editingSessionId === s.id ? (
                      <div className="flex-1 flex items-center gap-2 px-3 py-2">
                        <input
                          ref={editSessionInputRef}
                          type="text"
                          value={editingSessionName}
                          onChange={(e) => setEditingSessionName(e.target.value)}
                          onKeyDown={handleEditSessionKeyDown}
                          className="flex-1 bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                          placeholder="Session name..."
                        />
                        <button
                          onClick={saveEditingSession}
                          disabled={!editingSessionName.trim()}
                          className="p-1 text-green-400 hover:text-green-300 disabled:text-gray-500 transition-colors"
                          title="Save"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={cancelEditingSession}
                          className="p-1 text-gray-400 hover:text-white transition-colors"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={async () => {
                            if (isCurrentSession) return;
                            try {
                              await switchToSession(s.id);
                              closeLoadDialog();
                            } catch {
                              // Error is logged in the store
                            }
                          }}
                          disabled={isCurrentSession}
                          className="flex-1 text-left px-3 py-2 disabled:cursor-not-allowed"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {s.name || "Unnamed Session"}
                            </span>
                            {isCurrentSession && (
                              <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400">
                              {new Date(s.started_at).toLocaleDateString()} at{" "}
                              {new Date(s.started_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {recentSessionSingers.get(s.id)?.length ? (
                              <div className="flex -space-x-1">
                                {recentSessionSingers.get(s.id)!.slice(0, 5).map((singer) => (
                                  <SingerAvatar
                                    key={singer.id}
                                    name={singer.name}
                                    color={singer.color}
                                    size="sm"
                                    className="ring-1 ring-gray-700"
                                  />
                                ))}
                                {recentSessionSingers.get(s.id)!.length > 5 && (
                                  <div className="w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center text-[10px] text-gray-300 ring-1 ring-gray-700">
                                    +{recentSessionSingers.get(s.id)!.length - 5}
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </button>
                        <button
                          onClick={() => startEditingSession(s.id, s.name)}
                          className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-600 rounded transition-colors"
                          title="Rename session"
                        >
                          <Pencil size={16} />
                        </button>
                        {!isCurrentSession && (
                          confirmDeleteSessionId === s.id ? (
                            <div className="flex items-center gap-1 mr-1 bg-red-900/30 px-2 py-1 rounded">
                              <span className="text-red-400 text-xs">Delete?</span>
                              <button
                                onClick={() => {
                                  deleteSession(s.id);
                                  setConfirmDeleteSessionId(null);
                                }}
                                className="text-red-400 hover:text-red-300 text-xs font-medium"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmDeleteSessionId(null)}
                                className="text-gray-400 hover:text-gray-300 text-xs"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteSessionId(s.id)}
                              className="p-2 mr-1 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded transition-colors"
                              title="Delete session"
                            >
                              <Trash2 size={16} />
                            </button>
                          )
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end mt-4 pt-2 border-t border-gray-700">
          <button
            onClick={closeLoadDialog}
            className="px-3 py-1.5 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  if (!session) {
    return (
      <>
        <div className="bg-gray-800 rounded-lg px-4 py-2">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => openLoadDialog()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
            >
              <FolderOpen size={14} />
              Stored Sessions
            </button>
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
        {loadSessionDialog}
      </>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {session.name && <span className="text-sm text-gray-400">{session.name}</span>}

            {/* Host button - shown when authenticated, session active, not already hosting */}
            {isAuthenticated && !hostedSession && (
              <button
                onClick={handleHostSession}
                disabled={isHostingLoading}
                className="flex items-center gap-1 px-2 py-1 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                title="Host session for guests to join"
              >
                {isHostingLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Globe size={14} />
                )}
                <span>Host</span>
              </button>
            )}

            {/* Join code badge - shown when hosting */}
            {hostedSession && (
              <button
                onClick={openHostModal}
                className="flex items-center gap-1.5 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-mono rounded transition-colors"
                title="Click to view join details"
              >
                <Globe size={14} />
                {hostedSession.sessionCode}
              </button>
            )}
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

        <div className="flex items-center gap-2">
          <button
            onClick={openLoadFavoritesDialog}
            className="p-1.5 text-yellow-500 hover:bg-gray-700 rounded transition-colors"
            title="Load Favorites to Queue"
          >
            <Star size={16} />
          </button>
          <button
            onClick={handleEndSession}
            disabled={isLoading}
            className="p-1.5 bg-red-600/80 hover:bg-red-600 disabled:bg-gray-600 text-white rounded transition-colors"
            title="End Session"
          >
            <Square size={16} />
          </button>
        </div>
      </div>

      {/* Expandable singers panel */}
      {showSingers && (
        <div className="mt-2 pt-2 border-t border-gray-600">
          {removeError && (
            <p className="text-xs text-red-400 mb-2">{removeError}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {singers.map((singer) => (
              <div key={singer.id} className="flex items-center gap-1">
                <SingerChip
                  name={singer.name}
                  color={singer.color}
                  faded={!isSingerAssigned(singer.id)}
                  onRemove={() => handleRemoveSinger(singer.id)}
                />
                {singer.is_persistent ? (
                  <span title="Persistent singer - has favorites">
                    <Star
                      size={14}
                      className="text-yellow-500 fill-yellow-500"
                    />
                  </span>
                ) : (
                  <button
                    onClick={() => handleMakePermanent(singer.id)}
                    className="p-0.5 text-gray-500 hover:text-yellow-500 transition-colors"
                    title="Make permanent (enables favorites)"
                  >
                    <Star size={14} />
                  </button>
                )}
              </div>
            ))}
            {showNewSinger ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newSingerName}
                    onChange={(e) => {
                      setNewSingerName(e.target.value);
                      setCreateError(null);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Singer name..."
                    className={`bg-gray-700 border rounded px-2 py-1 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 w-32 ${
                      createError ? "border-red-500" : "border-gray-600"
                    }`}
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
                      setCreateError(null);
                      setNewSingerName("");
                    }}
                    className="text-gray-400 hover:text-gray-200 text-sm"
                  >
                    Cancel
                  </button>
                </div>
                {createError && (
                  <p className="text-xs text-red-400">{createError}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {/* New session singer button */}
                <button
                  onClick={() => setShowNewSinger(true)}
                  className="flex items-center gap-1 px-2 py-1 text-blue-400 hover:bg-gray-700 rounded transition-colors text-sm"
                >
                  <UserPlus size={14} />
                  New Session Singer
                </button>

                {/* Stored singers dropdown */}
                {availablePersistentSingers.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPersistentDropdown(!showPersistentDropdown);
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-yellow-500 hover:bg-gray-700 rounded transition-colors text-sm"
                    >
                      <Star size={14} />
                      Add Stored Singer
                    </button>
                    {showPersistentDropdown && (
                      <div
                        className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[200px] z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="py-1">
                          {availablePersistentSingers.map((singer) => (
                            <button
                              key={singer.id}
                              onClick={() => handleAddPersistentSinger(singer.id)}
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
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rename session dialog */}
      {showRenameDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-4 w-80 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Save Session As</h3>
              <button
                onClick={() => {
                  closeRenameDialog();
                  setRenameError(null);
                }}
                className="text-gray-400 hover:text-white"
                title="Close"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value);
                  setRenameError(null);
                }}
                onKeyDown={handleRenameKeyDown}
                placeholder="Session name..."
                className={`w-full bg-gray-700 border rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 ${
                  renameError ? "border-red-500" : "border-gray-600"
                }`}
              />
              {renameError && (
                <p className="text-xs text-red-400">{renameError}</p>
              )}
              <div className="flex gap-2 justify-end mt-2">
                <button
                  onClick={() => {
                    closeRenameDialog();
                    setRenameError(null);
                  }}
                  className="px-3 py-1.5 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRenameSession}
                  disabled={!renameValue.trim()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Load session dialog */}
      {loadSessionDialog}

      {/* Host session modal */}
      <HostSessionModal />
    </div>
  );
}

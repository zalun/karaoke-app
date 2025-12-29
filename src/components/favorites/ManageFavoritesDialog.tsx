import { useState } from "react";
import { X, Music, Trash2, ChevronRight, Settings, Save, UserPlus, Star } from "lucide-react";
import { useFavoritesStore, useSessionStore } from "../../stores";
import { SingerAvatar } from "../singers/SingerAvatar";
import { sessionService, favoritesService, createLogger } from "../../services";
import { getNextSingerColor } from "../../constants";

const log = createLogger("ManageFavoritesDialog");

export function ManageFavoritesDialog() {
  const {
    showManageFavoritesDialog,
    closeManageFavoritesDialog,
    persistentSingers,
    selectedSingerId,
    favorites,
    isLoading,
    selectSinger,
    removeFavorite,
    loadPersistentSingers,
  } = useFavoritesStore();

  const { singers: sessionSingers, loadSingers } = useSessionStore();

  // Session singers that are not persistent (can be promoted)
  const tempSessionSingers = (sessionSingers || []).filter((s) => !s.is_persistent);

  const [editingUniqueName, setEditingUniqueName] = useState(false);
  const [uniqueNameValue, setUniqueNameValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showNewSingerForm, setShowNewSingerForm] = useState(false);
  const [newSingerName, setNewSingerName] = useState("");
  const [newSingerUniqueName, setNewSingerUniqueName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  if (!showManageFavoritesDialog) {
    return null;
  }

  const selectedSinger = (persistentSingers || []).find(
    (s) => s.id === selectedSingerId
  );

  const handleSelectSinger = async (singerId: number) => {
    await selectSinger(singerId);
    setEditingUniqueName(false);
    const singer = (persistentSingers || []).find((s) => s.id === singerId);
    setUniqueNameValue(singer?.unique_name || "");
  };

  const handleRemoveFavorite = async (videoId: string) => {
    if (!selectedSingerId) return;
    await removeFavorite(selectedSingerId, videoId);
  };

  const handleEditUniqueName = () => {
    setUniqueNameValue(selectedSinger?.unique_name || "");
    setEditingUniqueName(true);
  };

  const handleSaveUniqueName = async () => {
    if (!selectedSingerId) return;
    setIsSaving(true);
    try {
      await sessionService.updateSinger(selectedSingerId, {
        uniqueName: uniqueNameValue || undefined,
      });
      await loadPersistentSingers();
      await loadSingers();
      setEditingUniqueName(false);
    } catch (error) {
      log.error("Failed to update singer:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreatePersistentSinger = async () => {
    if (!newSingerName.trim()) return;
    setIsSaving(true);
    try {
      const usedColors = (persistentSingers || []).map((s) => s.color);
      const color = getNextSingerColor(usedColors);
      const singer = await sessionService.createSinger(
        newSingerName.trim(),
        color,
        true, // isPersistent
        newSingerUniqueName.trim() || undefined
      );
      await loadPersistentSingers();
      setNewSingerName("");
      setNewSingerUniqueName("");
      setShowNewSingerForm(false);
      // Auto-select the newly created singer
      await selectSinger(singer.id);
    } catch (error) {
      log.error("Failed to create singer:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSinger = async (singerId: number, e?: React.MouseEvent) => {
    log.info(`Delete button clicked for singer ${singerId}`);
    e?.stopPropagation();
    e?.preventDefault();

    // Show inline confirmation
    setConfirmDeleteId(singerId);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    const singerId = confirmDeleteId;
    setConfirmDeleteId(null);

    setIsSaving(true);
    try {
      log.info(`Removing persistent singer ${singerId} (downgrading to temporary)`);
      // Downgrade to temporary singer (preserves session history)
      await sessionService.updateSinger(singerId, { isPersistent: false });
      // Delete all their favorites
      const singerFavorites = await favoritesService.getSingerFavorites(singerId);
      for (const fav of singerFavorites) {
        await favoritesService.removeFavorite(singerId, fav.video.video_id);
      }
      log.info("Singer downgraded and favorites removed, reloading lists");
      await loadPersistentSingers();
      await loadSingers();
      // Clear selection if we deleted the selected singer
      if (selectedSingerId === singerId) {
        useFavoritesStore.setState({ selectedSingerId: null, favorites: [] });
      }
      log.info("Delete complete");
    } catch (error) {
      log.error("Failed to delete singer:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const cancelDelete = () => {
    setConfirmDeleteId(null);
  };

  const handlePromoteToPersonal = async (singerId: number) => {
    setIsSaving(true);
    try {
      const singer = await sessionService.updateSinger(singerId, { isPersistent: true });
      await loadPersistentSingers();
      await loadSingers();
      // Auto-select the newly promoted singer
      await selectSinger(singer.id);
    } catch (error) {
      log.error("Failed to promote singer:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setEditingUniqueName(false);
    setShowNewSingerForm(false);
    setNewSingerName("");
    setNewSingerUniqueName("");
    closeManageFavoritesDialog();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-[600px] max-h-[80vh] shadow-xl border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Settings size={20} className="text-yellow-400" />
            <h3 className="text-lg font-medium text-white">
              Manage Favorites
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex min-h-0">
          {/* Singer List */}
          <div className="w-56 border-r border-gray-700 flex flex-col">
            {/* Create New Singer Button/Form */}
            <div className="p-2 border-b border-gray-700">
              {showNewSingerForm ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newSingerName}
                    onChange={(e) => setNewSingerName(e.target.value)}
                    placeholder="Singer name *"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={newSingerUniqueName}
                    onChange={(e) => setNewSingerUniqueName(e.target.value)}
                    placeholder="Nickname (optional)"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreatePersistentSinger}
                      disabled={!newSingerName.trim() || isSaving}
                      className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 rounded text-sm text-white transition-colors"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setShowNewSingerForm(false);
                        setNewSingerName("");
                        setNewSingerUniqueName("");
                      }}
                      className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewSingerForm(true)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-blue-400 hover:bg-gray-700 rounded transition-colors"
                >
                  <UserPlus size={16} />
                  <span className="text-sm">New Persistent Singer</span>
                </button>
              )}
            </div>

            {/* Singer List */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && !selectedSingerId ? (
                <div className="p-4 text-gray-400 text-sm">Loading...</div>
              ) : (persistentSingers || []).length === 0 ? (
                <div className="p-4 text-gray-400 text-sm text-center">
                  <Star size={24} className="mx-auto mb-2 opacity-50" />
                  <p>No persistent singers yet.</p>
                  <p className="text-xs mt-1">Create one to start saving favorites!</p>
                </div>
              ) : (
                (persistentSingers || []).map((singer) => (
                  <div
                    key={singer.id}
                    onClick={() => handleSelectSinger(singer.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 transition-colors group cursor-pointer ${
                      selectedSingerId === singer.id
                        ? "bg-gray-700"
                        : "hover:bg-gray-700/50"
                    }`}
                  >
                    <SingerAvatar
                      name={singer.name}
                      color={singer.color}
                      size="sm"
                    />
                    <span className="text-sm text-gray-200 flex-1 text-left truncate">
                      {singer.name}
                      {singer.unique_name && (
                        <span className="text-gray-400 text-xs block">
                          {singer.unique_name}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={(e) => handleDeleteSinger(singer.id, e)}
                      className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete singer"
                    >
                      <Trash2 size={14} />
                    </button>
                    {selectedSingerId === singer.id && (
                      <ChevronRight size={16} className="text-gray-400" />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Session Singers (can be promoted to persistent) */}
            {tempSessionSingers.length > 0 && (
              <div className="border-t border-gray-700">
                <div className="px-3 py-2 text-xs text-gray-500 uppercase tracking-wide">
                  Session Singers
                </div>
                {tempSessionSingers.map((singer) => (
                  <div
                    key={singer.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-700/50 group"
                  >
                    <SingerAvatar
                      name={singer.name}
                      color={singer.color}
                      size="sm"
                    />
                    <span className="text-sm text-gray-400 flex-1 truncate">
                      {singer.name}
                    </span>
                    <button
                      onClick={() => handlePromoteToPersonal(singer.id)}
                      disabled={isSaving}
                      className="p-1.5 bg-yellow-600/80 hover:bg-yellow-600 disabled:bg-gray-600 text-white rounded transition-colors"
                      title="Make this singer permanent to enable favorites"
                    >
                      <Star size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Favorites List */}
          <div className="flex-1 overflow-y-auto">
            {!selectedSingerId ? (
              <div className="p-8 text-center text-gray-400">
                <Music size={48} className="mx-auto mb-4 opacity-50" />
                <p>Select a singer to manage their favorites</p>
              </div>
            ) : (
              <div>
                {/* Singer Settings */}
                <div className="px-4 py-3 border-b border-gray-700 bg-gray-700/30">
                  <div className="flex items-center gap-3 mb-2">
                    <SingerAvatar
                      name={selectedSinger?.name || ""}
                      color={selectedSinger?.color || "#888"}
                      size="md"
                    />
                    <div className="flex-1">
                      <p className="text-white font-medium">
                        {selectedSinger?.name}
                      </p>
                      {editingUniqueName ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="text"
                            value={uniqueNameValue}
                            onChange={(e) => setUniqueNameValue(e.target.value)}
                            placeholder="Nickname or last name"
                            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                          />
                          <button
                            onClick={handleSaveUniqueName}
                            disabled={isSaving}
                            className="p-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-white"
                          >
                            <Save size={14} />
                          </button>
                          <button
                            onClick={() => setEditingUniqueName(false)}
                            className="p-1 text-gray-400 hover:text-white"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handleEditUniqueName}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          {selectedSinger?.unique_name
                            ? `Edit unique name: ${selectedSinger.unique_name}`
                            : "Add unique name (nickname/last name)"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Favorites Count */}
                <div className="px-3 py-2 border-b border-gray-700">
                  <span className="text-xs text-gray-400 uppercase tracking-wide">
                    {favorites.length} favorite
                    {favorites.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Favorites */}
                {isLoading ? (
                  <div className="p-4 text-gray-400 text-sm">
                    Loading favorites...
                  </div>
                ) : favorites.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    <Music size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No favorites yet</p>
                    <p className="text-xs mt-2">
                      Add favorites from search results or history
                    </p>
                  </div>
                ) : (
                  favorites.map((favorite) => (
                    <div
                      key={favorite.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-700/50 group"
                    >
                      {favorite.video.thumbnail_url && (
                        <img
                          src={favorite.video.thumbnail_url}
                          alt=""
                          className="w-12 h-9 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {favorite.video.title}
                        </p>
                        {favorite.video.artist && (
                          <p className="text-xs text-gray-400 truncate">
                            {favorite.video.artist}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          handleRemoveFavorite(favorite.video.video_id)
                        }
                        className="p-1.5 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove from favorites"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-700">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
          <div className="bg-gray-800 rounded-lg p-6 w-80 shadow-xl border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-600/20 rounded-full">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Remove Persistent Singer</h3>
                <p className="text-sm text-gray-400">
                  {(persistentSingers || []).find((s) => s.id === confirmDeleteId)?.name}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-300 mb-6">
              This will remove the singer from the persistent list and delete all their favorites.
              They will remain as a temporary singer in session history.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isSaving}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded transition-colors"
              >
                {isSaving ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

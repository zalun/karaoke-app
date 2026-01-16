import { useState } from "react";
import { X, Music, Check, ChevronRight, ListMusic } from "lucide-react";
import { useFavoritesStore } from "../../stores";
import { SingerAvatar } from "../singers/SingerAvatar";

export function LoadFavoritesDialog() {
  const {
    showLoadFavoritesDialog,
    closeLoadFavoritesDialog,
    persistentSingers,
    selectedSingerId,
    favorites,
    isLoading,
    selectSinger,
    loadFavoritesToQueue,
  } = useFavoritesStore();

  const [selectedFavoriteIds, setSelectedFavoriteIds] = useState<Set<number>>(
    new Set()
  );

  if (!showLoadFavoritesDialog) {
    return null;
  }

  const selectedSinger = persistentSingers.find(
    (s) => s.id === selectedSingerId
  );

  const handleSelectSinger = async (singerId: number) => {
    await selectSinger(singerId);
    setSelectedFavoriteIds(new Set());
  };

  const handleToggleFavorite = (favoriteId: number) => {
    setSelectedFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(favoriteId)) {
        next.delete(favoriteId);
      } else {
        next.add(favoriteId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedFavoriteIds.size === favorites.length) {
      setSelectedFavoriteIds(new Set());
    } else {
      setSelectedFavoriteIds(new Set(favorites.map((f) => f.id)));
    }
  };

  const handleLoadToQueue = async () => {
    if (!selectedSingerId) return;

    const idsToLoad =
      selectedFavoriteIds.size > 0
        ? Array.from(selectedFavoriteIds)
        : undefined;
    await loadFavoritesToQueue(selectedSingerId, idsToLoad);
    closeLoadFavoritesDialog();
  };

  const handleClose = () => {
    setSelectedFavoriteIds(new Set());
    closeLoadFavoritesDialog();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-[500px] max-h-[80vh] shadow-xl border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <ListMusic size={20} className="text-yellow-400" />
            <h3 className="text-lg font-medium text-white">
              Load Favorites to Queue
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex min-h-0">
          {/* Singer List */}
          <div className="w-48 border-r border-gray-700 overflow-y-auto">
            {isLoading && !selectedSingerId ? (
              <div className="p-4 text-gray-400 text-sm">Loading...</div>
            ) : persistentSingers.length === 0 ? (
              <div className="p-4 text-gray-400 text-sm">
                No persistent singers found.
              </div>
            ) : (
              persistentSingers.map((singer) => (
                <button
                  key={singer.id}
                  onClick={() => handleSelectSinger(singer.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 transition-colors ${
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
                  {selectedSingerId === singer.id && (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Favorites List */}
          <div className="flex-1 overflow-y-auto">
            {!selectedSingerId ? (
              <div className="p-8 text-center text-gray-400">
                <Music size={48} className="mx-auto mb-4 opacity-50" />
                <p>Select a singer to see their favorites</p>
              </div>
            ) : isLoading ? (
              <div className="p-4 text-gray-400 text-sm">
                Loading favorites...
              </div>
            ) : favorites.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Music size={48} className="mx-auto mb-4 opacity-50" />
                <p>{selectedSinger?.name} has no favorites yet</p>
              </div>
            ) : (
              <div>
                {/* Select All */}
                <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
                  <span className="text-xs text-gray-400 uppercase tracking-wide">
                    {favorites.length} favorite
                    {favorites.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={handleSelectAll}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {selectedFavoriteIds.size === favorites.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                </div>

                {/* Favorites */}
                {favorites.map((favorite) => {
                  const isSelected = selectedFavoriteIds.has(favorite.id);
                  return (
                    <button
                      key={favorite.id}
                      onClick={() => handleToggleFavorite(favorite.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 transition-colors ${
                        isSelected ? "bg-blue-900/30" : "hover:bg-gray-700/50"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border flex items-center justify-center ${
                          isSelected
                            ? "bg-blue-500 border-blue-500"
                            : "border-gray-500"
                        }`}
                      >
                        {isSelected && (
                          <Check size={14} className="text-white" />
                        )}
                      </div>
                      {favorite.video.thumbnail_url && (
                        <img
                          src={favorite.video.thumbnail_url}
                          alt=""
                          className="w-12 h-9 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm text-white truncate">
                          {favorite.video.title}
                        </p>
                        {favorite.video.artist && (
                          <p className="text-xs text-gray-400 truncate">
                            {favorite.video.artist}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end p-4 border-t border-gray-700">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLoadToQueue}
            disabled={!selectedSingerId || favorites.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded transition-colors"
          >
            <ListMusic size={14} />
            {selectedFavoriteIds.size > 0
              ? `Add ${selectedFavoriteIds.size} to Queue`
              : `Add All to Queue`}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Music, FolderOpen, Filter, AlertTriangle } from "lucide-react";
import type { LibraryVideo, LibraryFolder } from "../../stores";
import { useLibraryStore } from "../../stores";
import { MissingFileDialog } from "../search/MissingFileDialog";
import { ActiveSingerSelector } from "../search/ActiveSingerSelector";
import { createLogger } from "../../services/logger";

const log = createLogger("LibraryBrowser");

interface LibraryFilters {
  folder_id: number | null;
  year: number | null;
  has_lyrics: boolean | null;
  has_cdg: boolean | null;
}

type LibrarySort = "title_asc" | "title_desc" | "artist_asc" | "artist_desc";

interface LibraryBrowseResult {
  videos: LibraryVideo[];
  total: number;
}

const ITEMS_PER_PAGE = 50;

interface LibraryBrowserProps {
  onPlay: (video: LibraryVideo) => void;
  onAddToQueue: (video: LibraryVideo) => void;
  onPlayNext: (video: LibraryVideo) => void;
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function LibraryBrowser({ onPlay, onAddToQueue, onPlayNext }: LibraryBrowserProps) {
  const { folders, loadFolders } = useLibraryStore();

  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const [filters, setFilters] = useState<LibraryFilters>({
    folder_id: null,
    year: null,
    has_lyrics: null,
    has_cdg: null,
  });
  const [sort, setSort] = useState<LibrarySort>("title_asc");
  const [missingFilePath, setMissingFilePath] = useState<string | null>(null);

  const fetchVideos = useCallback(async (newOffset = 0) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<LibraryBrowseResult>("library_browse", {
        filters: {
          folder_id: filters.folder_id,
          year: filters.year,
          has_lyrics: filters.has_lyrics,
          has_cdg: filters.has_cdg,
        },
        sort,
        limit: ITEMS_PER_PAGE,
        offset: newOffset,
      });

      log.debug(`Fetched ${result.videos.length} videos (total: ${result.total})`);

      if (newOffset === 0) {
        setVideos(result.videos);
      } else {
        setVideos(prev => [...prev, ...result.videos]);
      }
      setTotal(result.total);
      setOffset(newOffset);
    } catch (err) {
      log.error("Failed to browse library:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [filters, sort]);

  // Load folders on mount
  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Fetch videos when filters or sort changes
  useEffect(() => {
    fetchVideos(0);
  }, [fetchVideos]);

  const handleLoadMore = () => {
    if (!isLoading && videos.length < total) {
      fetchVideos(offset + ITEMS_PER_PAGE);
    }
  };

  const handleClick = (video: LibraryVideo) => {
    if (!video.is_available) {
      setMissingFilePath(video.file_path);
    } else {
      onAddToQueue(video);
    }
  };

  if (folders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <FolderOpen size={48} className="mb-4 opacity-50" />
        <p className="text-lg mb-2">No library folders configured</p>
        <p className="text-sm">Add folders in Settings → Library to browse local files</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters and controls */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-800/50 rounded-lg mb-3">
        <Filter size={16} className="text-gray-400" />

        {/* Folder filter */}
        <select
          value={filters.folder_id ?? ""}
          onChange={(e) => setFilters(prev => ({
            ...prev,
            folder_id: e.target.value ? Number(e.target.value) : null
          }))}
          className="bg-gray-700 text-sm rounded px-2 py-1 text-gray-200 border-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Folders</option>
          {folders.map((folder: LibraryFolder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as LibrarySort)}
          className="bg-gray-700 text-sm rounded px-2 py-1 text-gray-200 border-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="title_asc">Title A-Z</option>
          <option value="title_desc">Title Z-A</option>
          <option value="artist_asc">Artist A-Z</option>
          <option value="artist_desc">Artist Z-A</option>
        </select>

        <div className="flex-1" />

        {/* Active singer selector */}
        <ActiveSingerSelector />

        {/* Total count */}
        <span className="text-sm text-gray-400">{total} videos</span>
      </div>

      {/* Loading state */}
      {isLoading && videos.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-400">Loading library...</div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center justify-center py-12">
          <div className="text-red-400">{error}</div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && videos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Music size={48} className="mb-4 opacity-50" />
          <p className="text-lg mb-2">No videos found</p>
          <p className="text-sm">Try adjusting your filters or scan your library folders</p>
        </div>
      )}

      {/* Video grid */}
      {videos.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {videos.map((video) => {
              const isUnavailable = !video.is_available;

              return (
                <div
                  key={video.file_path}
                  onClick={() => handleClick(video)}
                  className={`group flex flex-col p-3 rounded-lg transition-colors cursor-pointer ${
                    isUnavailable
                      ? "bg-gray-800/50 opacity-60"
                      : "bg-gray-800 hover:bg-gray-700"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-gray-700 rounded mb-2 flex items-center justify-center overflow-hidden">
                    {isUnavailable ? (
                      <AlertTriangle size={24} className="text-yellow-500" />
                    ) : video.thumbnail_path ? (
                      <img
                        src={convertFileSrc(video.thumbnail_path)}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Music size={24} className="text-gray-500" />
                    )}
                  </div>

                  {/* Info */}
                  <h3
                    className={`font-medium text-sm truncate ${isUnavailable ? "text-gray-400" : ""}`}
                    title={video.title}
                  >
                    {video.title}
                  </h3>
                  {video.artist && (
                    <p className="text-xs text-gray-400 truncate">{video.artist}</p>
                  )}
                  <div className="flex gap-2 mt-1 text-xs text-gray-500">
                    <span>{formatDuration(video.duration)}</span>
                    {video.has_lyrics && <span>• Lyrics</span>}
                    {video.has_cdg && <span>• CDG</span>}
                  </div>

                  {/* Actions on hover */}
                  <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isUnavailable) {
                          setMissingFilePath(video.file_path);
                        } else {
                          onAddToQueue(video);
                        }
                      }}
                      className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                        isUnavailable
                          ? "bg-gray-700 text-gray-500"
                          : "bg-green-600 hover:bg-green-700 text-white"
                      }`}
                    >
                      + Queue
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isUnavailable) {
                          setMissingFilePath(video.file_path);
                        } else {
                          onPlayNext(video);
                        }
                      }}
                      className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                        isUnavailable
                          ? "bg-gray-700 text-gray-500"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      }`}
                    >
                      Next
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isUnavailable) {
                          onPlay(video);
                        }
                      }}
                      className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
                        isUnavailable
                          ? "bg-gray-700 text-gray-500"
                          : "bg-gray-600 hover:bg-gray-500 text-white"
                      }`}
                      disabled={isUnavailable}
                    >
                      Play
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {videos.length < total && (
            <div className="flex justify-center py-4">
              <button
                onClick={handleLoadMore}
                disabled={isLoading}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors disabled:opacity-50"
              >
                {isLoading ? "Loading..." : `Load More (${videos.length}/${total})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Missing file dialog */}
      <MissingFileDialog
        filePath={missingFilePath}
        onClose={() => setMissingFilePath(null)}
      />
    </div>
  );
}

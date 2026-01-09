import { useRef, useEffect, useMemo } from "react";
import { Settings } from "lucide-react";
import type { SearchResult } from "../../types";
import { usePlayerStore, useFavoritesStore, useSettingsStore, SETTINGS_KEYS, type Video } from "../../stores";
import { FavoriteStar } from "../favorites";

function searchResultToVideo(result: SearchResult): Video {
  return {
    id: result.id,
    title: result.title,
    artist: result.channel,
    duration: result.duration,
    thumbnailUrl: result.thumbnail,
    source: "youtube",
    youtubeId: result.id,
  };
}

const RESULTS_PER_PAGE = 15;

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  onPlay: (result: SearchResult) => void;
  onAddToQueue: (result: SearchResult) => void;
  onPlayNext: (result: SearchResult) => void;
  displayedCount: number;
  onLoadMore: () => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatViewCount(count?: number): string {
  if (!count) return "";
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K views`;
  return `${count} views`;
}

export function SearchResults({
  results,
  isLoading,
  error,
  onPlay,
  onAddToQueue,
  onPlayNext,
  displayedCount,
  onLoadMore,
}: SearchResultsProps) {
  const { currentVideo, isPlaying, nonEmbeddableVideoIds } = usePlayerStore();
  const { persistentSingers, loadPersistentSingers } = useFavoritesStore();
  const playbackMode = useSettingsStore((s) => s.getSetting(SETTINGS_KEYS.PLAYBACK_MODE));
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Check if a video is non-embeddable (only relevant in YouTube mode)
  const isNonEmbeddable = (videoId: string) =>
    playbackMode === "youtube" && nonEmbeddableVideoIds.has(videoId);

  // Load persistent singers on mount
  useEffect(() => {
    loadPersistentSingers();
  }, [loadPersistentSingers]);

  // Filter out channels/playlists (memoized to avoid recomputing on every render)
  const videoResults = useMemo(() => {
    return results.filter((result) => {
      // Must have a duration (videos have duration, channels/playlists don't)
      if (!result.duration || result.duration === 0) return false;
      // YouTube video IDs are exactly 11 characters
      if (result.id.length !== 11) return false;
      return true;
    });
  }, [results]);

  const displayedResults = useMemo(
    () => videoResults.slice(0, displayedCount),
    [videoResults, displayedCount]
  );
  const hasMore = displayedCount < videoResults.length;

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, isLoading, onLoadMore]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Searching...</div>
      </div>
    );
  }

  if (error) {
    // Check if error is about configuration - show setup prompt
    const isConfigError = error.includes("not configured");
    const { openSettingsDialog, setActiveTab } = useSettingsStore.getState();

    if (isConfigError) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Settings size={48} className="text-gray-500 mb-4" />
          <div className="text-white font-medium mb-2">YouTube Search Not Configured</div>
          <p className="text-gray-400 text-sm text-center mb-4 max-w-md">
            Add your YouTube API key in Settings to search for videos.
            <br />
            <span className="text-gray-500">
              Alternatively, install yt-dlp for advanced streaming mode.
            </span>
          </p>
          <button
            onClick={() => {
              setActiveTab("youtube");
              openSettingsDialog();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            Open YouTube Settings
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (videoResults.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">No results. Try a different search.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayedResults.map((result) => {
        const isCurrentlyPlaying = currentVideo?.id === result.id;
        const videoNonEmbeddable = isNonEmbeddable(result.id);

        return (
          <div
            key={result.id}
            onClick={() => !videoNonEmbeddable && onAddToQueue(result)}
            className={`flex gap-3 p-3 rounded-lg transition-colors ${
              videoNonEmbeddable
                ? "bg-gray-800 border border-gray-600 opacity-50 cursor-not-allowed"
                : isCurrentlyPlaying
                ? "bg-blue-900/50 border border-blue-600 cursor-pointer"
                : "bg-gray-800 hover:bg-gray-700 cursor-pointer"
            }`}
            title={videoNonEmbeddable ? "This video doesn't allow embedding" : undefined}
          >
            {/* Thumbnail */}
            <div className="w-32 h-20 flex-shrink-0 bg-gray-700 rounded overflow-hidden relative">
              {result.thumbnail ? (
                <img
                  src={result.thumbnail}
                  alt={result.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">
                  🎵
                </div>
              )}
              {isCurrentlyPlaying && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-white text-2xl">
                    {isPlaying ? "▶" : "⏸"}
                  </span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3
                  className={`font-medium text-sm truncate flex-1 ${
                    videoNonEmbeddable
                      ? "text-gray-500 line-through"
                      : isCurrentlyPlaying
                      ? "text-blue-300"
                      : ""
                  }`}
                  title={result.title}
                >
                  {result.title}
                </h3>
                {videoNonEmbeddable && (
                  <span
                    className="text-yellow-500 text-xs flex-shrink-0"
                    title="Embedding disabled by video owner"
                  >
                    ⚠
                  </span>
                )}
              </div>
              <p className={`text-xs truncate ${videoNonEmbeddable ? "text-gray-500" : "text-gray-400"}`}>
                {result.channel}
              </p>
              <div className={`flex gap-2 mt-1 text-xs ${videoNonEmbeddable ? "text-gray-600" : "text-gray-500"}`}>
                <span>{formatDuration(result.duration)}</span>
                {result.view_count && <span>• {formatViewCount(result.view_count)}</span>}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {persistentSingers.length > 0 && !videoNonEmbeddable && (
                <FavoriteStar video={searchResultToVideo(result)} />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!videoNonEmbeddable) {
                    onAddToQueue(result);
                  }
                }}
                className={`w-8 h-8 flex items-center justify-center rounded text-lg transition-colors ${
                  videoNonEmbeddable
                    ? "bg-gray-700 text-gray-600 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
                aria-label={videoNonEmbeddable ? "Cannot add - embedding disabled" : "Add to queue"}
                title={videoNonEmbeddable ? "Cannot add - embedding disabled" : "Add to queue"}
                disabled={videoNonEmbeddable}
              >
                +
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!videoNonEmbeddable) {
                    onPlayNext(result);
                  }
                }}
                className={`w-8 h-8 flex items-center justify-center rounded text-lg transition-colors ${
                  videoNonEmbeddable
                    ? "bg-gray-700 text-gray-600 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                }`}
                aria-label={videoNonEmbeddable ? "Cannot play - embedding disabled" : "Play next"}
                title={videoNonEmbeddable ? "Cannot play - embedding disabled" : "Play next"}
                disabled={videoNonEmbeddable}
              >
                ⏭
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!videoNonEmbeddable) {
                    onPlay(result);
                  }
                }}
                className={`w-8 h-8 flex items-center justify-center rounded text-lg transition-colors ${
                  videoNonEmbeddable
                    ? "bg-gray-700 text-gray-600 cursor-not-allowed"
                    : "bg-gray-600 hover:bg-gray-500"
                }`}
                aria-label={videoNonEmbeddable ? "Cannot play - embedding disabled" : "Play now"}
                title={videoNonEmbeddable ? "Cannot play - embedding disabled" : "Play now"}
                disabled={videoNonEmbeddable}
              >
                ▶
              </button>
            </div>
          </div>
        );
      })}

      {/* Load more trigger / indicator */}
      {hasMore && (
        <div
          ref={loadMoreRef}
          className="flex items-center justify-center py-4"
          aria-live="polite"
        >
          <div className="text-gray-400 text-sm">Scroll for more results...</div>
        </div>
      )}

      {/* End of results indicator */}
      {!hasMore && videoResults.length > 0 && displayedResults.length >= RESULTS_PER_PAGE && (
        <div className="flex items-center justify-center py-4" aria-live="polite">
          <div className="text-gray-500 text-sm">End of results</div>
        </div>
      )}
    </div>
  );
}

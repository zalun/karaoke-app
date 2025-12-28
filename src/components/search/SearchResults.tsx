import { useRef, useEffect, useMemo } from "react";
import type { SearchResult } from "../../types";
import { usePlayerStore } from "../../stores";

const RESULTS_PER_PAGE = 15;

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  onPlay: (result: SearchResult) => void;
  onAddToQueue: (result: SearchResult) => void;
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
  displayedCount,
  onLoadMore,
}: SearchResultsProps) {
  const { currentVideo, isPlaying } = usePlayerStore();
  const loadMoreRef = useRef<HTMLDivElement>(null);

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

        return (
          <div
            key={result.id}
            onClick={() => onAddToQueue(result)}
            className={`flex gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
              isCurrentlyPlaying
                ? "bg-blue-900/50 border border-blue-600"
                : "bg-gray-800 hover:bg-gray-700"
            }`}
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
              <h3 className={`font-medium text-sm truncate ${isCurrentlyPlaying ? "text-blue-300" : ""}`} title={result.title}>
                {result.title}
              </h3>
              <p className="text-xs text-gray-400 truncate">{result.channel}</p>
              <div className="flex gap-2 mt-1 text-xs text-gray-500">
                <span>{formatDuration(result.duration)}</span>
                {result.view_count && <span>• {formatViewCount(result.view_count)}</span>}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToQueue(result);
                }}
                className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 rounded text-lg transition-colors"
                aria-label="Add to queue"
              >
                +
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(result);
                }}
                className="w-8 h-8 flex items-center justify-center bg-gray-600 hover:bg-gray-500 rounded transition-colors"
                aria-label="Play now"
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

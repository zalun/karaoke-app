import { useRef, useEffect, useMemo, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FolderOpen, AlertTriangle, Music } from "lucide-react";
import type { LibraryVideo } from "../../stores";
import { useLibraryStore } from "../../stores";
import { MissingFileDialog } from "./MissingFileDialog";

interface LocalSearchResultsProps {
  results: LibraryVideo[];
  isLoading: boolean;
  error: string | null;
  onPlay: (video: LibraryVideo) => void;
  onAddToQueue: (video: LibraryVideo) => void;
  onPlayNext: (video: LibraryVideo) => void;
  displayedCount: number;
  onLoadMore: () => void;
}

export interface LocalSearchResultsRef {
  focus: () => void;
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const RESULTS_PER_PAGE = 15;

export const LocalSearchResults = forwardRef<LocalSearchResultsRef, LocalSearchResultsProps>(function LocalSearchResults({
  results,
  isLoading,
  error,
  onPlay,
  onAddToQueue,
  onPlayNext,
  displayedCount,
  onLoadMore,
}, ref) {
  const { folders } = useLibraryStore();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [missingFilePath, setMissingFilePath] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      containerRef.current?.focus();
      setSelectedIndex(0);
    },
  }));

  const displayedResults = useMemo(
    () => results.slice(0, displayedCount),
    [results, displayedCount]
  );
  const hasMore = displayedCount < results.length;

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (displayedResults.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < displayedResults.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case "Enter":
          if (selectedIndex >= 0 && selectedIndex < displayedResults.length) {
            e.preventDefault();
            const video = displayedResults[selectedIndex];
            if (video.is_available) {
              onAddToQueue(video);
            } else {
              setMissingFilePath(video.file_path);
            }
          }
          break;
      }
    },
    [displayedResults, selectedIndex, onAddToQueue]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && containerRef.current) {
      const items = containerRef.current.querySelectorAll("[data-result-item]");
      const selectedItem = items[selectedIndex];
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex]);

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

  const handleClick = (video: LibraryVideo) => {
    if (!video.is_available) {
      setMissingFilePath(video.file_path);
    } else {
      onAddToQueue(video);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Searching local library...</div>
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

  if (folders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <FolderOpen size={48} className="mb-4 opacity-50" />
        <p className="text-lg mb-2">No library folders configured</p>
        <p className="text-sm">Add folders in Settings → Library to search local files</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">No local files found. Try a different search.</div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="space-y-2 outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {displayedResults.map((video, index) => {
          const isUnavailable = !video.is_available;
          const isSelected = index === selectedIndex;

          return (
            <div
              key={video.file_path}
              data-result-item
              onClick={() => handleClick(video)}
              className={`flex gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                isUnavailable
                  ? "bg-gray-800/50 opacity-60"
                  : isSelected
                  ? "bg-gray-700 border border-gray-500"
                  : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              {/* Thumbnail */}
              <div className="w-16 h-12 flex-shrink-0 bg-gray-700 rounded flex items-center justify-center overflow-hidden">
                {isUnavailable ? (
                  <AlertTriangle size={20} className="text-yellow-500" />
                ) : video.thumbnail_path ? (
                  <img
                    src={convertFileSrc(video.thumbnail_path)}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Music size={20} className="text-gray-500" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3
                  className={`font-medium text-sm truncate ${
                    isUnavailable ? "text-gray-400" : ""
                  }`}
                  title={video.title}
                >
                  {video.title}
                </h3>
                {video.artist && (
                  <p className="text-xs text-gray-400 truncate">{video.artist}</p>
                )}
                <div className="flex gap-2 mt-1 text-xs text-gray-500">
                  <span>{formatDuration(video.duration)}</span>
                  {video.has_lyrics && <span>• Has lyrics</span>}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isUnavailable) {
                      setMissingFilePath(video.file_path);
                    } else {
                      onAddToQueue(video);
                    }
                  }}
                  className={`w-8 h-8 flex items-center justify-center rounded text-lg transition-colors ${
                    isUnavailable
                      ? "bg-gray-700 text-gray-500"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                  aria-label={isUnavailable ? "File missing" : "Add to queue"}
                  title={isUnavailable ? "File missing - click for details" : "Add to queue"}
                >
                  +
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
                  className={`w-8 h-8 flex items-center justify-center rounded text-lg transition-colors ${
                    isUnavailable
                      ? "bg-gray-700 text-gray-500"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                  aria-label={isUnavailable ? "File missing" : "Play next"}
                  title={isUnavailable ? "File missing - click for details" : "Play next"}
                >
                  ⏭
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isUnavailable) {
                      setMissingFilePath(video.file_path);
                    } else {
                      onPlay(video);
                    }
                  }}
                  className={`w-8 h-8 flex items-center justify-center rounded text-lg transition-colors ${
                    isUnavailable
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                      : "bg-gray-600 hover:bg-gray-500"
                  }`}
                  aria-label={isUnavailable ? "Cannot play - file missing" : "Play now"}
                  title={isUnavailable ? "Cannot play - file missing" : "Play now"}
                  disabled={isUnavailable}
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
        {!hasMore && results.length > 0 && displayedResults.length >= RESULTS_PER_PAGE && (
          <div className="flex items-center justify-center py-4" aria-live="polite">
            <div className="text-gray-500 text-sm">End of results</div>
          </div>
        )}
      </div>

      {/* Missing file dialog */}
      <MissingFileDialog
        filePath={missingFilePath}
        onClose={() => setMissingFilePath(null)}
      />
    </>
  );
});

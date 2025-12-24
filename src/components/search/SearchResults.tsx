import type { SearchResult } from "../../types";

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  onPlay: (result: SearchResult) => void;
  onAddToQueue: (result: SearchResult) => void;
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
}: SearchResultsProps) {
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

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">No results. Try a different search.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {results.map((result) => (
        <div
          key={result.id}
          className="flex gap-3 p-3 bg-gray-800 hover:bg-gray-750 rounded-lg transition-colors group"
        >
          {/* Thumbnail */}
          <div className="w-32 h-20 flex-shrink-0 bg-gray-700 rounded overflow-hidden">
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
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate" title={result.title}>
              {result.title}
            </h3>
            <p className="text-xs text-gray-400 truncate">{result.channel}</p>
            <div className="flex gap-2 mt-1 text-xs text-gray-500">
              <span>{formatDuration(result.duration)}</span>
              {result.view_count && <span>• {formatViewCount(result.view_count)}</span>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onPlay(result)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
            >
              Play
            </button>
            <button
              onClick={() => onAddToQueue(result)}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
            >
              + Queue
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

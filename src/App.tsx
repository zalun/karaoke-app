import { useState, useCallback } from "react";
import { AppLayout } from "./components/layout";
import { VideoPlayer, PlayerControls } from "./components/player";
import { SearchBar, SearchResults } from "./components/search";
import { DependencyCheck } from "./components/DependencyCheck";
import { usePlayerStore, useQueueStore } from "./stores";
import { youtubeService } from "./services";
import type { SearchResult } from "./types";

type PanelTab = "queue" | "history";

function App() {
  const [dependenciesReady, setDependenciesReady] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("queue");

  const { setCurrentVideo, setIsPlaying, setIsLoading } = usePlayerStore();
  const { addToQueue, playDirect } = useQueueStore();

  const handleSearch = useCallback(async (query: string) => {
    setIsSearching(true);
    setSearchError(null);

    try {
      const results = await youtubeService.search(query, 15);
      setSearchResults(results);
    } catch (err) {
      console.error("Search failed:", err);
      setSearchError(
        err instanceof Error ? err.message : "Search failed. Is yt-dlp installed?"
      );
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handlePlay = useCallback(
    async (result: SearchResult) => {
      setIsLoading(true);
      setSearchError(null);

      try {
        const streamInfo = await youtubeService.getStreamUrl(result.id);

        const video = {
          id: result.id,
          title: result.title,
          artist: result.channel,
          duration: result.duration,
          thumbnailUrl: result.thumbnail,
          source: "youtube" as const,
          youtubeId: result.id,
          streamUrl: streamInfo.url,
        };

        // Add to history and play
        playDirect(video);
        setCurrentVideo(video);
        setIsPlaying(true);
      } catch (err) {
        console.error("Failed to get stream URL:", err);
        setSearchError(
          err instanceof Error ? err.message : "Failed to load video"
        );
        setIsLoading(false);
        setIsPlaying(false);
      }
    },
    [setCurrentVideo, setIsPlaying, setIsLoading, playDirect]
  );

  const handleAddToQueue = useCallback(
    (result: SearchResult) => {
      addToQueue({
        id: result.id,
        title: result.title,
        artist: result.channel,
        duration: result.duration,
        thumbnailUrl: result.thumbnail,
        source: "youtube",
        youtubeId: result.id,
      });
    },
    [addToQueue]
  );

  if (!dependenciesReady) {
    return <DependencyCheck onReady={() => setDependenciesReady(true)} />;
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full gap-4">
        {/* Search Bar */}
        <SearchBar onSearch={handleSearch} isLoading={isSearching} />

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
          {/* Left: Video + Search Results */}
          <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
            {/* Video Player */}
            <div className="h-[300px] lg:h-[400px] flex-shrink-0">
              <VideoPlayerArea />
            </div>
            <PlayerControls />

            {/* Search Results */}
            <div className="flex-1 overflow-auto">
              <h2 className="text-lg font-semibold mb-3">Search Results</h2>
              <SearchResults
                results={searchResults}
                isLoading={isSearching}
                error={searchError}
                onPlay={handlePlay}
                onAddToQueue={handleAddToQueue}
              />
            </div>
          </div>

          {/* Right: Queue/History Panel */}
          <div className="bg-gray-800 rounded-lg p-4 overflow-auto flex flex-col">
            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveTab("queue")}
                className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${
                  activeTab === "queue"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                Queue
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${
                  activeTab === "history"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                History
              </button>
            </div>

            {/* Panel content */}
            {activeTab === "queue" ? <QueuePanel /> : <HistoryPanel />}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function VideoPlayerArea() {
  const { isDetached } = usePlayerStore();

  if (isDetached) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-800 rounded-lg">
        <div className="text-center text-gray-400">
          <p className="text-4xl mb-2">🎤</p>
          <p>Video playing in separate window</p>
        </div>
      </div>
    );
  }

  return <VideoPlayer />;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function QueuePanel() {
  const { queue, playFromQueue, removeFromQueue, clearQueue } = useQueueStore();
  const { setCurrentVideo, setIsPlaying, setIsLoading, setError } = usePlayerStore();

  const handlePlayFromQueue = useCallback(
    async (index: number) => {
      const item = playFromQueue(index);
      if (item && item.video.youtubeId) {
        setIsLoading(true);
        try {
          const streamInfo = await youtubeService.getStreamUrl(item.video.youtubeId);
          setCurrentVideo({
            ...item.video,
            streamUrl: streamInfo.url,
          });
          setIsPlaying(true);
        } catch (err) {
          console.error("Failed to play:", err);
          setError("Failed to play video");
          setIsLoading(false);
        }
      }
    },
    [playFromQueue, setCurrentVideo, setIsPlaying, setIsLoading, setError]
  );

  if (queue.length === 0) {
    return (
      <div className="text-gray-400 text-sm flex-1">
        <p>No songs in queue</p>
        <p className="mt-2 text-xs">
          Search for songs and click "+" to add them
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-auto space-y-2">
        {queue.map((item, index) => (
          <div
            key={item.id}
            onClick={() => handlePlayFromQueue(index)}
            className="flex gap-2 p-2 rounded cursor-pointer transition-colors bg-gray-700 hover:bg-gray-600"
          >
            <span className="text-gray-400 w-6 flex items-center justify-center">
              {index + 1}.
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{item.video.title}</p>
              <p className="text-xs text-gray-400 truncate">
                {item.video.artist}
                {item.video.duration && ` • ${formatDuration(item.video.duration)}`}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeFromQueue(item.id);
              }}
              className="text-gray-400 hover:text-red-400 text-sm"
              title="Remove from queue"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={clearQueue}
        className="mt-3 w-full py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
      >
        Clear Queue
      </button>
    </div>
  );
}

function HistoryPanel() {
  const { history, historyIndex, playFromHistory, clearHistory } = useQueueStore();
  const { setCurrentVideo, setIsPlaying, setIsLoading, setError } = usePlayerStore();

  const handlePlayFromHistory = useCallback(
    async (index: number) => {
      const item = playFromHistory(index);
      if (item && item.video.youtubeId) {
        setIsLoading(true);
        try {
          const streamInfo = await youtubeService.getStreamUrl(item.video.youtubeId);
          setCurrentVideo({
            ...item.video,
            streamUrl: streamInfo.url,
          });
          setIsPlaying(true);
        } catch (err) {
          console.error("Failed to play:", err);
          setError("Failed to play video");
          setIsLoading(false);
        }
      }
    },
    [playFromHistory, setCurrentVideo, setIsPlaying, setIsLoading, setError]
  );

  // Calculate effective index for highlighting current item
  const effectiveIndex = historyIndex === -1 ? history.length - 1 : historyIndex;

  if (history.length === 0) {
    return (
      <div className="text-gray-400 text-sm flex-1">
        <p>No songs in history</p>
        <p className="mt-2 text-xs">
          Songs you play will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-auto space-y-2">
        {history.map((item, index) => {
          const isCurrent = index === effectiveIndex;
          return (
            <div
              key={item.id}
              onClick={() => handlePlayFromHistory(index)}
              className={`flex gap-2 p-2 rounded cursor-pointer transition-colors ${
                isCurrent
                  ? "bg-blue-900/50 border border-blue-600"
                  : "bg-gray-700/50 hover:bg-gray-600"
              }`}
            >
              <span className="text-gray-400 w-6 flex items-center justify-center">
                {isCurrent ? (
                  <span className="text-blue-400">▶</span>
                ) : (
                  `${index + 1}.`
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${!isCurrent ? "text-gray-300" : ""}`}>
                  {item.video.title}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {item.video.artist}
                  {item.video.duration && ` • ${formatDuration(item.video.duration)}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <button
        onClick={clearHistory}
        className="mt-3 w-full py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
      >
        Clear History
      </button>
    </div>
  );
}

export default App;

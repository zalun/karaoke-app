import { useState, useCallback } from "react";
import { AppLayout } from "./components/layout";
import { VideoPlayer, PlayerControls } from "./components/player";
import { SearchBar, SearchResults } from "./components/search";
import { DependencyCheck } from "./components/DependencyCheck";
import { usePlayerStore, useQueueStore } from "./stores";
import { youtubeService } from "./services";
import type { SearchResult } from "./types";

function App() {
  const [dependenciesReady, setDependenciesReady] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const { setCurrentVideo, setIsPlaying, setIsLoading } = usePlayerStore();
  const { addToQueue } = useQueueStore();

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

      try {
        const streamInfo = await youtubeService.getStreamUrl(result.id);

        setCurrentVideo({
          id: result.id,
          title: result.title,
          artist: result.channel,
          duration: result.duration,
          thumbnailUrl: result.thumbnail,
          source: "youtube",
          youtubeId: result.id,
          streamUrl: streamInfo.url,
        });

        setIsPlaying(true);
      } catch (err) {
        console.error("Failed to get stream URL:", err);
        setSearchError(
          err instanceof Error ? err.message : "Failed to load video"
        );
      }
    },
    [setCurrentVideo, setIsPlaying, setIsLoading]
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
              <VideoPlayer />
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

          {/* Right: Queue Panel */}
          <div className="bg-gray-800 rounded-lg p-4 overflow-auto">
            <h2 className="text-lg font-semibold mb-4">Queue</h2>
            <QueuePanel />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function QueuePanel() {
  const { items, removeFromQueue } = useQueueStore();

  if (items.length === 0) {
    return (
      <div className="text-gray-400 text-sm">
        <p>No songs in queue</p>
        <p className="mt-2 text-xs">
          Search for songs and click "+ Queue" to add them
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={`flex gap-2 p-2 rounded ${
            item.status === "playing" ? "bg-blue-900/50" : "bg-gray-700"
          }`}
        >
          <span className="text-gray-400 w-6">{index + 1}.</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{item.video.title}</p>
            <p className="text-xs text-gray-400 truncate">{item.video.artist}</p>
          </div>
          <button
            onClick={() => removeFromQueue(item.id)}
            className="text-gray-400 hover:text-red-400 text-sm"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default App;

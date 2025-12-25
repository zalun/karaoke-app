import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AppLayout } from "./components/layout";
import { VideoPlayer, PlayerControls } from "./components/player";
import { SearchBar, SearchResults } from "./components/search";
import { DraggableQueueItem } from "./components/queue";
import { DependencyCheck } from "./components/DependencyCheck";
import { usePlayerStore, useQueueStore } from "./stores";
import { youtubeService } from "./services";
import type { SearchResult } from "./types";

type PanelTab = "queue" | "history";
type MainTab = "player" | "search";

function App() {
  const [dependenciesReady, setDependenciesReady] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("queue");
  const [mainTab, setMainTab] = useState<MainTab>("search");

  const { currentVideo, setCurrentVideo, setIsPlaying, setIsLoading } = usePlayerStore();
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

      // Set video info immediately (without stream URL) for instant UI feedback
      const pendingVideo = {
        id: result.id,
        title: result.title,
        artist: result.channel,
        duration: result.duration,
        thumbnailUrl: result.thumbnail,
        source: "youtube" as const,
        youtubeId: result.id,
      };
      setCurrentVideo(pendingVideo);

      try {
        const streamInfo = await youtubeService.getStreamUrl(result.id);

        const video = {
          ...pendingVideo,
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
        setCurrentVideo(null); // Clear on error
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
          {/* Left: Main content area */}
          <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
            {/* Player Controls - always visible, disabled when no video */}
            <PlayerControls />

            {/* Tabs - only show when video is loaded */}
            {currentVideo && (
              <div className="flex gap-2">
                <button
                  onClick={() => setMainTab("player")}
                  className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${
                    mainTab === "player"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  Now Playing
                </button>
                <button
                  onClick={() => setMainTab("search")}
                  className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${
                    mainTab === "search"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  Search Results
                </button>
              </div>
            )}

            {/* Content - both views stay mounted to avoid interrupting playback */}
            <div className="flex-1 min-h-0 relative">
              {/* Video Player - hidden but stays mounted when on search tab */}
              {currentVideo && (
                <div className={`h-full ${mainTab === "player" ? "" : "hidden"}`}>
                  <VideoPlayerArea />
                </div>
              )}
              {/* Search Results - hidden when on player tab */}
              <div className={`h-full overflow-auto ${mainTab === "search" || !currentVideo ? "" : "hidden"}`}>
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

  return (
    <div className="w-full h-full relative">
      {/* Keep VideoPlayer mounted but hidden when detached to preserve state */}
      <div className={isDetached ? "hidden" : "h-full"}>
        <VideoPlayer />
      </div>
      {/* Show placeholder when detached */}
      {isDetached && (
        <div className="w-full h-full flex items-center justify-center bg-gray-800 rounded-lg">
          <div className="text-center text-gray-400">
            <p className="text-4xl mb-2">🎤</p>
            <p>Video playing in separate window</p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function QueuePanel() {
  const { queue, playFromQueue, removeFromQueue, reorderQueue, clearQueue } = useQueueStore();
  const { setCurrentVideo, setIsPlaying, setIsLoading, setError } = usePlayerStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts, allows clicks
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = queue.findIndex((item) => item.id === active.id);
        const newIndex = queue.findIndex((item) => item.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          reorderQueue(active.id as string, newIndex);
        }
      }
    },
    [queue, reorderQueue]
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={queue.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex-1 overflow-auto space-y-2">
            {queue.map((item, index) => (
              <DraggableQueueItem
                key={item.id}
                item={item}
                index={index}
                onPlay={() => handlePlayFromQueue(index)}
                onRemove={() => removeFromQueue(item.id)}
                formatDuration={formatDuration}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        onClick={clearQueue}
        className="mt-3 w-full py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors flex items-center justify-center gap-2"
      >
        <span>🗑️</span>
        <span>Clear Queue</span>
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
        className="mt-3 w-full py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors flex items-center justify-center gap-2"
      >
        <span>🗑️</span>
        <span>Clear History</span>
      </button>
    </div>
  );
}

export default App;

import { useState, useCallback, useMemo } from "react";
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
import { SessionBar } from "./components/session";
import { DependencyCheck } from "./components/DependencyCheck";
import { DisplayRestoreDialog } from "./components/display";
import { usePlayerStore, useQueueStore, useSessionStore, getStreamUrlWithCache, type QueueItem } from "./stores";
import { SingerAvatar } from "./components/singers";
import { youtubeService, createLogger } from "./services";
import { useMediaControls, useDisplayWatcher } from "./hooks";
import type { SearchResult } from "./types";

const log = createLogger("App");

type PanelTab = "queue" | "history";
type MainTab = "player" | "search";

const RESULTS_PER_PAGE = 15;
const MAX_SEARCH_RESULTS = 50;

function App() {
  const [dependenciesReady, setDependenciesReady] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("queue");
  const [mainTab, setMainTab] = useState<MainTab>("search");
  const [displayedCount, setDisplayedCount] = useState(RESULTS_PER_PAGE);

  const { currentVideo, setCurrentVideo, setIsPlaying, setIsLoading } = usePlayerStore();
  const { addToQueue, playDirect } = useQueueStore();

  // Initialize macOS Now Playing media controls
  useMediaControls();

  // Initialize display hotplug watcher (macOS only)
  useDisplayWatcher();

  const handleSearch = useCallback(async (query: string) => {
    log.info(`Searching for: "${query}"`);
    setIsSearching(true);
    setSearchError(null);
    setDisplayedCount(RESULTS_PER_PAGE); // Reset pagination on new search

    try {
      const results = await youtubeService.search(query, MAX_SEARCH_RESULTS);
      log.info(`Search returned ${results.length} results`);
      setSearchResults(results);
    } catch (err) {
      log.error("Search failed", err);
      setSearchError(
        err instanceof Error ? err.message : "Search failed. Is yt-dlp installed?"
      );
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    setDisplayedCount((prev) => {
      const newCount = prev + RESULTS_PER_PAGE;
      log.debug(`Showing more results: ${newCount}`);
      return newCount;
    });
  }, []);

  const handlePlay = useCallback(
    async (result: SearchResult) => {
      log.info(`Playing: "${result.title}" by ${result.channel}`);
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
        const streamUrl = await getStreamUrlWithCache(result.id);
        const video = { ...pendingVideo, streamUrl };

        // Add to history and play
        playDirect(video);
        setCurrentVideo(video);
        setIsPlaying(true);
        log.info(`Now playing: ${result.title}`);
      } catch (err) {
        log.error("Failed to get stream URL", err);
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
      log.info(`Adding to queue: "${result.title}"`);
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
      {/* Display configuration restore dialog */}
      <DisplayRestoreDialog />

      <div className="h-full grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: Main content area */}
        <div className="lg:col-span-3 flex flex-col gap-4 min-h-0">
          {/* Search Bar */}
          <SearchBar onSearch={handleSearch} isLoading={isSearching} />

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
                displayedCount={displayedCount}
                onLoadMore={handleLoadMore}
              />
            </div>
          </div>
        </div>

        {/* Right: Session + Queue/History Panel */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          {/* Session Bar */}
          <SessionBar />

          {/* Queue/History Panel */}
          <div className="bg-gray-800 rounded-lg p-4 flex-1 overflow-auto flex flex-col">
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

function formatTotalDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "";
  // Round up to nearest 10 seconds
  const roundedSeconds = Math.ceil(totalSeconds / 10) * 10;
  const hours = Math.floor(roundedSeconds / 3600);
  const mins = Math.floor((roundedSeconds % 3600) / 60);
  const secs = roundedSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  if (roundedSeconds < 1200) { // Less than 20 minutes - show seconds
    if (mins > 0 && secs > 0) return `${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m`;
    return `${secs}s`;
  }
  return `${mins}m`;
}

function QueueSummary({ queue }: { queue: QueueItem[] }) {
  const totalDuration = useMemo(
    () => queue.reduce((sum, item) => sum + (item.video.duration || 0), 0),
    [queue]
  );
  const formattedDuration = formatTotalDuration(totalDuration);

  return (
    <span className="text-sm text-gray-400">
      {queue.length} {queue.length === 1 ? "song" : "songs"}
      {formattedDuration && ` · ${formattedDuration}`}
    </span>
  );
}

const queueLog = createLogger("QueuePanel");

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
        queueLog.info(`Playing from queue: "${item.video.title}"`);
        setIsLoading(true);
        try {
          const streamUrl = await getStreamUrlWithCache(item.video.youtubeId);
          setCurrentVideo({ ...item.video, streamUrl });
          setIsPlaying(true);
        } catch (err) {
          queueLog.error("Failed to play from queue", err);
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
          queueLog.debug(`Reordered queue: ${oldIndex} → ${newIndex}`);
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
                onRemove={() => {
                  queueLog.info(`Removing from queue: "${item.video.title}"`);
                  removeFromQueue(item.id);
                }}
                formatDuration={formatDuration}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="mt-3 flex items-center gap-2">
        <QueueSummary queue={queue} />
        <button
          onClick={() => {
            queueLog.info(`Clearing queue (${queue.length} items)`);
            clearQueue();
          }}
          className="ml-auto py-2 px-3 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors flex items-center justify-center gap-2"
        >
          <span>Clear Queue</span>
        </button>
      </div>
    </div>
  );
}

const historyLog = createLogger("HistoryPanel");

function HistoryPanel() {
  const { history, historyIndex, playFromHistory, clearHistory, moveAllHistoryToQueue } = useQueueStore();
  const { setCurrentVideo, setIsPlaying, setIsLoading, setError } = usePlayerStore();
  const { session, getQueueItemSingerIds, getSingerById } = useSessionStore();

  const handlePlayFromHistory = useCallback(
    async (index: number) => {
      const item = playFromHistory(index);
      if (item && item.video.youtubeId) {
        historyLog.info(`Playing from history: "${item.video.title}"`);
        setIsLoading(true);
        try {
          const streamUrl = await getStreamUrlWithCache(item.video.youtubeId);
          setCurrentVideo({ ...item.video, streamUrl });
          setIsPlaying(true);
        } catch (err) {
          historyLog.error("Failed to play from history", err);
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
              {/* Singer avatars */}
              {session && (() => {
                const singerIds = getQueueItemSingerIds(item.id);
                if (singerIds.length === 0) return null;
                const itemSingers = singerIds
                  .map((id) => getSingerById(id))
                  .filter(Boolean);
                if (itemSingers.length === 0) return null;
                return (
                  <div className="flex -space-x-1 flex-shrink-0">
                    {itemSingers.slice(0, 3).map((singer) => (
                      <SingerAvatar
                        key={singer!.id}
                        name={singer!.name}
                        color={singer!.color}
                        size="sm"
                        className="ring-1 ring-gray-800"
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => {
            historyLog.info(`Moving all history to queue (${history.length} items)`);
            moveAllHistoryToQueue();
          }}
          className="flex-1 py-2 text-sm text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors flex items-center justify-center gap-2"
          title="Move all history items back to queue"
          aria-label={`Replay all ${history.length} songs from history`}
        >
          <span>Replay All</span>
        </button>
        <button
          onClick={() => {
            historyLog.info(`Clearing history (${history.length} items)`);
            clearHistory();
          }}
          className="flex-1 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors flex items-center justify-center gap-2"
          aria-label={`Clear ${history.length} songs from history`}
        >
          <span>Clear History</span>
        </button>
      </div>
    </div>
  );
}

export default App;

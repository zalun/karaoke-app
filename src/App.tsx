import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
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
import { SearchBar, SearchResults, LocalSearchResults, ActiveSingerSelector, type SearchBarRef, type SearchResultsRef, type LocalSearchResultsRef } from "./components/search";
import { LibraryBrowser } from "./components/library";
import { DraggableQueueItem } from "./components/queue";
import { SessionBar } from "./components/session";
import { DependencyCheck } from "./components/DependencyCheck";
import { DisplayRestoreDialog } from "./components/display";
import { LoadFavoritesDialog, ManageFavoritesDialog, FavoriteStar } from "./components/favorites";
import { SettingsDialog } from "./components/settings";
import { usePlayerStore, useQueueStore, useSessionStore, useFavoritesStore, useSettingsStore, useLibraryStore, getStreamUrlWithCache, showWindowsAudioNoticeOnce, notify, SETTINGS_KEYS, type QueueItem, type LibraryVideo, type Video } from "./stores";
import { SingerAvatar } from "./components/singers";
import { Shuffle, Trash2, ListRestart, Star } from "lucide-react";
import { youtubeService, createLogger, getErrorMessage } from "./services";
import { useMediaControls, useDisplayWatcher, useUpdateCheck, useKeyboardShortcuts } from "./hooks";
import { NotificationBar } from "./components/notification";
import type { SearchResult } from "./types";

const log = createLogger("App");

type PanelTab = "queue" | "history";
type MainTab = "player" | "search" | "library";

/** Returns className for tab buttons based on active state */
function getTabClassName(isActive: boolean): string {
  const base = "flex-1 py-2 px-4 font-medium transition-colors rounded-t-lg";
  const active = "bg-gray-800 text-white border-t border-l border-r border-gray-700";
  const inactive = "bg-gray-900 text-gray-400 hover:text-gray-300 border-b border-gray-700";
  return `${base} ${isActive ? active : inactive}`;
}

const RESULTS_PER_PAGE = 15;
const MAX_SEARCH_RESULTS = 50;

/**
 * Check if YouTube Embed mode should be used (vs yt-dlp).
 * Returns true if playback mode is not yt-dlp OR yt-dlp is not available.
 */
function shouldUseYouTubeEmbed(): boolean {
  const settingsState = useSettingsStore.getState();
  const playbackMode = settingsState.getSetting(SETTINGS_KEYS.PLAYBACK_MODE);
  const ytDlpAvailable = settingsState.ytDlpAvailable;
  return playbackMode !== "ytdlp" || !ytDlpAvailable;
}

/**
 * Prepare a video for playback, fetching stream URL if needed (yt-dlp mode only).
 * Returns the video with streamUrl added if in yt-dlp mode, or as-is for YouTube Embed.
 * Also shows one-time Windows audio notice on first play.
 */
async function prepareVideoForPlayback(video: Video): Promise<Video> {
  // Show one-time Windows audio notice (fire-and-forget)
  showWindowsAudioNoticeOnce().catch(() => {});

  if (shouldUseYouTubeEmbed()) {
    return video;
  }
  // yt-dlp mode - fetch stream URL
  if (!video.youtubeId) {
    return video;
  }
  const streamUrl = await getStreamUrlWithCache(video.youtubeId);
  return { ...video, streamUrl };
}

function App() {
  const [dependenciesReady, setDependenciesReady] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("queue");
  const [mainTab, setMainTab] = useState<MainTab>("search");
  const [displayedCount, setDisplayedCount] = useState(RESULTS_PER_PAGE);

  // Ref for focusing the search bar
  const searchBarRef = useRef<SearchBarRef>(null);
  const searchResultsRef = useRef<SearchResultsRef>(null);
  const localSearchResultsRef = useRef<LocalSearchResultsRef>(null);

  const { currentVideo, setCurrentVideo, setIsPlaying, setIsLoading } = usePlayerStore();
  const { addToQueue, addToQueueNext, playDirect } = useQueueStore();
  const {
    searchMode,
    searchResults: localSearchResults,
    isSearching: isLocalSearching,
    searchLibrary,
    loadFolders,
  } = useLibraryStore();

  // Initialize macOS Now Playing media controls
  useMediaControls();

  // Focus search bar and switch to search tab
  const handleFocusSearch = useCallback(() => {
    setMainTab("search");
    // Use setTimeout to ensure the tab switch happens before focusing
    setTimeout(() => {
      searchBarRef.current?.focus();
    }, 0);
  }, []);

  // Add file to queue via file dialog (Cmd+O)
  const handleAddFile = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        title: "Select video files to add to queue",
        filters: [
          {
            name: "Video Files",
            extensions: ["mp4", "mkv", "webm", "avi", "mov"],
          },
        ],
      });

      if (selected) {
        // Handle both single file (string) and multiple files (string[])
        const files = Array.isArray(selected) ? selected : [selected];
        for (const filePath of files) {
          // Extract filename for title
          const filename = filePath.split("/").pop() || filePath;
          // Remove extension for cleaner title
          const title = filename.replace(/\.[^/.]+$/, "");

          const video: Video = {
            id: filePath,
            title,
            source: "local",
            filePath,
          };

          addToQueue(video);
          log.info(`Added file to queue: "${title}"`);
        }

        if (files.length > 0) {
          notify("success", `Added ${files.length} file${files.length > 1 ? "s" : ""} to queue`);
        }
      }
    } catch (error) {
      log.error("Failed to add file:", error);
      notify("error", "Failed to add file to queue");
    }
  }, [addToQueue]);

  // Switch to next panel (Player -> Search -> Library -> Player)
  const handleSwitchPanel = useCallback(() => {
    setMainTab((current) => {
      const tabs: MainTab[] = ["player", "search", "library"];
      const currentIndex = tabs.indexOf(current);
      const nextIndex = (currentIndex + 1) % tabs.length;
      return tabs[nextIndex];
    });
  }, []);

  // Initialize keyboard shortcuts (global shortcuts + Cmd+F for search + Cmd+O for file + Tab for panels)
  useKeyboardShortcuts({
    onFocusSearch: handleFocusSearch,
    onAddFile: handleAddFile,
    onSwitchPanel: handleSwitchPanel,
  });

  // Initialize display hotplug watcher (macOS only)
  useDisplayWatcher();

  // Check for app updates on startup
  useUpdateCheck();

  // Get favorites store methods for menu events
  const { openLoadFavoritesDialog, openManageFavoritesDialog } = useFavoritesStore();

  // Get settings store methods for menu events
  const { openSettingsDialog } = useSettingsStore();

  // Listen for menu events
  useEffect(() => {
    let mounted = true;
    const unsubscribers: (() => void)[] = [];

    listen("show-load-favorites-dialog", () => {
      log.info("Load Favorites dialog triggered from menu");
      openLoadFavoritesDialog();
    }).then((fn) => {
      if (mounted) unsubscribers.push(fn);
      else fn(); // Already unmounted, clean up immediately
    });

    listen("show-manage-favorites-dialog", () => {
      log.info("Manage Favorites dialog triggered from menu");
      openManageFavoritesDialog();
    }).then((fn) => {
      if (mounted) unsubscribers.push(fn);
      else fn(); // Already unmounted, clean up immediately
    });

    listen("show-settings-dialog", () => {
      log.info("Settings dialog triggered from menu");
      openSettingsDialog();
    }).then((fn) => {
      if (mounted) unsubscribers.push(fn);
      else fn(); // Already unmounted, clean up immediately
    });

    return () => {
      mounted = false;
      unsubscribers.forEach((fn) => fn());
    };
  }, [openLoadFavoritesDialog, openManageFavoritesDialog, openSettingsDialog]);

  // Load library folders on mount
  useEffect(() => {
    loadFolders().catch((err) => {
      log.error("Failed to load library folders:", err);
    });
  }, [loadFolders]);

  const handleSearch = useCallback(async (query: string) => {
    log.info(`Searching for: "${query}" (mode: ${searchMode})`);
    setDisplayedCount(RESULTS_PER_PAGE); // Reset pagination on new search

    if (searchMode === "local") {
      // Local library search
      setSearchError(null);
      try {
        await searchLibrary(query, MAX_SEARCH_RESULTS);
      } catch (err) {
        log.error("Local search failed", err);
        setSearchError(getErrorMessage(err, "Local search failed"));
      }
    } else {
      // YouTube search
      setIsSearching(true);
      setSearchError(null);

      try {
        // Determine which search method to use
        const method = await youtubeService.getSearchMethod();
        log.info(`YouTube search method: ${method}`);

        if (method === "none") {
          // No search method available - show setup prompt
          setSearchError("YouTube search is not configured. Please add your YouTube API key in Settings > YouTube, or install yt-dlp.");
          setSearchResults([]);
          return;
        }

        // Use appropriate search method
        const results = method === "api"
          ? await youtubeService.apiSearch(query, MAX_SEARCH_RESULTS)
          : await youtubeService.search(query, MAX_SEARCH_RESULTS);

        log.info(`Search returned ${results.length} results`);
        setSearchResults(results);
        // Focus search results after they render
        setTimeout(() => {
          if (searchMode === "youtube") {
            searchResultsRef.current?.focus();
          } else {
            localSearchResultsRef.current?.focus();
          }
        }, 100);
      } catch (err) {
        log.error("Search failed", err);
        setSearchError(getErrorMessage(err, "Search failed"));
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }
  }, [searchMode, searchLibrary]);

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
      const pendingVideo: Video = {
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
        const video = await prepareVideoForPlayback(pendingVideo);
        playDirect(video);
        setCurrentVideo(video);
        setIsPlaying(true);
        log.info(`Now playing: ${result.title}`);
      } catch (err) {
        log.error("Failed to get stream URL", err);
        setSearchError(getErrorMessage(err, "Failed to load video"));
        setCurrentVideo(null);
        setIsLoading(false);
        setIsPlaying(false);
      }
    },
    [setCurrentVideo, setIsPlaying, setIsLoading, playDirect]
  );

  const handleAddToQueue = useCallback(
    async (result: SearchResult) => {
      log.info(`Adding to queue: "${result.title}"`);
      const queueItem = addToQueue({
        id: result.id,
        title: result.title,
        artist: result.channel,
        duration: result.duration,
        thumbnailUrl: result.thumbnail,
        source: "youtube",
        youtubeId: result.id,
      });

      // Auto-assign active singer if set.
      // Note: No race condition here - addToQueue is synchronous and returns the item
      // with a client-generated UUID immediately. DB persistence is async but the
      // singer assignment only needs the item ID, which exists before persistence.
      const { activeSingerId, assignSingerToQueueItem, getSingerById } = useSessionStore.getState();
      if (activeSingerId && queueItem) {
        try {
          await assignSingerToQueueItem(queueItem.id, activeSingerId);
          log.debug(`Auto-assigned singer ${activeSingerId} to queue item ${queueItem.id}`);
        } catch (error) {
          log.error("Failed to auto-assign singer:", error);
          const singer = getSingerById(activeSingerId);
          notify("warning", `Could not assign ${singer?.name || "singer"} to song`);
        }
      }
    },
    [addToQueue]
  );

  const handlePlayNext = useCallback(
    async (result: SearchResult) => {
      // If nothing is playing, start playback immediately
      if (!currentVideo) {
        log.info(`Nothing playing, starting playback: "${result.title}"`);
        handlePlay(result);
        return;
      }

      log.info(`Adding to play next: "${result.title}"`);
      const queueItem = addToQueueNext({
        id: result.id,
        title: result.title,
        artist: result.channel,
        duration: result.duration,
        thumbnailUrl: result.thumbnail,
        source: "youtube",
        youtubeId: result.id,
      });

      // Auto-assign active singer if set.
      // Note: No race condition here - addToQueueNext is synchronous and returns the item
      // with a client-generated UUID immediately. DB persistence is async but the
      // singer assignment only needs the item ID, which exists before persistence.
      const { activeSingerId, assignSingerToQueueItem, getSingerById } = useSessionStore.getState();
      if (activeSingerId && queueItem) {
        try {
          await assignSingerToQueueItem(queueItem.id, activeSingerId);
          log.debug(`Auto-assigned singer ${activeSingerId} to queue item ${queueItem.id}`);
        } catch (error) {
          log.error("Failed to auto-assign singer:", error);
          const singer = getSingerById(activeSingerId);
          notify("warning", `Could not assign ${singer?.name || "singer"} to song`);
        }
      }
    },
    [currentVideo, handlePlay, addToQueueNext]
  );

  // Local file handlers
  const handleLocalPlay = useCallback(
    async (video: LibraryVideo) => {
      if (!video.is_available) {
        notify("error", "File is not available");
        return;
      }

      log.info(`Playing local file: "${video.title}"`);
      setIsLoading(true);
      setSearchError(null);

      try {
        // Re-check file availability before playing (file could have been moved/deleted)
        const stillAvailable = await useLibraryStore.getState().checkFileAvailable(video.file_path);
        if (!stillAvailable) {
          log.warn(`File no longer available: "${video.file_path}"`);
          notify("error", "File is no longer available");
          setIsLoading(false);
          return;
        }

        const pendingVideo = {
          id: video.file_path,
          title: video.title,
          artist: video.artist || undefined,
          duration: video.duration || undefined,
          thumbnailUrl: video.thumbnail_path ? convertFileSrc(video.thumbnail_path) : undefined,
          source: "local" as const,
          filePath: video.file_path,
        };

        setCurrentVideo(pendingVideo);
        playDirect(pendingVideo);
        setIsPlaying(true);
      } catch (error) {
        log.error("Failed to play local file:", error);
        notify("error", "Failed to play file");
        setIsLoading(false);
      }
    },
    [setCurrentVideo, setIsPlaying, setIsLoading, playDirect]
  );

  const handleLocalAddToQueue = useCallback(
    async (video: LibraryVideo) => {
      if (!video.is_available) return;

      log.info(`Adding local file to queue: "${video.title}"`);
      const queueItem = addToQueue({
        id: video.file_path,
        title: video.title,
        artist: video.artist || undefined,
        duration: video.duration || undefined,
        thumbnailUrl: video.thumbnail_path ? convertFileSrc(video.thumbnail_path) : undefined,
        source: "local",
        filePath: video.file_path,
      });

      // Auto-assign active singer if set
      const { activeSingerId, assignSingerToQueueItem, getSingerById } = useSessionStore.getState();
      if (activeSingerId && queueItem) {
        try {
          await assignSingerToQueueItem(queueItem.id, activeSingerId);
          log.debug(`Auto-assigned singer ${activeSingerId} to queue item ${queueItem.id}`);
        } catch (error) {
          log.error("Failed to auto-assign singer:", error);
          const singer = getSingerById(activeSingerId);
          notify("warning", `Could not assign ${singer?.name || "singer"} to song`);
        }
      }
    },
    [addToQueue]
  );

  const handleLocalPlayNext = useCallback(
    async (video: LibraryVideo) => {
      if (!video.is_available) return;

      // If nothing is playing, start playback immediately
      if (!currentVideo) {
        handleLocalPlay(video);
        return;
      }

      log.info(`Adding local file to play next: "${video.title}"`);
      const queueItem = addToQueueNext({
        id: video.file_path,
        title: video.title,
        artist: video.artist || undefined,
        duration: video.duration || undefined,
        thumbnailUrl: video.thumbnail_path ? convertFileSrc(video.thumbnail_path) : undefined,
        source: "local",
        filePath: video.file_path,
      });

      // Auto-assign active singer if set
      const { activeSingerId, assignSingerToQueueItem, getSingerById } = useSessionStore.getState();
      if (activeSingerId && queueItem) {
        try {
          await assignSingerToQueueItem(queueItem.id, activeSingerId);
          log.debug(`Auto-assigned singer ${activeSingerId} to queue item ${queueItem.id}`);
        } catch (error) {
          log.error("Failed to auto-assign singer:", error);
          const singer = getSingerById(activeSingerId);
          notify("warning", `Could not assign ${singer?.name || "singer"} to song`);
        }
      }
    },
    [currentVideo, handleLocalPlay, addToQueueNext]
  );

  if (!dependenciesReady) {
    return <DependencyCheck onReady={() => setDependenciesReady(true)} />;
  }

  return (
    <AppLayout>
      {/* Notification bar (bottom) */}
      <NotificationBar />

      {/* Display configuration restore dialog */}
      <DisplayRestoreDialog />

      {/* Favorites dialogs */}
      <LoadFavoritesDialog />
      <ManageFavoritesDialog />

      {/* Settings dialog */}
      <SettingsDialog />

      <div data-tauri-drag-region className="h-full grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: Main content area */}
        <div className="lg:col-span-3 flex flex-col gap-4 min-h-0">
          {/* Search Bar - always visible */}
          <SearchBar ref={searchBarRef} onSearch={handleSearch} isLoading={isSearching} />

          {/* Player Controls - always visible, disabled when no video */}
          <PlayerControls />

          {/* Main Tabs + Content - wrapped together for connected tab styling */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tabs */}
            <div className="flex shrink-0" role="tablist">
              <button
                role="tab"
                aria-selected={mainTab === "player"}
                onClick={() => setMainTab("player")}
                className={getTabClassName(mainTab === "player")}
              >
                Player
              </button>
              <button
                role="tab"
                aria-selected={mainTab === "search"}
                onClick={() => setMainTab("search")}
                className={getTabClassName(mainTab === "search")}
              >
                Search
              </button>
              <button
                role="tab"
                aria-selected={mainTab === "library"}
                onClick={() => setMainTab("library")}
                className={getTabClassName(mainTab === "library")}
              >
                Library
              </button>
            </div>

            {/* Content - views stay mounted to avoid interrupting playback */}
            <div className="flex-1 min-h-0 relative bg-gray-800 rounded-b-lg p-4 border border-t-0 border-gray-700">
            {/* Video Player - hidden but stays mounted when not on player tab */}
            <div className={`h-full ${mainTab === "player" ? "" : "hidden"}`}>
              {currentVideo ? (
                <VideoPlayerArea />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <div className="text-6xl mb-4">🎤</div>
                  <p className="text-lg">No video playing</p>
                  <p className="text-sm mt-2">Search for a song or browse your library</p>
                </div>
              )}
            </div>

            {/* Search Results - visible when on search tab */}
            <div className={`h-full flex flex-col ${mainTab === "search" ? "" : "hidden"}`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">
                  {searchMode === "local" ? "Local Files" : "Search Results"}
                </h2>
                <ActiveSingerSelector />
              </div>
              <div className="flex-1 overflow-auto">
                {searchMode === "local" ? (
                  <LocalSearchResults
                    ref={localSearchResultsRef}
                    results={localSearchResults}
                    isLoading={isLocalSearching}
                    error={searchError}
                    onPlay={handleLocalPlay}
                    onAddToQueue={handleLocalAddToQueue}
                    onPlayNext={handleLocalPlayNext}
                    displayedCount={displayedCount}
                    onLoadMore={handleLoadMore}
                  />
                ) : (
                  <SearchResults
                    ref={searchResultsRef}
                    results={searchResults}
                    isLoading={isSearching}
                    error={searchError}
                    onPlay={handlePlay}
                    onAddToQueue={handleAddToQueue}
                    onPlayNext={handlePlayNext}
                    displayedCount={displayedCount}
                    onLoadMore={handleLoadMore}
                  />
                )}
              </div>
            </div>

            {/* Library Browser - visible when on library tab */}
            <div className={`h-full ${mainTab === "library" ? "" : "hidden"}`}>
              <LibraryBrowser
                onPlay={handleLocalPlay}
                onAddToQueue={handleLocalAddToQueue}
                onPlayNext={handleLocalPlayNext}
              />
            </div>
          </div>
          </div>
        </div>

        {/* Right: Session + Queue/History Panel */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          {/* Session Bar */}
          <SessionBar />

          {/* Queue/History Panel */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tabs */}
            <div className="flex shrink-0" role="tablist">
              <button
                role="tab"
                aria-selected={activeTab === "queue"}
                onClick={() => setActiveTab("queue")}
                className={getTabClassName(activeTab === "queue")}
              >
                Queue
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "history"}
                onClick={() => setActiveTab("history")}
                className={getTabClassName(activeTab === "history")}
              >
                History
              </button>
            </div>

            {/* Panel content */}
            <div className="bg-gray-800 rounded-b-lg p-4 flex-1 overflow-auto flex flex-col border border-t-0 border-gray-700">
              {activeTab === "queue" ? <QueuePanel /> : <HistoryPanel />}
            </div>
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
  const { queue, playFromQueue, removeFromQueue, reorderQueue, clearQueue, fairShuffle } = useQueueStore();
  const { setCurrentVideo, setIsPlaying, setIsLoading } = usePlayerStore();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clear selection when the selected item is removed from queue
  useEffect(() => {
    if (selectedItemId && !queue.find((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [queue, selectedItemId]);

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
      if (!item) return;

      // Handle local files
      if (item.video.source === "local" && item.video.filePath) {
        queueLog.info(`Playing local file from queue: "${item.video.title}"`);
        setCurrentVideo(item.video);
        setIsPlaying(true);
        return;
      }

      // Handle YouTube videos
      if (item.video.youtubeId) {
        queueLog.info(`Playing from queue: "${item.video.title}"`);
        setIsLoading(true);
        try {
          const video = await prepareVideoForPlayback(item.video);
          setCurrentVideo(video);
          setIsPlaying(true);
        } catch (err) {
          queueLog.error("Failed to play from queue", err);
          notify("error", "Failed to play video");
          setIsLoading(false);
        }
      }
    },
    [playFromQueue, setCurrentVideo, setIsPlaying, setIsLoading]
  );

  // Handle keyboard navigation within the queue panel
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle keys when the queue panel has focus
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== containerRef.current) {
        return;
      }

      // Don't handle if focus is on an input or button
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "BUTTON") {
        return;
      }

      const selectedIndex = selectedItemId ? queue.findIndex((item) => item.id === selectedItemId) : -1;

      switch (event.key) {
        case "ArrowUp": {
          event.preventDefault();
          if (queue.length === 0) return;
          if (selectedIndex <= 0) {
            // Select first item or wrap to first if nothing selected
            setSelectedItemId(queue[0].id);
          } else {
            setSelectedItemId(queue[selectedIndex - 1].id);
          }
          break;
        }
        case "ArrowDown": {
          event.preventDefault();
          if (queue.length === 0) return;
          if (selectedIndex === -1) {
            // Select first item
            setSelectedItemId(queue[0].id);
          } else if (selectedIndex < queue.length - 1) {
            setSelectedItemId(queue[selectedIndex + 1].id);
          }
          break;
        }
        case "Delete":
        case "Backspace": {
          if (selectedItemId) {
            event.preventDefault();
            const itemToRemove = queue.find((item) => item.id === selectedItemId);
            if (itemToRemove) {
              queueLog.info(`Removing from queue via keyboard: "${itemToRemove.video.title}"`);
              // Select the next item before removing
              if (selectedIndex < queue.length - 1) {
                setSelectedItemId(queue[selectedIndex + 1].id);
              } else if (selectedIndex > 0) {
                setSelectedItemId(queue[selectedIndex - 1].id);
              } else {
                setSelectedItemId(null);
              }
              removeFromQueue(selectedItemId);
            }
          }
          break;
        }
        case "Enter": {
          if (selectedItemId && selectedIndex !== -1) {
            event.preventDefault();
            queueLog.info(`Playing from queue via keyboard: index ${selectedIndex}`);
            handlePlayFromQueue(selectedIndex);
            setSelectedItemId(null);
          }
          break;
        }
        case "Escape": {
          event.preventDefault();
          setSelectedItemId(null);
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [queue, selectedItemId, removeFromQueue, handlePlayFromQueue]);

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
    <div
      ref={containerRef}
      className="flex flex-col flex-1 min-h-0"
      tabIndex={0}
      onFocus={() => {
        // Select first item when panel receives focus if nothing selected
        if (!selectedItemId && queue.length > 0) {
          setSelectedItemId(queue[0].id);
        }
      }}
    >
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
                isSelected={item.id === selectedItemId}
                onSelect={() => setSelectedItemId(item.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="mt-3 flex items-center gap-2">
        <QueueSummary queue={queue} />
        <button
          onClick={async () => {
            queueLog.info(`Fair shuffling queue (${queue.length} items)`);
            try {
              await fairShuffle();
              notify("success", "Queue reordered for fair rotation");
            } catch (error) {
              queueLog.error("Failed to fair shuffle queue:", error);
              notify("error", "Failed to shuffle queue");
            }
          }}
          disabled={queue.length <= 1}
          title="Fair Shuffle"
          aria-label="Fair shuffle queue by singer"
          className="ml-auto p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent"
        >
          <Shuffle size={18} />
        </button>
        {showClearConfirm ? (
          <div className="flex items-center gap-2 bg-red-900/30 px-2 py-1 rounded">
            <span className="text-red-400 text-xs">Clear all?</span>
            <button
              onClick={() => {
                queueLog.info(`Clearing queue (${queue.length} items)`);
                clearQueue();
                setShowClearConfirm(false);
              }}
              className="text-red-400 hover:text-red-300 text-xs font-medium"
            >
              Yes
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="text-gray-400 hover:text-gray-300 text-xs"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={queue.length === 0}
            title="Clear Queue"
            aria-label="Clear queue"
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

const historyLog = createLogger("HistoryPanel");

function HistoryPanel() {
  const { history, historyIndex, playFromHistory, clearHistory, moveAllHistoryToQueue } = useQueueStore();
  const { setCurrentVideo, setIsPlaying, setIsLoading } = usePlayerStore();
  const { session, getQueueItemSingerIds, getSingerById } = useSessionStore();
  const {
    historySelectionMode,
    selectedHistoryIds,
    persistentSingers,
    toggleHistorySelectionMode,
    toggleHistoryItemSelection,
    addSelectedHistoryToFavorites,
    loadPersistentSingers,
  } = useFavoritesStore();

  const [showSingerPicker, setShowSingerPicker] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Load persistent singers when entering selection mode
  useEffect(() => {
    if (historySelectionMode) {
      loadPersistentSingers();
    }
  }, [historySelectionMode, loadPersistentSingers]);

  const handlePlayFromHistory = useCallback(
    async (index: number) => {
      const item = playFromHistory(index);
      if (!item) return;

      // Handle local files
      if (item.video.source === "local" && item.video.filePath) {
        historyLog.info(`Playing local file from history: "${item.video.title}"`);
        setCurrentVideo(item.video);
        setIsPlaying(true);
        return;
      }

      // Handle YouTube videos
      if (item.video.youtubeId) {
        historyLog.info(`Playing from history: "${item.video.title}"`);
        setIsLoading(true);
        try {
          const video = await prepareVideoForPlayback(item.video);
          setCurrentVideo(video);
          setIsPlaying(true);
        } catch (err) {
          historyLog.error("Failed to play from history", err);
          notify("error", "Failed to play video");
          setIsLoading(false);
        }
      }
    },
    [playFromHistory, setCurrentVideo, setIsPlaying, setIsLoading]
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

  const handleAddToFavorites = async (singerId: number) => {
    await addSelectedHistoryToFavorites(singerId);
    setShowSingerPicker(false);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Selection mode header */}
      {historySelectionMode && (
        <div className="flex items-center gap-2 mb-2 p-2 bg-gray-700/50 rounded">
          <span className="text-sm text-gray-300 flex-1">
            {selectedHistoryIds.size} selected
          </span>
          {selectedHistoryIds.size > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowSingerPicker(!showSingerPicker)}
                className="px-3 py-1 text-sm bg-yellow-600 hover:bg-yellow-500 text-white rounded transition-colors"
              >
                Add to Favorites
              </button>
              {showSingerPicker && (
                <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[180px] z-50">
                  <div className="px-3 py-2 border-b border-gray-700">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">
                      Select singer
                    </span>
                  </div>
                  {persistentSingers.length > 0 ? (
                    <div className="py-1 max-h-48 overflow-y-auto">
                      {persistentSingers.map((singer) => (
                        <button
                          key={singer.id}
                          onClick={() => handleAddToFavorites(singer.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 transition-colors"
                        >
                          <SingerAvatar name={singer.name} color={singer.color} size="sm" />
                          <span className="text-sm text-gray-200 flex-1 text-left truncate">
                            {singer.name}
                            {singer.unique_name && (
                              <span className="text-gray-400 ml-1">({singer.unique_name})</span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-4 text-sm text-gray-400 text-center">
                      No persistent singers
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            onClick={toggleHistorySelectionMode}
            className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto space-y-2">
        {history.map((item, index) => {
          const isCurrent = index === effectiveIndex;
          const isSelected = selectedHistoryIds.has(item.id);
          return (
            <div
              key={item.id}
              onClick={() => {
                if (historySelectionMode) {
                  toggleHistoryItemSelection(item.id);
                } else {
                  handlePlayFromHistory(index);
                }
              }}
              className={`flex gap-2 p-2 rounded cursor-pointer transition-colors ${
                historySelectionMode && isSelected
                  ? "bg-yellow-900/30 border border-yellow-600"
                  : isCurrent
                  ? "bg-blue-900/50 border border-blue-600"
                  : "bg-gray-700/50 hover:bg-gray-600"
              }`}
            >
              {historySelectionMode ? (
                <span className="w-6 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleHistoryItemSelection(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-yellow-500 focus:ring-yellow-500"
                  />
                </span>
              ) : (
                <span className="text-gray-400 w-6 flex items-center justify-center">
                  {isCurrent ? (
                    <span className="text-blue-400">▶</span>
                  ) : (
                    `${index + 1}.`
                  )}
                </span>
              )}
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
              {/* Favorite star */}
              {!historySelectionMode && persistentSingers.length > 0 && (
                <div onClick={(e) => e.stopPropagation()}>
                  <FavoriteStar video={item.video} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1" />
        {!historySelectionMode && (
          <button
            onClick={toggleHistorySelectionMode}
            className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-gray-700 rounded transition-colors"
            title="Select songs to add to favorites"
            aria-label="Select songs to add to favorites"
          >
            <Star size={18} />
          </button>
        )}
        <button
          onClick={() => {
            historyLog.info(`Moving all history to queue (${history.length} items)`);
            moveAllHistoryToQueue();
          }}
          className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors"
          title="Move all history items back to queue"
          aria-label={`Replay all ${history.length} songs from history`}
        >
          <ListRestart size={18} />
        </button>
        {showClearConfirm ? (
          <div className="flex items-center gap-2 bg-red-900/30 px-2 py-1 rounded">
            <span className="text-red-400 text-xs">Clear all?</span>
            <button
              onClick={() => {
                historyLog.info(`Clearing history (${history.length} items)`);
                clearHistory();
                setShowClearConfirm(false);
              }}
              className="text-red-400 hover:text-red-300 text-xs font-medium"
            >
              Yes
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="text-gray-400 hover:text-gray-300 text-xs"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={history.length === 0}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Clear History"
            aria-label={`Clear ${history.length} songs from history`}
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

export default App;

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Star, Check } from "lucide-react";
import { useFavoritesStore, useSessionStore } from "../../stores";
import type { Video } from "../../stores";
import type { FavoriteVideo, SingerFavorite } from "../../services";
import { favoritesService } from "../../services";
import { SingerAvatar } from "../singers/SingerAvatar";

const DROPDOWN_WIDTH = 200;
const DROPDOWN_OFFSET_Y = 8;
const DROPDOWN_MAX_HEIGHT = 300;
const DROPDOWN_MARGIN = 8;

interface DropdownPosition {
  top: number;
  left: number;
  openAbove: boolean;
  maxHeight: number;
}

interface FavoriteStarProps {
  video: Video;
  className?: string;
}

function videoToFavoriteVideo(video: Video): FavoriteVideo {
  return {
    video_id: video.id,
    title: video.title,
    artist: video.artist,
    duration: video.duration,
    thumbnail_url: video.thumbnailUrl,
    source: video.source,
    youtube_id: video.youtubeId,
    file_path: video.filePath,
  };
}

export function FavoriteStar({ video, className = "" }: FavoriteStarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>({
    top: 0,
    left: 0,
    openAbove: true,
    maxHeight: DROPDOWN_MAX_HEIGHT,
  });
  const [singerFavorites, setSingerFavorites] = useState<Map<number, SingerFavorite | null>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { persistentSingers, loadPersistentSingers, addFavorite, removeFavorite } =
    useFavoritesStore();
  const { session } = useSessionStore();

  // Check if this video is a favorite for any singer
  const isFavorite = Array.from(singerFavorites.values()).some((fav) => fav !== null);

  // Load favorite status for all persistent singers
  const loadFavoriteStatus = useCallback(async () => {
    if (persistentSingers.length === 0) return;
    setIsLoading(true);
    try {
      const newMap = new Map<number, SingerFavorite | null>();
      await Promise.all(
        persistentSingers.map(async (singer) => {
          const favorites = await favoritesService.getSingerFavorites(singer.id);
          const found = favorites.find((f) => f.video.video_id === video.id);
          newMap.set(singer.id, found || null);
        })
      );
      setSingerFavorites(newMap);
    } catch (error) {
      console.error("Failed to load favorite status:", error);
    } finally {
      setIsLoading(false);
    }
  }, [persistentSingers, video.id]);

  // Load persistent singers and check favorite status when dropdown opens
  useEffect(() => {
    if (isOpen) {
      loadPersistentSingers();
      loadFavoriteStatus();
    }
  }, [isOpen, loadPersistentSingers, loadFavoriteStatus]);

  // Also check favorite status on mount if we have persistent singers
  useEffect(() => {
    if (persistentSingers.length > 0) {
      loadFavoriteStatus();
    }
  }, [persistentSingers.length, loadFavoriteStatus]);

  // Calculate and update dropdown position
  const updateDropdownPosition = useCallback(() => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const spaceAbove = rect.top - DROPDOWN_MARGIN;
    const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_MARGIN;

    const canFitAbove = spaceAbove >= DROPDOWN_MAX_HEIGHT;
    const canFitBelow = spaceBelow >= DROPDOWN_MAX_HEIGHT;
    const openAbove = canFitAbove || (!canFitBelow && spaceAbove > spaceBelow);

    const availableSpace = openAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(
      DROPDOWN_MAX_HEIGHT,
      availableSpace - DROPDOWN_OFFSET_Y
    );

    setDropdownPosition({
      top: openAbove
        ? rect.top - DROPDOWN_OFFSET_Y
        : rect.bottom + DROPDOWN_OFFSET_Y,
      left: Math.max(
        DROPDOWN_MARGIN,
        Math.min(
          rect.right - DROPDOWN_WIDTH,
          window.innerWidth - DROPDOWN_WIDTH - DROPDOWN_MARGIN
        )
      ),
      openAbove,
      maxHeight: Math.max(100, maxHeight),
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    return () => window.removeEventListener("resize", updateDropdownPosition);
  }, [isOpen, updateDropdownPosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Don't render if no active session
  if (!session) {
    return null;
  }

  const handleToggleFavorite = async (singerId: number) => {
    const existingFavorite = singerFavorites.get(singerId);
    try {
      if (existingFavorite) {
        // Remove from favorites
        await removeFavorite(singerId, video.id);
        setSingerFavorites((prev) => {
          const newMap = new Map(prev);
          newMap.set(singerId, null);
          return newMap;
        });
      } else {
        // Add to favorites
        await addFavorite(singerId, videoToFavoriteVideo(video));
        // Reload to get the new favorite object
        const favorites = await favoritesService.getSingerFavorites(singerId);
        const newFavorite = favorites.find((f) => f.video.video_id === video.id);
        setSingerFavorites((prev) => {
          const newMap = new Map(prev);
          newMap.set(singerId, newFavorite || null);
          return newMap;
        });
      }
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  };

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[200px] flex flex-col"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        transform: dropdownPosition.openAbove
          ? "translateY(-100%)"
          : "translateY(0)",
        maxHeight: `${dropdownPosition.maxHeight}px`,
        zIndex: 9999,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-gray-700">
        <span className="text-xs text-gray-400 uppercase tracking-wide">
          {isFavorite ? "Manage favorites" : "Add to favorites"}
        </span>
      </div>
      {persistentSingers.length > 0 ? (
        <div className="py-1 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-gray-400">Loading...</div>
          ) : (
            persistentSingers.map((singer) => {
              const hasFavorite = singerFavorites.get(singer.id) !== null && singerFavorites.get(singer.id) !== undefined;
              return (
                <button
                  key={singer.id}
                  onClick={() => handleToggleFavorite(singer.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 transition-colors ${
                    hasFavorite ? "bg-yellow-900/20" : ""
                  }`}
                >
                  <SingerAvatar name={singer.name} color={singer.color} size="sm" />
                  <span className="text-sm text-gray-200 flex-1 text-left truncate">
                    {singer.name}
                    {singer.unique_name && (
                      <span className="text-gray-400 ml-1">
                        ({singer.unique_name})
                      </span>
                    )}
                  </span>
                  {hasFavorite && (
                    <Check size={16} className="text-yellow-500" />
                  )}
                </button>
              );
            })
          )}
        </div>
      ) : (
        <div className="px-3 py-4 text-sm text-gray-400 text-center">
          No persistent singers.
          <br />
          <span className="text-xs">
            Create a persistent singer first.
          </span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div
      className={`relative ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`w-8 h-8 flex items-center justify-center rounded text-lg transition-colors ${
          isFavorite
            ? "text-yellow-500 hover:text-yellow-400"
            : "text-gray-400 hover:text-yellow-400"
        }`}
        title={isFavorite ? "Manage favorites" : "Add to favorites"}
      >
        <Star size={18} className={isFavorite ? "fill-yellow-500" : ""} />
      </button>
      {createPortal(dropdown, document.body)}
    </div>
  );
}

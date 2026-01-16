import { useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { QueueItem } from "../../stores/queueStore";
import { useSessionStore, usePlayerStore, useSettingsStore, SETTINGS_KEYS } from "../../stores";
import { SingerAvatar, SingerPicker } from "../singers";

interface DraggableQueueItemProps {
  item: QueueItem;
  index: number;
  onPlay: () => void;
  onRemove: () => void;
  formatDuration: (seconds?: number) => string;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function DraggableQueueItem({
  item,
  index,
  onPlay,
  onRemove,
  formatDuration,
  isSelected = false,
  onSelect,
}: DraggableQueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const { session, getQueueItemSingerIds, getSingerById, loadQueueItemSingers } =
    useSessionStore();

  // Check if video is non-embeddable (only relevant in YouTube mode)
  const playbackMode = useSettingsStore((s) => s.getSetting(SETTINGS_KEYS.PLAYBACK_MODE));
  const nonEmbeddableIds = usePlayerStore((s) => s.nonEmbeddableVideoIds);
  const isNonEmbeddable =
    playbackMode === "youtube" &&
    !!item.video.youtubeId &&
    nonEmbeddableIds.has(item.video.youtubeId);

  const assignedSingerIds = getQueueItemSingerIds(item.id);
  const assignedSingers = assignedSingerIds
    .map((id) => getSingerById(id))
    .filter(Boolean);

  // Load singer assignments when component mounts
  useEffect(() => {
    if (session) {
      loadQueueItemSingers(item.id);
    }
  }, [item.id, session, loadQueueItemSingers]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isNonEmbeddable ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid="queue-item"
      onClick={(e) => {
        // Only handle click if not clicking on a button
        if (!(e.target as HTMLElement).closest("button")) {
          onSelect?.();
        }
      }}
      className={`flex gap-2 p-2 rounded transition-colors cursor-grab active:cursor-grabbing touch-none ${
        isNonEmbeddable
          ? "bg-gray-800 border border-gray-600"
          : isDragging
          ? "bg-gray-700 shadow-lg ring-2 ring-blue-500"
          : isSelected
          ? "bg-gray-600 ring-2 ring-blue-500"
          : "bg-gray-700 hover:bg-gray-600"
      }`}
      title={isNonEmbeddable ? "This video doesn't allow embedding" : undefined}
    >
      {/* Index number */}
      <span className={`w-6 flex items-center justify-center ${isNonEmbeddable ? "text-gray-500" : "text-gray-400"}`}>
        {index + 1}.
      </span>

      {/* Video info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm truncate flex-1 ${isNonEmbeddable ? "text-gray-500 line-through" : ""}`}>
            {item.video.title}
          </p>
          {/* Non-embeddable warning icon */}
          {isNonEmbeddable && (
            <span
              className="text-yellow-500 text-xs flex-shrink-0"
              title="Embedding disabled by video owner"
            >
              ⚠
            </span>
          )}
          {/* Assigned singers avatars */}
          {assignedSingers.length > 0 && (
            <div className="flex -space-x-1">
              {assignedSingers.slice(0, 3).map((singer) => (
                <SingerAvatar
                  key={singer!.id}
                  name={singer!.name}
                  color={singer!.color}
                  size="sm"
                  className="ring-1 ring-gray-700"
                />
              ))}
              {assignedSingers.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs text-gray-300 ring-1 ring-gray-700">
                  +{assignedSingers.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
        <p className={`text-xs truncate ${isNonEmbeddable ? "text-gray-500" : "text-gray-400"}`}>
          {item.video.artist}
          {item.video.duration && ` • ${formatDuration(item.video.duration)}`}
        </p>
      </div>

      {/* Singer picker (only when session active) */}
      {session && <SingerPicker queueItemId={item.id} />}

      {/* Play button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!isNonEmbeddable) {
            onPlay();
          }
        }}
        className={`text-sm px-1 ${
          isNonEmbeddable
            ? "text-gray-600 cursor-not-allowed"
            : "text-gray-400 hover:text-green-400"
        }`}
        aria-label={isNonEmbeddable ? "Cannot play - embedding disabled" : "Play now"}
        title={isNonEmbeddable ? "Cannot play - embedding disabled" : "Play now"}
        disabled={isNonEmbeddable}
      >
        ▶
      </button>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-gray-400 hover:text-red-400 text-sm px-1"
        title="Remove from queue"
      >
        ✕
      </button>
    </div>
  );
}

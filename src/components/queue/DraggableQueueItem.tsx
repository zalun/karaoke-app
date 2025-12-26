import { useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { QueueItem } from "../../stores/queueStore";
import { useSessionStore } from "../../stores";
import { SingerAvatar, SingerPicker } from "../singers";

interface DraggableQueueItemProps {
  item: QueueItem;
  index: number;
  onPlay: () => void;
  onRemove: () => void;
  formatDuration: (seconds?: number) => string;
}

export function DraggableQueueItem({
  item,
  index,
  onPlay,
  onRemove,
  formatDuration,
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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onPlay}
      className={`flex gap-2 p-2 rounded transition-colors bg-gray-700 cursor-grab active:cursor-grabbing touch-none ${
        isDragging ? "shadow-lg ring-2 ring-blue-500" : "hover:bg-gray-600"
      }`}
    >
      {/* Index number */}
      <span className="text-gray-400 w-6 flex items-center justify-center">
        {index + 1}.
      </span>

      {/* Video info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm truncate flex-1">{item.video.title}</p>
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
        <p className="text-xs text-gray-400 truncate">
          {item.video.artist}
          {item.video.duration && ` • ${formatDuration(item.video.duration)}`}
        </p>
      </div>

      {/* Singer picker (only when session active) */}
      {session && <SingerPicker queueItemId={item.id} />}

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

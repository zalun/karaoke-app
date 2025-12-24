import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { QueueItem } from "../../stores/queueStore";

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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex gap-2 p-2 rounded transition-colors bg-gray-700 ${
        isDragging ? "shadow-lg ring-2 ring-blue-500" : "hover:bg-gray-600"
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing px-1 touch-none"
        title="Drag to reorder"
      >
        ⋮⋮
      </button>

      {/* Index number */}
      <span className="text-gray-400 w-6 flex items-center justify-center">
        {index + 1}.
      </span>

      {/* Video info - clickable to play */}
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={onPlay}
      >
        <p className="text-sm truncate">{item.video.title}</p>
        <p className="text-xs text-gray-400 truncate">
          {item.video.artist}
          {item.video.duration && ` • ${formatDuration(item.video.duration)}`}
        </p>
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-gray-400 hover:text-red-400 text-sm"
        title="Remove from queue"
      >
        ✕
      </button>
    </div>
  );
}

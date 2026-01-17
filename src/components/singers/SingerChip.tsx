import { X } from "lucide-react";
import { SingerAvatar } from "./SingerAvatar";

interface SingerChipProps {
  name: string;
  color: string;
  onRemove?: () => void;
  size?: "sm" | "md";
  faded?: boolean;
  className?: string;
}

export function SingerChip({
  name,
  color,
  onRemove,
  size = "md",
  faded = false,
  className = "",
}: SingerChipProps) {
  const isSmall = size === "sm";

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full bg-gray-800 border border-gray-700 ${
        isSmall ? "px-1.5 py-0.5" : "px-2 py-1"
      } ${faded ? "opacity-50" : ""} ${className}`}
    >
      <SingerAvatar name={name} color={color} size="sm" />
      <span className={`text-gray-200 ${isSmall ? "text-xs" : "text-sm"}`}>
        {name}
      </span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-gray-400 hover:text-gray-200 transition-colors ml-0.5"
          aria-label={`Remove ${name}`}
        >
          <X size={isSmall ? 12 : 14} />
        </button>
      )}
    </div>
  );
}

import { SingerAvatar } from "../singers";
import type { Singer } from "../../services";

// Thresholds for overlay visibility
export const OVERLAY_SHOW_THRESHOLD_SECONDS = 20;
export const COUNTDOWN_START_THRESHOLD_SECONDS = 10;

interface NextSongOverlayProps {
  title: string;
  artist?: string;
  // Seconds remaining, shown when <= 10 and > 0 (0 is hidden to avoid flicker before song change)
  countdown?: number;
  // Singers assigned to the next song
  singers?: Singer[];
}

export function NextSongOverlay({ title, artist, countdown, singers }: NextSongOverlayProps) {
  return (
    <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm text-white px-4 py-3 rounded-lg max-w-xs pointer-events-none">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-1">Up next</p>
          <p className="text-sm font-medium truncate">{title}</p>
          {artist && <p className="text-xs text-gray-300 truncate">{artist}</p>}
          {/* Show assigned singers */}
          {singers && singers.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <div className="flex -space-x-1">
                {singers.slice(0, 4).map((singer) => (
                  <SingerAvatar
                    key={singer.id}
                    name={singer.name}
                    color={singer.color}
                    size="sm"
                    className="ring-1 ring-black/50"
                  />
                ))}
              </div>
              <span className="text-xs text-gray-300">
                {singers.map((s) => s.name).join(", ")}
              </span>
            </div>
          )}
        </div>
        {countdown !== undefined && countdown > 0 && countdown <= 10 && (
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
            <span className="text-lg font-bold">{countdown}</span>
          </div>
        )}
      </div>
    </div>
  );
}

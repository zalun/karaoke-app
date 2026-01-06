import { SingerAvatar } from "../singers";
import { Z_INDEX_SINGER_OVERLAY } from "../../styles/zIndex";

export interface SingerDisplayInfo {
  id: number;
  name: string;
  color: string;
}

interface SingerOverlayDisplayProps {
  singers: SingerDisplayInfo[];
}

/**
 * Shared overlay display for showing singer avatars and names.
 * Used by CurrentSingerOverlay (main window) and DetachedPlayer.
 */
export function SingerOverlayDisplay({ singers }: SingerOverlayDisplayProps) {
  if (singers.length === 0) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: Z_INDEX_SINGER_OVERLAY }}>
      <div className="bg-black/70 backdrop-blur-sm text-white px-6 py-4 rounded-xl animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          {/* Singer avatars */}
          <div className="flex -space-x-2">
            {singers.map((singer) => (
              <SingerAvatar
                key={singer.id}
                name={singer.name}
                color={singer.color}
                size="lg"
                className="ring-2 ring-black/50"
              />
            ))}
          </div>
          {/* Singer names */}
          <p className="text-lg font-medium">
            {singers.map((s) => s.name).join(" & ")}
          </p>
        </div>
      </div>
    </div>
  );
}

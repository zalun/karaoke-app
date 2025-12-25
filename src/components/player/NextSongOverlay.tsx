interface NextSongOverlayProps {
  title: string;
  artist?: string;
  countdown?: number; // Seconds remaining, shown when <= 10
}

export function NextSongOverlay({ title, artist, countdown }: NextSongOverlayProps) {
  return (
    <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm text-white px-4 py-3 rounded-lg max-w-xs pointer-events-none">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-1">Up next</p>
          <p className="text-sm font-medium truncate">{title}</p>
          {artist && <p className="text-xs text-gray-300 truncate">{artist}</p>}
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

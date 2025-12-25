interface NextSongOverlayProps {
  title: string;
  artist?: string;
}

export function NextSongOverlay({ title, artist }: NextSongOverlayProps) {
  return (
    <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-sm text-white px-3 py-2 rounded-lg max-w-xs pointer-events-none">
      <p className="text-xs text-gray-400">Up next</p>
      <p className="text-sm font-medium truncate">{title}</p>
      {artist && <p className="text-xs text-gray-300 truncate">{artist}</p>}
    </div>
  );
}

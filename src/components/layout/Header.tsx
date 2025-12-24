import { usePlayerStore } from "../../stores";

export function Header() {
  const { currentVideo, isPlaying } = usePlayerStore();

  return (
    <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4">
      <div className="flex-1">
        {currentVideo ? (
          <div className="flex items-center gap-3">
            <span className="text-lg">{isPlaying ? "▶" : "⏸"}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{currentVideo.title}</p>
              <p className="text-xs text-gray-400 truncate">{currentVideo.artist}</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-400">No video playing</p>
        )}
      </div>
    </header>
  );
}

import { useState, useCallback } from "react";
import { Globe, HardDrive } from "lucide-react";
import { useAppStore, useLibraryStore } from "../../stores";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [inputValue, setInputValue] = useState("");
  const [addKaraoke, setAddKaraoke] = useState(true);
  const { setSearchQuery } = useAppStore();
  const { searchMode, setSearchMode } = useLibraryStore();

  const isLocalMode = searchMode === "local";

  const getSearchQuery = useCallback(() => {
    const query = inputValue.trim();
    if (!query) return "";
    // Only append "karaoke" in Web mode if checkbox is checked
    if (!isLocalMode && addKaraoke && !query.toLowerCase().includes("karaoke")) {
      return `${query} karaoke`;
    }
    return query;
  }, [inputValue, addKaraoke, isLocalMode]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const query = getSearchQuery();
      if (query) {
        setSearchQuery(query);
        onSearch(query);
      }
    },
    [getSearchQuery, onSearch, setSearchQuery]
  );

  const toggleMode = useCallback(() => {
    const newMode = isLocalMode ? "youtube" : "local";
    setSearchMode(newMode);
    // Clear input when switching modes
    setInputValue("");
  }, [isLocalMode, setSearchMode]);

  return (
    <form onSubmit={handleSubmit} className="relative flex gap-2">
      <div className="flex-1 relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={isLocalMode ? "Search local files..." : "Search YouTube for videos..."}
          className={`w-full px-4 py-3 bg-gray-700 border rounded-lg focus:outline-none text-white placeholder-gray-400 ${
            isLocalMode
              ? "border-green-600/50 focus:border-green-500 pr-24"
              : "border-gray-600 focus:border-blue-500 pr-44"
          }`}
          disabled={isLoading}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
          {/* Only show +karaoke button in Web mode */}
          {!isLocalMode && (
            <button
              type="button"
              onClick={() => setAddKaraoke(!addKaraoke)}
              className={`px-4 py-1.5 rounded-md transition-colors text-sm ${
                addKaraoke
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-gray-600 hover:bg-gray-500 text-gray-300"
              }`}
            >
              +"karaoke"
            </button>
          )}
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className={`px-4 py-1.5 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md transition-colors text-sm ${
              isLocalMode
                ? "bg-green-600 hover:bg-green-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isLoading ? "..." : "Search"}
          </button>
        </div>
      </div>

      {/* Mode toggle - to the right of search */}
      <button
        type="button"
        onClick={toggleMode}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors flex-shrink-0"
        aria-label={`Switch to ${isLocalMode ? "Web" : "Local"} search`}
      >
        <Globe size={16} className={!isLocalMode ? "text-blue-400" : "text-gray-400"} />
        <div className="relative w-10 h-5 bg-gray-600 rounded-full">
          <div
            className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
              isLocalMode
                ? "left-5 bg-green-500"
                : "left-0.5 bg-blue-500"
            }`}
          />
        </div>
        <HardDrive size={16} className={isLocalMode ? "text-green-400" : "text-gray-400"} />
      </button>
    </form>
  );
}

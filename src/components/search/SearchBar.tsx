import { useState, useCallback } from "react";
import { useAppStore } from "../../stores";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [inputValue, setInputValue] = useState("");
  const [addKaraoke, setAddKaraoke] = useState(true);
  const { setSearchQuery } = useAppStore();

  const getSearchQuery = useCallback(() => {
    const query = inputValue.trim();
    if (!query) return "";
    // Append "karaoke" if checkbox is checked and query doesn't already contain it
    if (addKaraoke && !query.toLowerCase().includes("karaoke")) {
      return `${query} karaoke`;
    }
    return query;
  }, [inputValue, addKaraoke]);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        const query = getSearchQuery();
        if (query) {
          setSearchQuery(query);
          onSearch(query);
        }
      }
    },
    [getSearchQuery, onSearch, setSearchQuery]
  );

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search YouTube for videos..."
          className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white placeholder-gray-400 pr-24"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md transition-colors text-sm"
        >
          {isLoading ? "..." : "Search"}
        </button>
      </form>
      <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={addKaraoke}
          onChange={(e) => setAddKaraoke(e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
        />
        <span>Add &quot;karaoke&quot; to search</span>
      </label>
    </div>
  );
}

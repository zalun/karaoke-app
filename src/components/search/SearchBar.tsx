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
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search YouTube for videos..."
        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white placeholder-gray-400 pr-44"
        disabled={isLoading}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
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
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md transition-colors text-sm"
        >
          {isLoading ? "..." : "Search"}
        </button>
      </div>
    </form>
  );
}

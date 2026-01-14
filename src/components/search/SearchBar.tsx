import { useState, useCallback, useRef, useEffect } from "react";
import { Globe, HardDrive } from "lucide-react";
import { useAppStore, useLibraryStore, useSearchHistoryStore } from "../../stores";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [inputValue, setInputValue] = useState("");
  const [addKaraoke, setAddKaraoke] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { setSearchQuery } = useAppStore();
  const { searchMode, setSearchMode } = useLibraryStore();
  const { suggestions, getSuggestions, filterSuggestions, recordSearch } =
    useSearchHistoryStore();

  const isLocalMode = searchMode === "local";
  const searchType = isLocalMode ? "local" : "youtube";

  // Filter suggestions based on current input
  const filteredSuggestions = filterSuggestions(inputValue);

  // Get top match for ghost text
  const topMatch =
    filteredSuggestions.length > 0 && inputValue.trim()
      ? filteredSuggestions[0]
      : null;

  // Calculate ghost text (portion after current input)
  const ghostText =
    topMatch &&
    inputValue.trim() &&
    topMatch.toLowerCase().startsWith(inputValue.toLowerCase())
      ? topMatch.slice(inputValue.length)
      : null;

  // Load suggestions when search mode changes or on mount
  useEffect(() => {
    getSuggestions(searchType);
  }, [searchType, getSuggestions]);

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
    async (e: React.FormEvent) => {
      e.preventDefault();
      const query = getSearchQuery();
      if (query) {
        setSearchQuery(query);
        onSearch(query);
        // Record the search (use raw input, not modified query)
        await recordSearch(searchType, inputValue.trim());
        setShowDropdown(false);
        setSelectedIndex(-1);
      }
    },
    [getSearchQuery, onSearch, setSearchQuery, recordSearch, searchType, inputValue]
  );

  const handleSelectSuggestion = useCallback(
    async (suggestion: string) => {
      setInputValue(suggestion);
      setShowDropdown(false);
      setSelectedIndex(-1);

      // Submit with the selected suggestion
      const query =
        isLocalMode ||
        !addKaraoke ||
        suggestion.toLowerCase().includes("karaoke")
          ? suggestion
          : `${suggestion} karaoke`;

      setSearchQuery(query);
      onSearch(query);
      await recordSearch(searchType, suggestion);
    },
    [isLocalMode, addKaraoke, setSearchQuery, onSearch, recordSearch, searchType]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown || filteredSuggestions.length === 0) {
        // Accept ghost text with Tab or Right arrow
        if ((e.key === "Tab" || e.key === "ArrowRight") && ghostText && topMatch) {
          e.preventDefault();
          setInputValue(topMatch);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredSuggestions.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case "Enter":
          if (selectedIndex >= 0) {
            e.preventDefault();
            handleSelectSuggestion(filteredSuggestions[selectedIndex]);
          }
          break;
        case "Escape":
          setShowDropdown(false);
          setSelectedIndex(-1);
          break;
        case "Tab":
          if (ghostText && topMatch) {
            e.preventDefault();
            setInputValue(topMatch);
          }
          break;
      }
    },
    [
      showDropdown,
      filteredSuggestions,
      selectedIndex,
      handleSelectSuggestion,
      ghostText,
      topMatch,
    ]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      setSelectedIndex(-1);
      if (e.target.value.trim()) {
        setShowDropdown(true);
      }
    },
    []
  );

  const handleFocus = useCallback(() => {
    if (suggestions.length > 0 || inputValue.trim()) {
      setShowDropdown(true);
    }
    getSuggestions(searchType);
  }, [suggestions, inputValue, getSuggestions, searchType]);

  const handleBlur = useCallback(() => {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setShowDropdown(false);
        setSelectedIndex(-1);
      }
    }, 150);
  }, []);

  const toggleMode = useCallback(() => {
    const newMode = isLocalMode ? "youtube" : "local";
    setSearchMode(newMode);
    // Clear input when switching modes
    setInputValue("");
    setShowDropdown(false);
  }, [isLocalMode, setSearchMode]);

  return (
    <form onSubmit={handleSubmit} className="relative flex gap-2">
      <div className="flex-1 relative">
        {/* Ghost text layer */}
        {ghostText && (
          <div
            className="absolute inset-0 px-4 py-3 pointer-events-none flex items-center overflow-hidden"
            aria-hidden="true"
          >
            <span className="invisible whitespace-pre">{inputValue}</span>
            <span className="text-gray-500 whitespace-pre">{ghostText}</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={
            isLocalMode ? "Search local files..." : "Search YouTube for videos..."
          }
          className={`w-full px-4 py-3 bg-gray-700 border rounded-lg focus:outline-none text-white placeholder-gray-400 ${
            isLocalMode
              ? "border-green-600/50 focus:border-green-500 pr-24"
              : "border-gray-600 focus:border-blue-500 pr-44"
          }`}
          disabled={isLoading}
          autoComplete="off"
        />

        {/* Dropdown */}
        {showDropdown && filteredSuggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto"
          >
            {filteredSuggestions.slice(0, 10).map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSelectSuggestion(suggestion)}
                className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                  index === selectedIndex
                    ? "bg-gray-700 text-white"
                    : "text-gray-300 hover:bg-gray-700/50"
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

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
        <Globe
          size={16}
          className={!isLocalMode ? "text-blue-400" : "text-gray-400"}
        />
        <div className="relative w-10 h-5 bg-gray-600 rounded-full">
          <div
            className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
              isLocalMode ? "left-5 bg-green-500" : "left-0.5 bg-blue-500"
            }`}
          />
        </div>
        <HardDrive
          size={16}
          className={isLocalMode ? "text-green-400" : "text-gray-400"}
        />
      </button>
    </form>
  );
}

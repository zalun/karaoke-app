export function Header() {
  return (
    <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4">
      <div className="flex-1">
        <input
          type="text"
          placeholder="Search YouTube..."
          className="w-full max-w-md px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white placeholder-gray-400"
        />
      </div>
      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
          Settings
        </button>
      </div>
    </header>
  );
}

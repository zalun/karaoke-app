interface NavItem {
  id: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { id: "search", label: "Search", icon: "🔍" },
  { id: "queue", label: "Queue", icon: "📋" },
  { id: "library", label: "Library", icon: "📚" },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">HomeKaraoke</h1>
      </div>
      <nav className="flex-1 p-2">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.id}>
              <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors text-left">
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="p-4 border-t border-gray-700 text-sm text-gray-400">
        <p>v0.1.0</p>
      </div>
    </aside>
  );
}

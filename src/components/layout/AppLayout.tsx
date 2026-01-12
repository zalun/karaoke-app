import { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      {/* Top spacing for macOS traffic lights - also draggable */}
      <div data-tauri-drag-region className="h-8 shrink-0" />
      {/* Main content - data-tauri-drag-region makes padding areas draggable */}
      <div data-tauri-drag-region className="flex-1 min-h-0 p-4 pt-0">
        {children}
      </div>
    </div>
  );
}

import { ReactNode, useMemo } from "react";
import { platform } from "@tauri-apps/plugin-os";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  // Only show top spacing on macOS for traffic lights
  const isMacOS = useMemo(() => {
    try {
      return platform() === "macos";
    } catch {
      return false;
    }
  }, []);

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      {/* Top spacing for macOS traffic lights - also draggable */}
      {isMacOS && <div data-tauri-drag-region className="h-4 shrink-0" />}
      {/* Main content - data-tauri-drag-region makes padding areas draggable */}
      <div data-tauri-drag-region className="flex-1 min-h-0 p-4">
        {children}
      </div>
    </div>
  );
}

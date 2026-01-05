import { X, AlertTriangle } from "lucide-react";

interface MissingFileDialogProps {
  filePath: string | null;
  onClose: () => void;
  onRemoveFromQueue?: () => void;
}

export function MissingFileDialog({
  filePath,
  onClose,
  onRemoveFromQueue,
}: MissingFileDialogProps) {
  if (!filePath) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-700">
          <AlertTriangle className="text-yellow-500" size={24} />
          <h2 className="text-lg font-semibold flex-1">File Not Found</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-gray-300">The video file could not be found at:</p>

          <div className="bg-gray-900 rounded p-3 font-mono text-sm text-gray-400 break-all">
            {filePath}
          </div>

          <p className="text-gray-400 text-sm">
            The file may have been moved, deleted, or the drive disconnected.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
          {onRemoveFromQueue && (
            <button
              onClick={() => {
                onRemoveFromQueue();
                onClose();
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
            >
              Remove from Queue
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

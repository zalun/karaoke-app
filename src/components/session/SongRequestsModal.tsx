import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { X, Check, XIcon, Loader2 } from "lucide-react";
import { useSessionStore } from "../../stores";
import type { GroupedRequests } from "../../types";

/**
 * Get all focusable elements within a container
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));
}

/**
 * Format duration in seconds to mm:ss format
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Validate thumbnail URL to prevent XSS attacks.
 * Only allows HTTPS URLs to prevent javascript: and other dangerous protocols.
 */
function isValidThumbnailUrl(url: string | undefined | null): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function SongRequestsModal() {
  const {
    showRequestsModal,
    closeRequestsModal,
    pendingRequests,
    isLoadingRequests,
    approveRequest,
    rejectRequest,
    approveAllRequests,
    processingRequestIds,
  } = useSessionStore();

  // Track image load errors by request ID
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // Refs for focus management
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  // Handle keyboard events for Escape key and focus trapping
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeRequestsModal();
      return;
    }

    // Focus trapping with Tab key
    if (event.key === 'Tab' && modalRef.current) {
      const focusableElements = getFocusableElements(modalRef.current);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        // Shift+Tab: if on first element, wrap to last
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }
  }, [closeRequestsModal]);

  // Focus management: save previous element, focus modal, restore on close
  useEffect(() => {
    if (showRequestsModal) {
      // Save the currently focused element
      previouslyFocusedElement.current = document.activeElement as HTMLElement;

      // Focus the modal container after a brief delay to ensure it's rendered
      const timer = setTimeout(() => {
        if (modalRef.current) {
          const focusableElements = getFocusableElements(modalRef.current);
          if (focusableElements.length > 0) {
            focusableElements[0].focus();
          } else {
            modalRef.current.focus();
          }
        }
      }, 0);

      // Add keyboard event listener
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        clearTimeout(timer);
        document.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      // Restore focus to previously focused element when modal closes
      if (previouslyFocusedElement.current && previouslyFocusedElement.current.focus) {
        previouslyFocusedElement.current.focus();
        previouslyFocusedElement.current = null;
      }
    }
  }, [showRequestsModal, handleKeyDown]);

  const handleImageError = (requestId: string) => {
    setImageErrors((prev) => new Set(prev).add(requestId));
  };

  // Group requests by guest name
  const groupedRequests: GroupedRequests[] = useMemo(() => {
    const groups = new Map<string, GroupedRequests>();
    for (const request of pendingRequests) {
      const guestName = request.guest_name;
      if (!groups.has(guestName)) {
        groups.set(guestName, { guestName, requests: [] });
      }
      groups.get(guestName)!.requests.push(request);
    }
    return Array.from(groups.values());
  }, [pendingRequests]);

  if (!showRequestsModal) {
    return null;
  }

  const handleApprove = async (requestId: string) => {
    try {
      await approveRequest(requestId);
    } catch {
      // Error is logged and notified in the store
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await rejectRequest(requestId);
    } catch {
      // Error is logged and notified in the store
    }
  };

  const handleApproveAllForGuest = async (guestName: string) => {
    try {
      await approveAllRequests(guestName);
    } catch {
      // Error is logged and notified in the store
    }
  };

  const handleApproveAll = async () => {
    try {
      await approveAllRequests();
    } catch {
      // Error is logged and notified in the store
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-tauri-drag-region
      onClick={(e) => {
        // Close modal when clicking the backdrop (not the modal content)
        if (e.target === e.currentTarget) {
          closeRequestsModal();
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-requests-modal-title"
        tabIndex={-1}
        className="bg-gray-800 rounded-lg p-6 w-[500px] max-h-[80vh] flex flex-col shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 id="song-requests-modal-title" className="text-lg font-medium text-white">Song Requests</h3>
          <button
            onClick={closeRequestsModal}
            className="text-gray-400 hover:text-white transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoadingRequests ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-gray-400" />
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No pending song requests
            </div>
          ) : (
            <div className="space-y-4">
              {groupedRequests.map((group) => (
                <div key={group.guestName} className="bg-gray-900/50 rounded-lg p-4">
                  {/* Guest header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-300">
                      {group.guestName}
                    </span>
                    <button
                      onClick={() => handleApproveAllForGuest(group.guestName)}
                      disabled={isLoadingRequests}
                      className="text-xs px-2 py-1 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded transition-colors disabled:opacity-50"
                    >
                      Approve All
                    </button>
                  </div>

                  {/* Request items */}
                  <div className="space-y-2">
                    {group.requests.map((request) => (
                      <div
                        key={request.id}
                        className="flex items-center gap-3 p-2 bg-gray-800 rounded"
                      >
                        {/* Thumbnail */}
                        {isValidThumbnailUrl(request.thumbnail_url) &&
                        !imageErrors.has(request.id) ? (
                          <img
                            src={request.thumbnail_url}
                            alt=""
                            className="w-12 h-9 object-cover rounded flex-shrink-0"
                            onError={() => handleImageError(request.id)}
                          />
                        ) : (
                          <div className="w-12 h-9 bg-gray-700 rounded flex-shrink-0" />
                        )}

                        {/* Song info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{request.title}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            {request.artist && (
                              <span className="truncate">{request.artist}</span>
                            )}
                            {request.duration !== undefined && (
                              <span>{formatDuration(request.duration)}</span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleApprove(request.id)}
                            disabled={isLoadingRequests || processingRequestIds.has(request.id)}
                            className="p-1.5 text-green-400 hover:text-green-300 hover:bg-green-400/10 rounded transition-colors disabled:opacity-50"
                            title="Approve"
                            aria-label="Approve request"
                          >
                            {processingRequestIds.has(request.id) ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Check size={16} />
                            )}
                          </button>
                          <button
                            onClick={() => handleReject(request.id)}
                            disabled={isLoadingRequests || processingRequestIds.has(request.id)}
                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors disabled:opacity-50"
                            title="Reject"
                            aria-label="Reject request"
                          >
                            {processingRequestIds.has(request.id) ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <XIcon size={16} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with global Approve All button */}
        {pendingRequests.length > 0 && !isLoadingRequests && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <button
              onClick={handleApproveAll}
              disabled={isLoadingRequests}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded transition-colors"
            >
              <Check size={16} />
              Approve All ({pendingRequests.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

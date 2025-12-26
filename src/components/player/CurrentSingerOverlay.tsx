import { useEffect, useState, useMemo } from "react";
import { useQueueStore, useSessionStore } from "../../stores";
import { SingerAvatar } from "../singers";

export const CURRENT_SINGER_OVERLAY_DURATION_MS = 5000;

/**
 * Shows current singer(s) for 5 seconds when video starts.
 * Use with a `key` prop to trigger on video change: <CurrentSingerOverlay key={videoId} />
 */
export function CurrentSingerOverlay() {
  const [visible, setVisible] = useState(true);

  const { session, singers, queueSingerAssignments, getQueueItemSingerIds, getSingerById, loadQueueItemSingers } =
    useSessionStore();
  const getCurrentItem = useQueueStore((state) => state.getCurrentItem);

  const currentItem = getCurrentItem();
  const currentItemId = currentItem?.id;

  // Load singers for current item when it changes
  useEffect(() => {
    if (session && currentItemId) {
      loadQueueItemSingers(currentItemId);
    }
  }, [session, currentItemId, loadQueueItemSingers]);

  // Get singers for current item
  // Note: queueSingerAssignments and singers are included to trigger re-render when assignments change
  const currentSingers = useMemo(() => {
    if (!session || !currentItemId) return [];
    const singerIds = getQueueItemSingerIds(currentItemId);
    return singerIds
      .map((id) => getSingerById(id))
      .filter(Boolean) as NonNullable<ReturnType<typeof getSingerById>>[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, currentItemId, queueSingerAssignments.size, singers.length]);

  // Hide overlay after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, CURRENT_SINGER_OVERLAY_DURATION_MS);

    return () => clearTimeout(timer);
  }, []);

  // Don't render if no session, no singers, or not visible
  if (!visible || !session || currentSingers.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="bg-black/70 backdrop-blur-sm text-white px-6 py-4 rounded-xl animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          {/* Singer avatars */}
          <div className="flex -space-x-2">
            {currentSingers.map((singer) => (
              <SingerAvatar
                key={singer.id}
                name={singer.name}
                color={singer.color}
                size="lg"
                className="ring-2 ring-black/50"
              />
            ))}
          </div>
          {/* Singer names */}
          <p className="text-lg font-medium">
            {currentSingers.map((s) => s.name).join(" & ")}
          </p>
        </div>
      </div>
    </div>
  );
}

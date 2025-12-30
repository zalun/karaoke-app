import { useEffect } from "react";
import { checkForUpdate } from "../stores/updateStore";

/**
 * Hook to check for updates on app startup.
 * The check is non-blocking and runs after a short delay to avoid
 * impacting initial render performance.
 */
export function useUpdateCheck() {
  useEffect(() => {
    // Delay the check slightly to not impact startup performance
    const timer = setTimeout(() => {
      checkForUpdate();
    }, 3000); // 3 second delay

    return () => clearTimeout(timer);
  }, []);
}

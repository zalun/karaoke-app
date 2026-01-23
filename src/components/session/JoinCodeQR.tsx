import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

// Timeout for QR code loading (10 seconds)
const QR_LOAD_TIMEOUT_MS = 10 * 1000;

interface JoinCodeQRProps {
  url: string;
  size?: number;
}

export function JoinCodeQR({ url, size = 200 }: JoinCodeQRProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Set timeout for loading
  useEffect(() => {
    if (!isLoading) return;

    const timeout = setTimeout(() => {
      if (isLoading) {
        setIsLoading(false);
        setHasError(true);
      }
    }, QR_LOAD_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [isLoading, url]);

  // Reset state when URL changes
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [url]);

  return (
    <div
      className="relative bg-white rounded-lg flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-white rounded-lg">
          <Loader2 size={32} className="animate-spin text-gray-400" />
        </div>
      )}
      {hasError ? (
        <div className="text-gray-500 text-sm text-center p-4">
          Failed to load QR code
        </div>
      ) : (
        <img
          src={url}
          alt="Scan to join"
          width={size}
          height={size}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          className={`rounded-lg ${isLoading ? "opacity-0" : "opacity-100"}`}
        />
      )}
    </div>
  );
}

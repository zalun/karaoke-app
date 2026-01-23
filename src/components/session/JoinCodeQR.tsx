import { useState } from "react";
import { Loader2 } from "lucide-react";

interface JoinCodeQRProps {
  url: string;
  size?: number;
}

export function JoinCodeQR({ url, size = 200 }: JoinCodeQRProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

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

import { useState } from "react";
import { X, Copy, Check, StopCircle, Users, Clock } from "lucide-react";
import { useSessionStore } from "../../stores";
import { JoinCodeQR } from "./JoinCodeQR";

export function HostSessionModal() {
  const { hostedSession, showHostModal, closeHostModal, stopHosting } = useSessionStore();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isStoppingHost, setIsStoppingHost] = useState(false);

  if (!showHostModal || !hostedSession) {
    return null;
  }

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(hostedSession.sessionCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(hostedSession.joinUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleStopHosting = async () => {
    setIsStoppingHost(true);
    try {
      await stopHosting();
      closeHostModal();
    } catch {
      // Error is logged in the store
    } finally {
      setIsStoppingHost(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-tauri-drag-region
    >
      <div className="bg-gray-800 rounded-lg p-6 w-[400px] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-white">Session Hosted</h3>
          <button
            onClick={closeHostModal}
            className="text-gray-400 hover:text-white transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Join Code - Large Display */}
        <div className="text-center mb-6">
          <p className="text-sm text-gray-400 mb-2">Join Code</p>
          <p className="text-4xl font-bold font-mono text-white tracking-wider">
            {hostedSession.sessionCode}
          </p>
        </div>

        {/* QR Code */}
        <div className="flex justify-center mb-6">
          <JoinCodeQR url={hostedSession.qrCodeUrl} size={200} />
        </div>

        {/* Join URL */}
        <div className="text-center mb-6">
          <p className="text-sm text-gray-400 break-all">{hostedSession.joinUrl}</p>
        </div>

        {/* Copy Buttons */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleCopyCode}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            {copiedCode ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            {copiedCode ? "Copied!" : "Copy Code"}
          </button>
          <button
            onClick={handleCopyLink}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            {copiedLink ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            {copiedLink ? "Copied!" : "Copy Link"}
          </button>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-6 mb-6 py-3 bg-gray-900/50 rounded">
          <div className="flex items-center gap-2 text-gray-300">
            <Users size={16} />
            <span className="text-sm">
              {hostedSession.stats.totalGuests} {hostedSession.stats.totalGuests === 1 ? "guest" : "guests"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <Clock size={16} />
            <span className="text-sm">
              {hostedSession.stats.pendingRequests} pending
            </span>
          </div>
        </div>

        {/* Stop Hosting Button */}
        <button
          onClick={handleStopHosting}
          disabled={isStoppingHost}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded transition-colors"
        >
          <StopCircle size={16} />
          {isStoppingHost ? "Stopping..." : "Stop Hosting"}
        </button>
      </div>
    </div>
  );
}

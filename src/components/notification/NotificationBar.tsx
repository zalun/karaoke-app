import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";
import { useNotificationStore, type NotificationType } from "../../stores/notificationStore";

const typeConfig: Record<
  NotificationType,
  {
    icon: typeof AlertCircle;
    bgClass: string;
    textClass: string;
    iconClass: string;
    indicatorClass: string;
  }
> = {
  error: {
    icon: AlertCircle,
    bgClass: "bg-red-900/90",
    textClass: "text-red-200",
    iconClass: "text-red-400",
    indicatorClass: "bg-red-600 hover:bg-red-500",
  },
  warning: {
    icon: AlertTriangle,
    bgClass: "bg-yellow-900/90",
    textClass: "text-yellow-200",
    iconClass: "text-yellow-400",
    indicatorClass: "bg-yellow-600 hover:bg-yellow-500",
  },
  success: {
    icon: CheckCircle,
    bgClass: "bg-green-900/90",
    textClass: "text-green-200",
    iconClass: "text-green-400",
    indicatorClass: "bg-green-600 hover:bg-green-500",
  },
  info: {
    icon: Info,
    bgClass: "bg-blue-900/90",
    textClass: "text-blue-200",
    iconClass: "text-blue-400",
    indicatorClass: "bg-blue-600 hover:bg-blue-500",
  },
};

export function NotificationBar() {
  const {
    current,
    lastNotification,
    isVisible,
    isHiding,
    showLast,
    moreCount,
    dismiss,
    toggleShowLast,
    hideLastIndicator,
  } = useNotificationStore();

  // Show main notification bar
  if (isVisible && current) {
    const config = typeConfig[current.type];
    const Icon = config.icon;

    return (
      <div
        className={`fixed bottom-0 left-4 right-4 z-[9999] ${
          isHiding ? "animate-slide-down" : "animate-slide-up"
        }`}
      >
        <div
          className={`${config.bgClass} rounded-t-2xl p-4 shadow-xl backdrop-blur max-w-2xl mx-auto`}
        >
          <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${config.iconClass} flex-shrink-0`} />
            <p className={`flex-1 text-sm ${config.textClass}`}>
              {current.message}
              {moreCount > 0 && (
                <span className="ml-2 opacity-75">
                  (+{moreCount} more)
                </span>
              )}
            </p>
            <button
              onClick={dismiss}
              className={`${config.iconClass} hover:text-white transition-colors flex-shrink-0`}
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show "last message" popup when indicator is clicked
  if (showLast && lastNotification) {
    const config = typeConfig[lastNotification.type];
    const Icon = config.icon;

    return (
      <div className="fixed bottom-0 left-4 right-4 z-[9999] animate-slide-up">
        <div
          className={`${config.bgClass} rounded-t-2xl p-4 shadow-xl backdrop-blur max-w-2xl mx-auto`}
        >
          <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${config.iconClass} flex-shrink-0`} />
            <div className="flex-1">
              <p className={`text-sm ${config.textClass}`}>
                {lastNotification.message}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {formatTimeAgo(lastNotification.timestamp)}
              </p>
            </div>
            <button
              onClick={hideLastIndicator}
              className={`${config.iconClass} hover:text-white transition-colors flex-shrink-0`}
              aria-label="Close last notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show small indicator for last message access
  if (lastNotification && !isVisible) {
    const config = typeConfig[lastNotification.type];
    const Icon = config.icon;

    return (
      <div className="fixed bottom-0 left-4 z-[9999]">
        <button
          onClick={toggleShowLast}
          className={`${config.indicatorClass} rounded-full p-2 shadow-lg transition-colors`}
          aria-label="Show last notification"
          title="Show last notification"
        >
          <Icon className="w-4 h-4 text-white" />
        </button>
      </div>
    );
  }

  return null;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return "Unknown time";
  }

  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) {
    return "Just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

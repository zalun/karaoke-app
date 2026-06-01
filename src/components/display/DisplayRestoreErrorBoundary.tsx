import { Component, createRef, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { createLogger } from "../../services/logger";
import { useDisplayStore } from "../../stores";

const log = createLogger("DisplayRestoreDialog");

interface Props {
  children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

export class DisplayRestoreErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  private dismissButtonRef = createRef<HTMLButtonElement>();

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error("DisplayRestoreDialog crashed", { error, componentStack: info.componentStack });
  }

  componentDidMount(): void {
    if (this.state.error) this.dismissButtonRef.current?.focus();
  }

  componentDidUpdate(_: Props, prevState: State): void {
    if (!prevState.error && this.state.error) {
      this.dismissButtonRef.current?.focus();
    }
  }

  private handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") void this.handleDismiss();
  };

  private handleDismiss = async (): Promise<void> => {
    // Drop the pending restore so the dialog won't re-mount and re-throw,
    // then clear the boundary so the app continues without it.
    try {
      await useDisplayStore.getState().dismissRestore();
    } catch (err) {
      log.error("dismissRestore failed during error recovery:", err);
    }
    try {
      this.setState({ error: null });
    } catch (err) {
      log.error("Failed to clear error boundary state:", err);
    }
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alertdialog"
        aria-labelledby="display-restore-error-title"
        aria-describedby="display-restore-error-body"
        onKeyDown={this.handleKeyDown}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      >
        <div className="bg-gray-800 rounded-lg p-4 w-96 shadow-xl border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-400" />
              <h3 id="display-restore-error-title" className="text-lg font-medium text-white">
                Couldn't restore display layout
              </h3>
            </div>
            <button
              onClick={this.handleDismiss}
              className="text-gray-400 hover:text-white transition-colors"
              title="Close"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
          <p id="display-restore-error-body" className="text-gray-300 text-sm mb-4">
            Something went wrong while showing the layout restore prompt. You can keep using the app
            and arrange your windows manually.
          </p>
          <div className="flex justify-end border-t border-gray-700 pt-4">
            <button
              ref={this.dismissButtonRef}
              onClick={this.handleDismiss}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }
}

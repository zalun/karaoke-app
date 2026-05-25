import { useEffect, useState, useCallback } from "react";
import { X, AlertTriangle, ExternalLink, Copy, Check, Bug, Lightbulb, MessageSquare } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { useFeedbackStore, type FeedbackType } from "../../stores/feedbackStore";
import { notify } from "../../stores/notificationStore";
import { createLogger } from "../../services";
import { collectContext, submitFeedback } from "../../services/feedback";

const log = createLogger("FeedbackDialog");

/**
 * Non-dismissable privacy banner copy. The exact text is a spec contract
 * (it sets the user's privacy expectation) and is asserted verbatim in
 * FeedbackDialog.test.tsx / feedback.spec.ts.
 */
const PRIVACY_BANNER =
  "⚠️ Tytuł i opis pojawią się publicznie na GitHubie. Email i logi zostaną tylko u nas (prywatnie).";

const TITLE_MAX = 200;
const BODY_MAX = 5000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TYPE_META: Record<FeedbackType, { label: string; icon: typeof Bug }> = {
  bug: { label: "Report a Bug", icon: Bug },
  feature: { label: "Suggest a Feature", icon: Lightbulb },
  other: { label: "Send Feedback", icon: MessageSquare },
};

interface FieldErrors {
  title?: string;
  body?: string;
  email?: string;
}

type View = "form" | "success";

export function FeedbackDialog() {
  const { open: isOpen, initialType, close } = useFeedbackStore();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [includeLogs, setIncludeLogs] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<View>("form");
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset the form each time the dialog opens (fields cleared, latest type kept).
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setBody("");
      setEmail("");
      setIncludeLogs(true);
      setErrors({});
      setSubmitting(false);
      setView("form");
      setIssueUrl(null);
      setCopied(false);
    }
  }, [isOpen]);

  // Close on Escape (except while a submission is in flight).
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        close();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, submitting, close]);

  const validate = useCallback((): FieldErrors => {
    const next: FieldErrors = {};
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    const trimmedEmail = email.trim();

    if (trimmedTitle.length < 1) next.title = "Tytuł jest wymagany.";
    else if (trimmedTitle.length > TITLE_MAX) next.title = `Maksymalnie ${TITLE_MAX} znaków.`;

    if (trimmedBody.length < 1) next.body = "Opis jest wymagany.";
    else if (trimmedBody.length > BODY_MAX) next.body = `Maksymalnie ${BODY_MAX} znaków.`;

    if (trimmedEmail.length > 0 && !EMAIL_PATTERN.test(trimmedEmail)) {
      next.email = "Nieprawidłowy adres email.";
    }
    return next;
  }, [title, body, email]);

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    try {
      const { context, logsFailed } = await collectContext({ includeLogs });
      if (logsFailed) {
        notify("warning", "Nie udało się dołączyć logów do zgłoszenia.");
      }

      const trimmedEmail = email.trim();
      const result = await submitFeedback({
        type: initialType,
        title: title.trim(),
        body: body.trim(),
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
        context,
      });

      if (result.status === 429) {
        notify("error", "Zbyt wiele zgłoszeń. Spróbuj ponownie za godzinę.");
        return;
      }
      if (result.ok) {
        setIssueUrl(result.githubIssueUrl ?? null);
        setView("success");
        return;
      }
      notify("error", result.error || "Nie udało się wysłać zgłoszenia. Spróbuj ponownie.");
    } catch (err) {
      log.error("Unexpected error submitting feedback:", err);
      notify("error", "Nie udało się wysłać zgłoszenia. Spróbuj ponownie.");
    } finally {
      setSubmitting(false);
    }
  }, [validate, includeLogs, email, initialType, title, body]);

  const handleOpenIssue = useCallback(async () => {
    if (!issueUrl) return;
    try {
      const parsed = new URL(issueUrl);
      // Exact-match guard: `endsWith("github.com")` would also accept e.g.
      // `evilgithub.com`, so require the apex host or a real subdomain.
      const isGitHub =
        parsed.protocol === "https:" &&
        (parsed.hostname === "github.com" || parsed.hostname.endsWith(".github.com"));
      if (!isGitHub) {
        log.error(`Blocked opening non-GitHub URL: ${issueUrl}`);
        notify("error", "Nie można otworzyć linku. Skopiuj go ręcznie.");
        return;
      }
      await open(issueUrl);
    } catch (err) {
      log.error("Failed to open issue URL:", err);
      notify("error", "Nie udało się otworzyć linku. Skopiuj go ręcznie.");
    }
  }, [issueUrl]);

  const handleCopyLink = useCallback(async () => {
    if (!issueUrl) return;
    try {
      await navigator.clipboard.writeText(issueUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      log.error("Failed to copy issue URL:", err);
      notify("error", "Nie udało się skopiować linku.");
    }
  }, [issueUrl]);

  if (!isOpen) return null;

  const { label, icon: TypeIcon } = TYPE_META[initialType];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="feedback-dialog">
      <div className="bg-gray-800 rounded-lg w-[560px] max-h-[85vh] shadow-xl border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <TypeIcon size={20} className="text-blue-400" />
            <h3 className="text-lg font-medium text-white">{label}</h3>
          </div>
          <button
            onClick={close}
            disabled={submitting}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Close"
            aria-label="Close feedback dialog"
          >
            <X size={20} />
          </button>
        </div>

        {view === "success" ? (
          <div className="p-6 flex flex-col gap-4" data-testid="feedback-success">
            {issueUrl ? (
              <>
                <p className="text-gray-200">
                  Dziękujemy! Twoje zgłoszenie zostało opublikowane na GitHubie:
                </p>
                <a
                  href={issueUrl}
                  data-testid="feedback-issue-url"
                  onClick={(e) => {
                    e.preventDefault();
                    handleOpenIssue();
                  }}
                  className="text-blue-400 hover:text-blue-300 underline break-all text-sm"
                >
                  {issueUrl}
                </a>
                <div className="flex gap-2">
                  <button
                    onClick={handleOpenIssue}
                    data-testid="feedback-open-issue"
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                  >
                    <ExternalLink size={16} /> Open
                  </button>
                  <button
                    onClick={handleCopyLink}
                    data-testid="feedback-copy-link"
                    className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-gray-200">
                Dziękujemy! Zgłoszenie zostało przyjęte — odezwiemy się wkrótce.
              </p>
            )}
            <div className="flex justify-end">
              <button
                onClick={close}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-4 overflow-y-auto">
            {/* Privacy banner (non-dismissable) */}
            <div
              data-testid="feedback-banner"
              className="flex items-start gap-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded text-sm text-yellow-200"
            >
              <AlertTriangle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
              <span>{PRIVACY_BANNER}</span>
            </div>

            {/* Title */}
            <div className="flex flex-col gap-1">
              <label htmlFor="feedback-title" className="text-sm text-gray-300">
                Tytuł
              </label>
              <input
                id="feedback-title"
                data-testid="feedback-title"
                type="text"
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500"
              />
              {errors.title && (
                <span data-testid="feedback-title-error" className="text-xs text-red-400">
                  {errors.title}
                </span>
              )}
            </div>

            {/* Body */}
            <div className="flex flex-col gap-1">
              <label htmlFor="feedback-body" className="text-sm text-gray-300">
                Opis
              </label>
              <textarea
                id="feedback-body"
                data-testid="feedback-body"
                value={body}
                maxLength={BODY_MAX}
                rows={5}
                onChange={(e) => setBody(e.target.value)}
                disabled={submitting}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500 resize-none"
              />
              {errors.body && (
                <span data-testid="feedback-body-error" className="text-xs text-red-400">
                  {errors.body}
                </span>
              )}
            </div>

            {/* Email (optional) */}
            <div className="flex flex-col gap-1">
              <label htmlFor="feedback-email" className="text-sm text-gray-300">
                Email <span className="text-gray-500">(opcjonalnie)</span>
              </label>
              <input
                id="feedback-email"
                data-testid="feedback-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500"
              />
              {errors.email && (
                <span data-testid="feedback-email-error" className="text-xs text-red-400">
                  {errors.email}
                </span>
              )}
            </div>

            {/* Include logs */}
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                data-testid="feedback-include-logs"
                checked={includeLogs}
                onChange={(e) => setIncludeLogs(e.target.checked)}
                disabled={submitting}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
              />
              Dołącz logi aplikacji
            </label>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={close}
                disabled={submitting}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                onClick={handleSubmit}
                data-testid="feedback-submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Wysyłanie..." : "Wyślij"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

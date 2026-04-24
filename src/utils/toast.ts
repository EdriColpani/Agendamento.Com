import { toast } from "sonner";

const TECHNICAL_ERROR_PATTERNS = [
  /PGRST\d+/i,
  /SQL state/i,
  /\b22P02\b/i,
  /\bP0001\b/i,
  /Edge Function returned a non-2xx status code/i,
  /Failed to run sql query/i,
  /Could not embed because more than one relationship was found/i,
];

export const sanitizeErrorMessage = (
  message: string | null | undefined,
  fallback = "Ocorreu um erro ao processar sua solicitação. Tente novamente.",
): string => {
  if (!message || !message.trim()) return fallback;

  const trimmed = message.trim();
  const looksTechnical = TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (looksTechnical) return fallback;

  return trimmed;
};

export const showSuccess = (message: string) => {
  toast.success(message);
};

export const showError = (message: string) => {
  toast.error(sanitizeErrorMessage(message));
};

export const showOperationError = (
  friendlyMessage: string,
  error?: unknown,
  fallback = "Ocorreu um erro ao processar sua solicitação. Tente novamente.",
) => {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : (error as { message?: string } | undefined)?.message;
  const safeDetails = sanitizeErrorMessage(raw, fallback);
  toast.error(`${friendlyMessage} ${safeDetails}`.trim());
};

export const showLoading = (message: string) => {
  return toast.loading(message);
};

export const dismissToast = (toastId: string) => {
  toast.dismiss(toastId);
};

import { toast } from "sonner";

/**
 * Show a generic, user-friendly error message while logging the underlying
 * error to the browser console. Avoids leaking database schema details
 * (table/column/constraint/RLS policy names) from raw Supabase errors.
 */
export function handleDbError(
  error: unknown,
  context: string,
  userMessage: string = "Si è verificato un errore. Riprova più tardi.",
) {
  // Keep raw details only in the console, never in user-facing UI.
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, error);
  toast.error(userMessage);
}

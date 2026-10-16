import type { MessageKey } from "@/lib/i18n";

/** Under Next.js, Convex Auth errors reach the client as plain Error messages. */
export function authErrorKey(error: unknown): MessageKey {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("INVITE_INVALID")) return "auth.inviteRequired";
  if (message.includes("NAME_REQUIRED")) return "auth.nameRequired";
  if (message.includes("Invalid password")) return "auth.passwordTooShort";
  if (/Account .* already exists/.test(message)) return "auth.accountExists";
  if (message.includes("InvalidSecret") || message.includes("InvalidAccountId")) {
    return "auth.wrongCredentials";
  }
  return "auth.genericError";
}

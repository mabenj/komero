import type { MessageKey } from "./fi";

// English UI strings. `satisfies` makes a key missing from (or not in) fi.ts a
// type error, so a new Finnish string can't ship without its translation.
export const en = {
  "app.name": "Komero",
  "app.description": "Home inventory and shopping list",
  "common.loading": "Loading…",

  "nav.koti": "Home",
  "nav.scan": "Scan",
  "nav.lista": "List",
  "nav.settings": "Settings",
  "nav.back": "Back",

  "offline.banner": "Offline",
  "offline.pending": "changes will be sent when the connection returns",

  "auth.signInTitle": "Sign in",
  "auth.firstRunTitle": "Create the first account",
  "auth.firstRunHint": "Komero has no Members yet. Create the first account to get started.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.passwordHint": "At least 8 characters",
  "auth.signIn": "Sign in",
  "auth.createAccount": "Create account",
  "auth.wrongCredentials": "Wrong email or password.",
  "auth.inviteRequired": "A new Member needs an invite link.",
  "auth.passwordTooShort": "The password must be at least 8 characters.",
  "auth.genericError": "Something went wrong. Please try again.",
  "auth.accountExists": "This email already has an account. Please sign in.",
  "auth.inviteTitle": "Join Komero",
  "auth.inviteHint": "You've been invited. Choose an email and password to join.",
  "auth.inviteUnusable": "This invite link has already been used or has expired. Ask for a new one.",
  "auth.goToSignIn": "Sign in",

  "koti.noProducts": "No Products",
  "scan.comingSoon": "Scanning is coming soon.",
  "lista.comingSoon": "The Shopping List is coming soon.",

  "settings.title": "Settings",
  "settings.signedInAs": "Signed in as {email}",
  "settings.logOut": "Log out",
  "settings.language": "Language",
  "settings.language.fi": "Suomi",
  "settings.language.en": "English",
  "settings.members": "Members",
  "settings.you": "(you)",
  "settings.createInvite": "Create invite link",
  "settings.inviteHint": "The link works once and is valid for 7 days.",
  "settings.inviteShareText": "Join Komero:",
  "settings.share": "Share",
  "settings.copy": "Copy",
  "settings.copied": "Copied!",
} satisfies Record<MessageKey, string>;

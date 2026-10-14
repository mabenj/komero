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

  "koti.noProducts": "No Products",
  "scan.comingSoon": "Scanning is coming soon.",
  "lista.comingSoon": "The Shopping List is coming soon.",

  "settings.title": "Settings",
  "settings.signedInAs": "Signed in as {email}",
  "settings.logOut": "Log out",
  "settings.language": "Language",
  "settings.language.fi": "Suomi",
  "settings.language.en": "English",
} satisfies Record<MessageKey, string>;

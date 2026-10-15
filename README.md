# Komero

A household Inventory and shared Shopping List for phones. Domain language is in
[`GLOSSARY.md`](GLOSSARY.md); architecture decisions are in [`docs/adr/`](docs/adr/).

Stack: Next.js 16 (App Router, client-routed shell) on Vercel, Convex for data,
live queries and auth (Convex Auth, Password provider). Node 20.17+, pnpm 9.

## Develop

```bash
pnpm install
CONVEX_AGENT_MODE=anonymous npx convex dev --once   # no login: local backend, codegen, writes .env.local
pnpm test        # convex-test + Vitest scenarios
pnpm typecheck   # Next route types + tsc for app and convex/
pnpm lint        # ESLint, including "no hard-coded UI strings"
pnpm build       # next build
```

For a running app, keep `npx convex dev` running (anonymous or logged in), set the auth
keys once with `npx @convex-dev/auth` (or `npx convex env set JWT_PRIVATE_KEY/JWKS/SITE_URL`),
then `pnpm dev`. The first person to open the app creates the first Member.

## Conventions

- **Tests** live next to the Convex functions as `convex/*.test.ts`. They drive Komero only
  through public Convex functions as signed-in Members (`newKomero()`, `signUp()`, `signIn()`
  in `convex/test.helpers.ts`), assert only through public queries, and are named as household
  scenarios in glossary terms. No UI or end-to-end tests. The single exception is a cron target
  with no public route: the 90-day purge test calls `internal.activities.purgeOld` the way the
  daily cron does. `vitest.setup.ts` swaps the Password provider's slow Scrypt hash for a cheap
  one, so sign-ups in tests stay fast; the sign-up and sign-in flow is otherwise the real one.
- **Navigation** in the signed-in app stays on the client: the whole app is one route
  (`app/(app)/[[...path]]/page.tsx`) that picks the screen from the URL, and links use
  `AppLink` / `navigate()` (`components/AppLink.tsx`), not Next's `<Link>` or `router.push`,
  which fetch the route from the server and reload the page when offline. `KeepOfflineData`
  keeps the tabs' queries subscribed so screens show the last data offline (ADR-0001).
- **Per-device conveniences** (last tab, scan mode, Location) go through `lib/remembered.ts`.
- Files in `convex/` with two dots in the name (`*.test.ts`, `test.helpers.ts`, `test.setup.ts`)
  are not deployed.
- Member-only Convex functions start with `await requireMemberId(ctx)` (`convex/members.ts`).
  The Convex Auth table is `users`, but in code and UI the concept is a **Member**.
- **UI strings** all live in `lib/i18n/fi.ts`, with the English string under the same key in
  `lib/i18n/en.ts` (a key missing from either fails typecheck). Components read them with
  `const t = useT(); t("key")`, in the signed-in Member's language (Finnish when signed out);
  server code such as metadata uses the Finnish `translate`. ESLint rejects text literals in
  JSX. User text (Product, Location, One-off names) is never translated.
- **App icon**: `public/icons/icon.svg` is the source. After changing it, re-render the PNGs with
  `convert -density 300 public/icons/icon.svg -resize N -alpha off <file>` for
  `public/icons/icon-192.png`, `public/icons/icon-512.png` and `app/apple-icon.png` (180), and
  `app/favicon.ico` with `convert -density 300 public/icons/icon.svg -alpha off -define icon:auto-resize=48,32,16 app/favicon.ico`.
  Keep the glyph inside the central 80% so the 512 icon also works as maskable.

## Deploy (human steps)

1. **Convex**: `npx convex login`, then `npx convex dev --configure` to create the project
   (this rewrites `.env.local`). Set the auth env vars on the dev deployment with
   `npx @convex-dev/auth`, and on production with `npx @convex-dev/auth --prod`
   (sets `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`; use the Vercel URL as `SITE_URL` on prod).
2. **Vercel**: import the GitHub repo. Override the build command with
   `npx convex deploy --cmd 'pnpm build'`, and add the env var `CONVEX_DEPLOY_KEY`
   (Production; generate it in the Convex dashboard under the prod deployment's settings).
   `convex deploy` pushes the functions and sets `NEXT_PUBLIC_CONVEX_URL` for the build.
3. Open the deployed URL, create the first Member, and check on a real phone that you stay
   signed in after closing the browser.

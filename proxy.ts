import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/signin"]);

const YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const signedIn = await convexAuth.isAuthenticated();
    if (isSignInPage(request) && signedIn) return nextjsMiddlewareRedirect(request, "/");
    if (!isSignInPage(request) && !signedIn) return nextjsMiddlewareRedirect(request, "/signin");
  },
  // Without maxAge the auth cookies are session cookies and vanish when the browser closes.
  { cookieConfig: { maxAge: YEAR_IN_SECONDS } },
);

export const config = {
  // Everything except static files (any path with a dot) and Next internals.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};

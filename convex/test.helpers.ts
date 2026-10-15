// Scenario helpers for convex-test. Tests drive Komero only through its public
// Convex functions (and Convex Auth's real Password sign-up/sign-in), and
// assert only through public queries.
import { convexTest } from "convex-test";
import { decodeJwt, exportJWK, exportPKCS8, generateKeyPair } from "jose";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

export const PASSWORD = "salasana123";

/** A fresh, empty Komero backend: no Members, no Categories. */
export function newKomero() {
  return convexTest(schema, modules);
}
export type Komero = ReturnType<typeof newKomero>;
export type MemberSession = ReturnType<Komero["withIdentity"]>;

/**
 * Signs up through the real Password flow, carrying an Invite token when given;
 * returns a session as the new Member.
 */
export async function signUp(t: Komero, email: string, inviteToken?: string): Promise<MemberSession> {
  return authenticate(t, { email, password: PASSWORD, flow: "signUp", ...(inviteToken && { inviteToken }) });
}

/** Signs in an existing Member; returns a session as that Member. */
export async function signIn(t: Komero, email: string, password = PASSWORD): Promise<MemberSession> {
  return authenticate(t, { email, password, flow: "signIn" });
}

async function authenticate(t: Komero, params: Record<string, string>) {
  await ensureAuthEnv();
  const result = await t.action(api.auth.signIn, { provider: "password", params });
  // The JWT subject is "<userId>|<sessionId>", which is what getAuthUserId() parses.
  const subject = decodeJwt(result.tokens!.token).sub!;
  return t.withIdentity({ subject });
}

// Convex Auth's signIn action mints JWTs, so it needs signing keys in the env.
let authEnvReady: Promise<void> | undefined;
function ensureAuthEnv() {
  authEnvReady ??= (async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
    process.env.JWT_PRIVATE_KEY = (await exportPKCS8(privateKey)).trimEnd().replace(/\n/g, " ");
    process.env.JWKS = JSON.stringify({ keys: [{ use: "sig", ...(await exportJWK(publicKey)) }] });
    process.env.SITE_URL = "http://localhost:3000";
    process.env.CONVEX_SITE_URL = "https://test.convex.site";
  })();
  return authEnvReady;
}

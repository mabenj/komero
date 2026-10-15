import { vi } from "vitest";

// Convex Auth's Password provider hashes with Scrypt, which takes about half a
// second per sign-up and made scenario tests time out on a busy machine. Tests
// still sign up and in through the real Password flow; only the hash is cheap.
// A wrong password still fails: verify compares against the stored hash.
vi.mock("@convex-dev/auth/providers/Password", async (importOriginal) => {
  const original = await importOriginal<typeof import("@convex-dev/auth/providers/Password")>();
  const crypto = {
    hashSecret: async (password: string) => `test-hash:${password}`,
    verifySecret: async (password: string, hash: string) => hash === `test-hash:${password}`,
  };
  return { ...original, Password: (config: Parameters<typeof original.Password>[0]) => original.Password({ crypto, ...config }) };
});

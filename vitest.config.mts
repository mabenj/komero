import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "convex",
          environment: "edge-runtime",
          server: { deps: { inline: ["convex-test"] } },
          include: ["convex/**/*.test.ts"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        // The app's pure modules, which need neither the edge runtime nor the Convex test setup.
        test: { name: "lib", environment: "node", include: ["lib/**/*.test.ts"] },
      },
    ],
  },
});

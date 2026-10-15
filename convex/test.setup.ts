/// <reference types="vite/client" />
// Two dots in the file name keep it (and *.test.ts, test.helpers.ts) out of the Convex deploy.
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");

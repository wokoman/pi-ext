import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    root: resolve(__dirname),
    include: ["unit/**/*.test.ts", "api/**/*.test.ts"],
    setupFiles: ["./fixtures/vitest-setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});

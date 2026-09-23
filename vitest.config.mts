import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    // e2e/ holds Playwright specs, which fail under Vitest's runner.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts"
    ],
    coverage: {
      reporter: [
        "text",
        "lcov"
      ]
    }
  },
  resolve: {
    alias: {
      "@codex-hud/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@codex-hud/config": new URL("./packages/config/src/index.ts", import.meta.url).pathname,
      "@codex-hud/db": new URL("./packages/db/src/index.ts", import.meta.url).pathname,
      "@codex-hud/telegram": new URL("./packages/telegram/src/index.ts", import.meta.url).pathname
    }
  }
});


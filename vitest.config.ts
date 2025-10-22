// vitest.config.ts
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    test: {
      env: {
        AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
      },
    },
  };
});

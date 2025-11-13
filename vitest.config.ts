// vitest.config.ts
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [svelte()],
    test: {
      env: {
        AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
        OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
      },
      projects: [
        {
          test: {
            name: "core",
            include: ["tests/core/**/*.test.ts"],
            environment: "node",
          },
        },
        {
          test: {
            name: "main",
            include: ["tests/main/**/*.test.ts"],
            environment: "node",
          },
        },
        {
          test: {
            name: "renderer",
            include: ["tests/renderer/**/*.test.ts"],
            environment: "jsdom",
          },
        },
      ],
    },
  };
});

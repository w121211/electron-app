import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [
      tailwindcss(),
      svelte(),
      // Fix for gray-matter buffer polyfill issue: https://github.com/jonschlinkert/gray-matter/issues/143
      nodePolyfills({
        exclude: ["fs"],
        globals: {
          Buffer: true,
        },
      }),
    ],
  },
});

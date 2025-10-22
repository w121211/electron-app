import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { resolve } from "path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          "windows/quick-prompt/index": resolve(
            __dirname,
            "src/renderer/src/windows/quick-prompt/index.html",
          ),
        },
      },
    },
    plugins: [
      tailwindcss(),
      svelte(),

      // Fix for gray-matter buffer polyfill issue: https://github.com/jonschlinkert/gray-matter/issues/143
      nodePolyfills({
        include: ["path", "buffer"],
        exclude: ["fs"],
      }),
    ],
  },
});

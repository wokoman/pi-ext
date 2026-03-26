import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ command }) => ({
  plugins: [svelte(), ...(command === "build" ? [viteSingleFile()] : [])],
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5492,
    proxy: {
      "/api": "http://localhost:5491",
    },
  },
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        {
          postcssPlugin: "oar-text-size",
          Declaration(decl) {
            if (
              decl.prop === "font-size" &&
              /^\d+(?:\.\d+)?px$/.test(decl.value) &&
              !decl.source?.input.file?.includes("/node_modules/")
            )
              decl.value = `calc(${decl.value} * var(--font-scale, 1.12))`;
          },
        },
      ],
    },
  },
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://127.0.0.1:3001",
        changeOrigin: false,
      },
    },
  },
  build: { chunkSizeWarningLimit: 1600 },
});

import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// EHR のカルテに iframe で埋め込まれるので、frame-ancestors で EHR のオリジンだけを許可する。
// 本番(Render の static)は render.yaml の headers で同じ値を出す。
const ehrOrigin = process.env.EHR_ORIGIN ?? "http://localhost:5173";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    headers: { "Content-Security-Policy": `frame-ancestors ${ehrOrigin}` },
  },
  preview: {
    port: 5180,
    headers: { "Content-Security-Policy": `frame-ancestors ${ehrOrigin}` },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        launch: resolve(import.meta.dirname, "launch.html"),
      },
    },
  },
});

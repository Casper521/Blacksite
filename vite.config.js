import { defineConfig } from "vite";

const API_TARGET = process.env.API_TARGET ?? "http://localhost:8787";

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    open: true,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      "/ws": { target: API_TARGET.replace("http", "ws"), ws: true },
    },
  },
});

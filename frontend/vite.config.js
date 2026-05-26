import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
    },
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://backend:3000",
        changeOrigin: true,
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
      // Real-time calendar updates. ws:true upgrades the Socket.IO connection
      // to the API server; the client connects same-origin so prod needs no proxy.
      "/socket.io": {
        target: "http://localhost:5001",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});

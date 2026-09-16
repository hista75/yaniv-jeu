import { defineConfig } from "vite";
export default defineConfig({
  server: {
    host: "0.0.0.0",
    proxy: {
      "/socket.io": { target: "http://localhost:3000", ws: true },
      "/version": "http://localhost:3000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"], socket: ["socket.io-client"] },
      },
    },
  },
});

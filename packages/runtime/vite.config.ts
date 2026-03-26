import { resolve } from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    cors: true,
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    manifest: true,
    outDir: "dist/web",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src/web/main.client.tsx"),
    },
  },
});

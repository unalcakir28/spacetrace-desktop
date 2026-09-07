import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri serves the built files from ../dist and expects a fixed dev port.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    // Tauri's minimum WebView on each platform; no need to ship ES5.
    target: "es2021",
    sourcemap: true,
  },
});

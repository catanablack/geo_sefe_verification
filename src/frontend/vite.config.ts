import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for the 3D safety-verification dashboard.
// Proxies /verify, /simulate, /telemetry to the FastAPI backend (src/api) during development.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/verify": "http://localhost:8000",
      "/simulate": "http://localhost:8000",
      "/telemetry": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
});

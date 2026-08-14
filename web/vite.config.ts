import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The API is proxied rather than called cross-origin on purpose. The backend
// only sends CORS headers when the request's referrer matches FRONT_URL, so a
// direct call from the dev server is rejected — and proxying also means the
// client uses the same relative /api paths in dev as it will in production,
// where it is served from the same origin as the backend.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: process.env.KITCHENOWL_API ?? "http://localhost:8088",
        changeOrigin: true,
      },
    },
  },
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The API is proxied rather than called cross-origin on purpose. The backend
// only sends CORS headers when the request's referrer matches FRONT_URL, so a
// direct call from the dev server is rejected — and proxying also means the
// client uses the same relative /api paths in dev as it will in production,
// where it is served from the same origin as the backend.
export default defineConfig({
  // Served from the container under /next so it can sit beside the Flutter
  // build until it replaces it. Dev stays at the root.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  test: {
    // jsdom rather than node: the API client reads and writes localStorage, and
    // testing it against a hand-rolled stub would be testing the stub.
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.KITCHENOWL_API ?? "http://localhost:8088",
        changeOrigin: true,
      },
      // Live updates. ws is enabled for completeness, though the client pins
      // polling: a browser cannot put an Authorization header on a WebSocket
      // handshake, and that header is how the server authenticates the socket.
      "/socket.io": {
        target: process.env.KITCHENOWL_API ?? "http://localhost:8088",
        changeOrigin: true,
        ws: true,
        // Socket.IO checks the *Origin* header against FRONT_URL, and
        // `changeOrigin` only rewrites Host. Without this the handshake POST
        // answers 400 "Not an accepted origin", socket.io retries forever, and
        // every failed reconnect invalidates the queries — so the symptom is
        // not "live updates are missing" but a screen that refetches on a loop.
        headers: { Origin: process.env.KITCHENOWL_API ?? "http://localhost:8088" },
      },
    },
  },
});

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /*
     * Proxy the API in development so the browser sees one origin.
     *
     * Session cookies are httpOnly and SameSite=Lax. Talking to
     * http://localhost:4000 directly from http://localhost:5173 makes every
     * request cross-site, which means the cookie is not sent and every call
     * fails as unauthenticated — with no useful error. The proxy removes the
     * whole class of problem, and matches production, where the API and the app
     * sit behind one hostname.
     */
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
    outDir: "dist",
  },
});

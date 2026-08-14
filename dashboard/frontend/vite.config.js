import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Home Assistant serves the add-on under an ingress path prefix, so every
  // asset and API call has to be relative rather than rooted at /.
  base: "./",
  server: {
    // For laptop development: `npm run dev` with the backend on 8099
    proxy: {
      "/api": "http://localhost:8099",
    },
  },
});

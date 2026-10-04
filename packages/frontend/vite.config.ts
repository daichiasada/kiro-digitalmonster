import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "./"` makes all asset URLs relative, which is required when the app
// is served from CloudFront / S3 (the deploy target in infra / FEAT-004).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});

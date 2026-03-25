import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, "../app/web"),
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        admin: resolve(__dirname, "../app/web/admin.html"),
        client: resolve(__dirname, "../app/web/client.html"),
        landing: resolve(__dirname, "../app/web/landing.html"),
        privacy: resolve(__dirname, "../app/web/privacy.html"),
      },
    },
    assetsDir: "assets",
    sourcemap: false,
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js"],
  },
});

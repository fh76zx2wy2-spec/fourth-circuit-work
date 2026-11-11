import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    outDir: "../assets/hearings",
    emptyOutDir: true,
    rollupOptions: {
      input: "./src/main.tsx",
      preserveEntrySignatures: "strict",
      output: { entryFileNames: "main.js", chunkFileNames: "[name]-[hash].js" },
    },
  },
});

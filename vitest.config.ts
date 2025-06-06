import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["**/*.{test,spec}.{js,jsx,ts,tsx}"],
    exclude: [
      "node_modules/**", 
      ".next/**", 
      "e2e/**", 
      "tests/e2e/**",
      "tests/routes/**",
      "lib/ai/models.mock.ts"
    ],
    setupFiles: ["./tests/config/test-setup.ts"],
    globals: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
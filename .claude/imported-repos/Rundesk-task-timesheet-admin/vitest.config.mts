import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    // Mirror the "@/..." alias from tsconfig.json
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});

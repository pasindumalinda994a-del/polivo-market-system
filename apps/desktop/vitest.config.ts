import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    name: "desktop",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: [path.join(rootDir, "vitest.setup.ts")],
    environmentMatchGlobs: [["**/src/main/**", "node"]],
  },
  resolve: {
    alias: {
      "@polivo/ui": path.join(rootDir, "../../packages/ui/src/index.ts"),
      "@polivo/domain": path.join(rootDir, "../../packages/domain/src/index.ts"),
      "@polivo/contracts": path.join(rootDir, "../../packages/contracts/src/index.ts"),
    },
  },
});

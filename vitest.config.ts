import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // The app builds via @vitejs/plugin-react (automatic JSX runtime); vitest
  // has no react plugin, so tsx test files and the client components they
  // import need the automatic transform declared here too.
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});

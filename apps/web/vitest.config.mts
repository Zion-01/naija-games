import { defineConfig } from "vitest/config";

// Playwright owns e2e/; Vitest runs the unit tests.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });

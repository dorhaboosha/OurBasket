import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // "@/..." imports, from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        // Fast tests with no database, next to the code they test.
        // An "integration" project (against a test database) is added with the database.
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});

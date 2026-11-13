import "dotenv/config";
import { defineConfig } from "prisma/config";

// The CLI (migrations, seed) uses the direct connection. The running app connects with
// DATABASE_URL through the driver adapter in src/lib/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});

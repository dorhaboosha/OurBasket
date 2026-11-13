// Run by `npm run db:seed` (prisma db seed). Prepares an empty database; safe to rerun.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedDatabase } from "../src/modules/categories/seed";

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example)");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const { createdCategories } = await seedDatabase(prisma);
    console.log(
      createdCategories > 0
        ? `Seeded ${createdCategories} default categories.`
        : "Categories already exist; nothing to seed.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

// No top-level await: tsx runs this file as CommonJS (package.json has no "type").
main().catch((error) => {
  console.error(error);
  process.exit(1);
});

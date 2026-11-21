import { connection } from "next/server";
import { prisma } from "@/lib/prisma";

// The app is up and reaches the database: checked after a deployment, and by any uptime
// monitor. Public, so it says nothing beyond ok / not ok.
export async function GET() {
  // On every request: without request-time data, Cache Components would run this once,
  // at build time.
  await connection();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Health check: database unreachable", error);
    return Response.json(
      { status: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

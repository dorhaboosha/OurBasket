import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** The revision of everything shared (list, categories, history) right now. */
export async function currentRevision(): Promise<number> {
  const state = await prisma.listState.findUnique({ where: { id: 1 }, select: { revision: true } });
  return state?.revision ?? 0;
}

/**
 * Raises the list's revision. Every saved change to the list or its categories calls it,
 * inside the change's transaction, so the revision always matches the data (spec 12.2).
 * Returns the new revision.
 */
export async function bumpRevision(tx: Prisma.TransactionClient): Promise<number> {
  const state = await tx.listState.upsert({
    where: { id: 1 },
    create: { id: 1, revision: 1 },
    update: { revision: { increment: 1 } },
    select: { revision: true },
  });
  return state.revision;
}

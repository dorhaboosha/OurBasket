"use server";

import { getTranslations } from "next-intl/server";
import { appConfig } from "@/config/app.config";
import { requireUser } from "@/modules/auth/current-user";
import {
  type HistoryPage,
  addRecordToList,
  deleteHistoryRecord,
  listHistory,
} from "@/modules/history/history";
import { isId } from "@/modules/products/validation";
import { notifyListChanged } from "@/modules/realtime/server";

// The history screen's actions (spec 10). Each checks the session on the server first.

export type HistoryActionResult = { ok: boolean; message: string };

/** The next page of purchases ("load more"). */
export async function loadHistoryAction(cursor: unknown): Promise<HistoryPage> {
  await requireUser();
  return listHistory(isId(cursor) ? cursor : undefined);
}

/** "Add to list" (spec 10.4): says how many were added, updated and capped. */
export async function addRecordToListAction(id: unknown): Promise<HistoryActionResult> {
  await requireUser();
  const t = await getTranslations("historyMessages");
  if (!isId(id)) return { ok: false, message: t("notFound") };
  const outcome = await addRecordToList(id);
  if (!outcome.ok) return { ok: false, message: t("notFound") };
  notifyListChanged();
  const parts = [
    outcome.added > 0 ? t("added", { count: outcome.added }) : null,
    outcome.merged > 0 ? t("merged", { count: outcome.merged }) : null,
    outcome.capped > 0
      ? t("capped", { count: outcome.capped, max: appConfig.limits.quantityMax })
      : null,
  ].filter(Boolean);
  return { ok: true, message: parts.join(" ") };
}

/** Deletes a purchase (spec 10.5). Nothing goes back to the list. */
export async function deleteHistoryRecordAction(id: unknown): Promise<HistoryActionResult> {
  await requireUser();
  const t = await getTranslations("historyMessages");
  if (!isId(id) || !(await deleteHistoryRecord(id))) {
    return { ok: false, message: t("notFound") };
  }
  notifyListChanged();
  return { ok: true, message: t("deleted") };
}

import type { Dream } from "@/types/dream";

/**
 * 用于排序与列表展示：优先 `structured.meta.dreamDate`（含 YYYY-MM-DD），
 * 无法解析时回退到 `createdAt`。
 */
export function getDreamJournalSortTime(dream: Dream): number {
  const raw = dream.structured?.meta?.dreamDate?.trim();
  if (raw) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split("-").map(Number);
      return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
    }
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return t;
  }
  return new Date(dream.createdAt).getTime();
}

export function getDreamJournalGroupLabel(dream: Dream): string {
  return new Date(getDreamJournalSortTime(dream)).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** 与 `<input type="date" />` 的 `value` 同步（无 `dreamDate` 时用 `createdAt` 日历日） */
export function dreamToDateInputValue(dream: Dream): string {
  const t = getDreamJournalSortTime(dream);
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatJournalDateZh(dream: Dream): string {
  return new Date(getDreamJournalSortTime(dream)).toLocaleDateString("zh-CN");
}

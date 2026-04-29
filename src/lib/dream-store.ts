import fs from "fs";
import path from "path";
import type { Dream } from "@/types/dream";
import { getDreamJournalSortTime } from "@/lib/dream-dates";
import { getServerDataRoot } from "@/lib/server-data-root";

const DATA_DIR = getServerDataRoot();
const DREAMS_FILE = path.join(DATA_DIR, "dreams.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readDreamsFromFile(): Map<string, Dream> {
  ensureDataDir();
  if (!fs.existsSync(DREAMS_FILE)) {
    return new Map();
  }
  try {
    const data = fs.readFileSync(DREAMS_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return new Map(parsed.map((d: Dream) => [d.id, d]));
    }
    return new Map();
  } catch {
    return new Map();
  }
}

function writeDreamsToFile(dreams: Map<string, Dream>): void {
  ensureDataDir();
  const data = JSON.stringify(Array.from(dreams.values()), null, 2);
  fs.writeFileSync(DREAMS_FILE, data, "utf-8");
}

type DreamStoreGlobal = typeof globalThis & {
  __dreamcupDreamsCache?: Map<string, Dream>;
};

function getDreamsMap(): Map<string, Dream> {
  const g = globalThis as DreamStoreGlobal;
  if (!g.__dreamcupDreamsCache) {
    g.__dreamcupDreamsCache = readDreamsFromFile();
  }
  return g.__dreamcupDreamsCache;
}

function setDreamsMap(map: Map<string, Dream>): void {
  (globalThis as DreamStoreGlobal).__dreamcupDreamsCache = map;
}

function getDreams(): Map<string, Dream> {
  return getDreamsMap();
}

/** 日志列表、GET /api/dreams：不含已从列表隐藏的条目 */
export function getAllDreams(): Dream[] {
  return Array.from(getDreams().values())
    .filter((d) => !d.deletedAt)
    .sort(
      (a, b) =>
        getDreamJournalSortTime(b) - getDreamJournalSortTime(a) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

/** 含已隐藏条目（人物整理改名、批量重命名等需扫全量记录） */
export function getAllDreamRecords(): Dream[] {
  return Array.from(getDreams().values()).sort(
    (a, b) =>
      getDreamJournalSortTime(b) - getDreamJournalSortTime(a) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getDreamById(id: string): Dream | undefined {
  return getDreams().get(id);
}

export function createDream(dream: Dream): Dream {
  const dreams = getDreams();
  dreams.set(dream.id, dream);
  setDreamsMap(dreams);
  writeDreamsToFile(dreams);
  return dream;
}

export function updateDream(id: string, updates: Partial<Dream>): Dream | null {
  const dreams = getDreams();
  const dream = dreams.get(id);
  if (!dream) return null;
  const updated = { ...dream, ...updates, updatedAt: new Date().toISOString() };
  dreams.set(id, updated);
  setDreamsMap(dreams);
  writeDreamsToFile(dreams);
  return updated;
}

/** 从磁盘彻底移除条目（仅用于维护脚本等；日志「删除」请用软删除 deletedAt） */
export function deleteDream(id: string): boolean {
  const dreams = getDreams();
  const result = dreams.delete(id);
  if (result) {
    setDreamsMap(dreams);
    writeDreamsToFile(dreams);
  }
  return result;
}

/** 取消「从日志隐藏」，重新出现在列表中 */
export function unhideDreamFromJournal(id: string): Dream | null {
  const dreams = getDreams();
  const dream = dreams.get(id);
  if (!dream?.deletedAt) return dream ?? null;
  const { deletedAt: _removed, ...rest } = dream;
  const updated: Dream = { ...rest, updatedAt: new Date().toISOString() };
  dreams.set(id, updated);
  setDreamsMap(dreams);
  writeDreamsToFile(dreams);
  return updated;
}

export function clearAllDreams(): void {
  const empty = new Map<string, Dream>();
  setDreamsMap(empty);
  writeDreamsToFile(empty);
}

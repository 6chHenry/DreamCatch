import fs from "fs";
import path from "path";
import type { Character, Dream, Person } from "@/types/dream";
import {
  appendUniqueNote,
  extractShortTagsFromText,
  mergeUniqueTags,
} from "@/lib/person-tag-extract";
import { getServerDataRoot } from "@/lib/server-data-root";

const PERSON_REF_DIR = path.join(getServerDataRoot(), "person-reference");

export function ensurePersonReferenceDir(): void {
  if (!fs.existsSync(PERSON_REF_DIR)) {
    fs.mkdirSync(PERSON_REF_DIR, { recursive: true });
  }
}

export function personReferenceFilePath(filename: string): string {
  return path.join(PERSON_REF_DIR, filename);
}

export function deletePersonReferenceFile(filename: string | undefined): void {
  if (!filename) return;
  const p = personReferenceFilePath(filename);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

const DATA_DIR = getServerDataRoot();
const PERSONS_FILE = path.join(DATA_DIR, "persons.json");

/** 读盘时归一化：合并旧版 `relationships`，并去掉该字段以便下次写回为新结构 */
export function normalizePersonFromDisk(raw: Record<string, unknown>): Person {
  const now = new Date().toISOString();
  const id = typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID();
  const name = typeof raw.name === "string" ? raw.name : "";
  const appearances = typeof raw.appearances === "number" ? raw.appearances : 0;
  const firstSeen = typeof raw.firstSeen === "string" ? raw.firstSeen : now;
  const lastSeen = typeof raw.lastSeen === "string" ? raw.lastSeen : now;
  const dreamIds = Array.isArray(raw.dreamIds)
    ? raw.dreamIds.filter((x): x is string => typeof x === "string")
    : [];
  const referenceImageFilename =
    typeof raw.referenceImageFilename === "string" ? raw.referenceImageFilename : undefined;
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : now;
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : now;

  let tags: string[] = Array.isArray(raw.tags)
    ? raw.tags
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  let relationshipNotes: string[] = Array.isArray(raw.relationshipNotes)
    ? raw.relationshipNotes
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const legacy = Array.isArray(raw.relationships)
    ? raw.relationships.filter((x): x is string => typeof x === "string")
    : [];

  for (const r of legacy) {
    const s = r.trim();
    if (!s) continue;
    const extracted = extractShortTagsFromText(s);
    tags = mergeUniqueTags(tags, extracted);
    if (s.length > 12) {
      relationshipNotes = appendUniqueNote(relationshipNotes, s);
    } else if (extracted.length === 0) {
      tags = mergeUniqueTags(tags, [s]);
    }
  }

  return {
    id,
    name,
    appearances,
    firstSeen,
    lastSeen,
    tags,
    relationshipNotes,
    dreamIds,
    referenceImageFilename,
    createdAt,
    updatedAt,
  };
}

/** 内存或接口里未写全的 Person 补全为合法结构（含 tags 可迭代、兼容旧版 relationships） */
function coercePerson(p: Person | Record<string, unknown>): Person {
  return normalizePersonFromDisk(p as Record<string, unknown>);
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function writePersonsToFile(persons: Map<string, Person>): void {
  ensureDataDir();
  const data = JSON.stringify(Array.from(persons.values()), null, 2);
  fs.writeFileSync(PERSONS_FILE, data, "utf-8");
}

function readPersonsFromFile(): Map<string, Person> {
  ensureDataDir();
  if (!fs.existsSync(PERSONS_FILE)) {
    return new Map();
  }
  try {
    const data = fs.readFileSync(PERSONS_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      let needsWrite = false;
      const out = new Map<string, Person>();
      for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const raw = item as Record<string, unknown>;
        if (Array.isArray(raw.relationships) && raw.relationships.length > 0) {
          needsWrite = true;
        }
        const p = normalizePersonFromDisk(raw);
        out.set(p.id, p);
      }
      if (needsWrite) {
        writePersonsToFile(out);
      }
      return out;
    }
    return new Map();
  } catch {
    return new Map();
  }
}

/** Turbopack / 路由分包可能加载多份本模块，模块级 `let` 缓存会不一致；用 globalThis 与 Next 里 Prisma 单例同理。 */
type PersonStoreGlobal = typeof globalThis & {
  __dreamcupPersonsCache?: Map<string, Person>;
};

function getPersonsMap(): Map<string, Person> {
  const g = globalThis as PersonStoreGlobal;
  if (!g.__dreamcupPersonsCache) {
    g.__dreamcupPersonsCache = readPersonsFromFile();
  }
  return g.__dreamcupPersonsCache;
}

function setPersonsMap(map: Map<string, Person>): void {
  (globalThis as PersonStoreGlobal).__dreamcupPersonsCache = map;
}

function getPersons(): Map<string, Person> {
  return getPersonsMap();
}

export function getAllPersons(): Person[] {
  return Array.from(getPersons().values())
    .map((p) => coercePerson(p))
    .sort((a, b) => b.appearances - a.appearances);
}

export function getPersonById(id: string): Person | undefined {
  const p = getPersons().get(id);
  if (!p) return undefined;
  return coercePerson(p);
}

export function findPersonByName(name: string): Person | undefined {
  const p = Array.from(getPersons().values()).find(
    (x) => x.name.toLowerCase() === name.toLowerCase()
  );
  if (!p) return undefined;
  return coercePerson(p);
}

/** 用结构化角色里的 name / identity 对应人物库条目 */
export function findPersonForCharacter(character: Character): Person | undefined {
  const name = (character.name || "").trim();
  if (name) {
    const p = findPersonByName(name);
    if (p) return p;
  }
  const identity = (character.identity || "").trim();
  if (identity) {
    return findPersonByName(identity);
  }
  return undefined;
}

export function createPerson(person: Person): Person {
  const saved = coercePerson(person);
  const persons = getPersons();
  persons.set(saved.id, saved);
  setPersonsMap(persons);
  writePersonsToFile(persons);
  return saved;
}

export function updatePerson(id: string, updates: Partial<Person>): Person | null {
  const persons = getPersons();
  const person = persons.get(id);
  if (!person) return null;
  if (
    "referenceImageFilename" in updates &&
    updates.referenceImageFilename !== person.referenceImageFilename
  ) {
    deletePersonReferenceFile(person.referenceImageFilename);
  }
  const base = coercePerson(person);
  const updated = { ...base, ...updates, updatedAt: new Date().toISOString() };
  persons.set(id, updated);
  setPersonsMap(persons);
  writePersonsToFile(persons);
  return updated;
}

export function deletePerson(id: string): boolean {
  const persons = getPersons();
  const existing = persons.get(id);
  const result = persons.delete(id);
  if (result) {
    if (existing?.referenceImageFilename) {
      deletePersonReferenceFile(existing.referenceImageFilename);
    }
    setPersonsMap(persons);
    writePersonsToFile(persons);
  }
  return result;
}

/** 仅从库中移除条目，不删除参考图文件（合并人物时若把对方参考图并入保留方，需避免 unlink 共用文件）。 */
export function removePersonEntryKeepReferenceFile(id: string): boolean {
  const persons = getPersons();
  const result = persons.delete(id);
  if (result) {
    setPersonsMap(persons);
    writePersonsToFile(persons);
  }
  return result;
}

/** 根据梦境 structured.characters 更新人物库（新建或合并出现次数）。 */
export function syncPersonsFromDream(dream: Dream, lastSeen?: string): void {
  const seenAt = lastSeen ?? dream.updatedAt ?? dream.createdAt;
  for (const char of dream.structured?.characters ?? []) {
    const personName = (char.name || char.identity || "").trim();
    if (!personName) continue;
    try {
      upsertPersonFromDream(
        personName,
        char.relationship?.trim(),
        dream.id,
        seenAt
      );
    } catch (err) {
      console.error("syncPersonsFromDream:", personName, err);
    }
  }
}

function applyDreamRelationshipLine(
  tags: string[],
  notes: string[],
  rel: string
): { tags: string[]; relationshipNotes: string[] } {
  const extracted = extractShortTagsFromText(rel);
  let nextTags = mergeUniqueTags(tags, extracted);
  let nextNotes = notes;
  if (rel.length > 12) {
    nextNotes = appendUniqueNote(nextNotes, rel);
  } else if (extracted.length === 0) {
    nextTags = mergeUniqueTags(nextTags, [rel]);
  }
  return { tags: nextTags, relationshipNotes: nextNotes };
}

export function upsertPersonFromDream(
  name: string,
  relationship: string | undefined,
  dreamId: string,
  dreamDate: string
): Person {
  const existing = findPersonByName(name);
  const now = new Date().toISOString();
  const rel = relationship?.trim();

  if (existing) {
    const updatedDreamIds = existing.dreamIds.includes(dreamId)
      ? existing.dreamIds
      : [...existing.dreamIds, dreamId];
    const applied = rel
      ? applyDreamRelationshipLine(existing.tags, existing.relationshipNotes, rel)
      : { tags: existing.tags, relationshipNotes: existing.relationshipNotes };

    return updatePerson(existing.id, {
      appearances: existing.appearances + (existing.dreamIds.includes(dreamId) ? 0 : 1),
      dreamIds: updatedDreamIds,
      tags: applied.tags,
      relationshipNotes: applied.relationshipNotes,
      lastSeen: dreamDate,
    })!;
  }

  const applied = rel
    ? applyDreamRelationshipLine([], [], rel)
    : { tags: [] as string[], relationshipNotes: [] as string[] };

  const person: Person = {
    id: crypto.randomUUID(),
    name,
    appearances: 1,
    firstSeen: dreamDate,
    lastSeen: dreamDate,
    tags: applied.tags,
    relationshipNotes: applied.relationshipNotes,
    dreamIds: [dreamId],
    createdAt: now,
    updatedAt: now,
  };

  return createPerson(person);
}

export function clearAllPersons(): void {
  const empty = new Map<string, Person>();
  setPersonsMap(empty);
  writePersonsToFile(empty);
}

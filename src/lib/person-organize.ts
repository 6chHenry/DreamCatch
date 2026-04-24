import type { Character, Dream, Person } from "@/types/dream";
import { getAllDreamRecords, updateDream } from "@/lib/dream-store";
import {
  deletePerson,
  deletePersonReferenceFile,
  getAllPersons,
  getPersonById,
  removePersonEntryKeepReferenceFile,
  updatePerson,
} from "@/lib/person-store";

export type PersonOrganizePlan = {
  deletePersonIds: string[];
  mergeGroups: Array<{
    keepPersonId: string;
    absorbPersonIds: string[];
    canonicalName: string;
  }>;
  renameOnly: Array<{ personId: string; newName: string }>;
  /** 仅为当前「无人物标签」的条目建议标签；执行时再次校验仍无标签才写入 */
  tagAssignments?: Array<{ personId: string; tags: string[] }>;
  summary?: string;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** 从计划与当前人物快照构造：需从梦境角色中删除的称呼（小写）、旧称→规范名 */
export function buildOrganizeMaps(
  personsById: Map<string, Person>,
  plan: PersonOrganizePlan
): {
  removeNames: Set<string>;
  replaceMap: Map<string, string>;
} {
  const removeNames = new Set<string>();
  const replaceMap = new Map<string, string>();

  for (const id of plan.deletePersonIds) {
    const p = personsById.get(id);
    if (p?.name) removeNames.add(norm(p.name));
  }

  for (const g of plan.mergeGroups) {
    const canon = g.canonicalName.trim();
    if (!canon) continue;
    for (const aid of g.absorbPersonIds) {
      const p = personsById.get(aid);
      if (p?.name) replaceMap.set(norm(p.name), canon);
    }
    const keep = personsById.get(g.keepPersonId);
    if (keep?.name && norm(keep.name) !== norm(canon)) {
      replaceMap.set(norm(keep.name), canon);
    }
  }

  for (const r of plan.renameOnly) {
    const p = personsById.get(r.personId);
    const newName = r.newName.trim();
    if (p?.name && newName) replaceMap.set(norm(p.name), newName);
  }

  return { removeNames, replaceMap };
}

function patchCharacter(
  c: Character,
  removeNames: Set<string>,
  replaceMap: Map<string, string>
): Character | null {
  let name = (c.name || "").trim();
  let identity = (c.identity || "").trim();
  const primary = name || identity;
  if (!primary) return c;

  const pk = norm(primary);
  if (removeNames.has(pk)) return null;
  if (name && removeNames.has(norm(name))) return null;
  if (identity && removeNames.has(norm(identity))) return null;

  if (name) {
    const to = replaceMap.get(norm(name));
    if (to) name = to;
  }
  if (identity) {
    const to = replaceMap.get(norm(identity));
    if (to) identity = to;
  }

  if (name && identity && norm(name) === norm(identity)) {
    return { ...c, name: undefined, identity };
  }
  const idOut = (identity || name || c.identity || "").trim();
  const nameOut = (name || "").trim();
  if (!idOut && !nameOut) return null;
  if (nameOut && idOut && norm(nameOut) === norm(idOut)) {
    return { ...c, name: undefined, identity: idOut };
  }
  return {
    ...c,
    name: nameOut || undefined,
    identity: idOut || nameOut || c.identity,
  };
}

export function patchDreamForOrganize(
  dream: Dream,
  removeNames: Set<string>,
  replaceMap: Map<string, string>
): Dream | null {
  const chars = dream.structured?.characters ?? [];
  if (chars.length === 0) return null;
  const nextChars = chars
    .map((c) => patchCharacter(c, removeNames, replaceMap))
    .filter((c): c is Character => c !== null);
  if (nextChars.length === chars.length) {
    let same = true;
    for (let i = 0; i < chars.length; i++) {
      if (JSON.stringify(chars[i]) !== JSON.stringify(nextChars[i])) {
        same = false;
        break;
      }
    }
    if (same) return null;
  }
  return {
    ...dream,
    structured: {
      ...dream.structured,
      characters: nextChars,
    },
  };
}

export function applyDreamPatchesForOrganize(
  removeNames: Set<string>,
  replaceMap: Map<string, string>
): number {
  let n = 0;
  for (const dream of getAllDreamRecords()) {
    const patched = patchDreamForOrganize(dream, removeNames, replaceMap);
    if (patched) {
      updateDream(dream.id, { structured: patched.structured });
      n++;
    }
  }
  return n;
}

/** 合并多条人物记录到 keep，删除被吸收条目；canonicalName 作为合并后的展示名 */
export function mergePersonRecords(
  keepId: string,
  absorbIds: string[],
  canonicalName: string
): Person | null {
  const keep = getPersonById(keepId);
  if (!keep) return null;

  const dreamSet = new Set(keep.dreamIds);
  const rels = new Set(keep.relationships);
  let ref = keep.referenceImageFilename;

  for (const aid of absorbIds) {
    if (aid === keepId) continue;
    const p = getPersonById(aid);
    if (!p) continue;
    for (const d of p.dreamIds) dreamSet.add(d);
    for (const r of p.relationships) rels.add(r);

    const absorbRef = p.referenceImageFilename;
    const adoptAbsorbFile = !ref && Boolean(absorbRef);
    if (ref && absorbRef && absorbRef !== ref) {
      deletePersonReferenceFile(absorbRef);
    }

    if (adoptAbsorbFile && absorbRef) {
      ref = absorbRef;
      removePersonEntryKeepReferenceFile(aid);
    } else {
      deletePerson(aid);
    }
  }

  return updatePerson(keepId, {
    name: canonicalName.trim() || keep.name,
    dreamIds: [...dreamSet],
    relationships: [...rels],
    appearances: dreamSet.size,
    referenceImageFilename: ref,
  });
}

/**
 * 执行前过滤 tagAssignments：仅保留「当前无标签、且未被删除、id 存在」的项；其余静默丢弃，不导致整单失败。
 */
export function sanitizePersonOrganizePlan(
  plan: PersonOrganizePlan,
  personsById: Map<string, Person>
): PersonOrganizePlan {
  const deleteSet = new Set(plan.deletePersonIds);
  const seen = new Set<string>();
  const out: NonNullable<PersonOrganizePlan["tagAssignments"]> = [];
  for (const t of plan.tagAssignments ?? []) {
    if (!t.personId || deleteSet.has(t.personId)) continue;
    const p = personsById.get(t.personId);
    if (!p) continue;
    if (p.relationships.length > 0) continue;
    const tags = (t.tags ?? []).map((x) => String(x).trim()).filter(Boolean);
    if (tags.length === 0) continue;
    if (seen.has(t.personId)) continue;
    seen.add(t.personId);
    out.push({ personId: t.personId, tags });
  }
  return { ...plan, tagAssignments: out };
}

export function validateOrganizePlan(plan: PersonOrganizePlan, personsById: Map<string, Person>): string | null {
  const allIds = new Set(personsById.keys());
  const usedAsAbsorb = new Set<string>();
  const keepIds = new Set<string>();

  for (const g of plan.mergeGroups) {
    if (!allIds.has(g.keepPersonId)) return `merge keepPersonId 未知: ${g.keepPersonId}`;
    if (!g.canonicalName?.trim()) return "merge 缺少 canonicalName";
    keepIds.add(g.keepPersonId);
    for (const aid of g.absorbPersonIds) {
      if (aid === g.keepPersonId) return "不能将 keep 自身列入 absorb";
      if (!allIds.has(aid)) return `absorb 未知 id: ${aid}`;
      if (usedAsAbsorb.has(aid)) return `同一人物不能多次被吸收: ${aid}`;
      usedAsAbsorb.add(aid);
    }
  }

  for (const id of plan.deletePersonIds) {
    if (!allIds.has(id)) return `deletePersonIds 含未知 id: ${id}`;
    if (usedAsAbsorb.has(id)) return `已被合并吸收的人物不要列入 delete: ${id}`;
    if (keepIds.has(id)) return `作为 merge 保留项的人物不要列入 delete: ${id}`;
  }

  for (const r of plan.renameOnly) {
    if (!allIds.has(r.personId)) return `rename 未知 personId: ${r.personId}`;
    if (!r.newName?.trim()) return "rename 缺少 newName";
    if (usedAsAbsorb.has(r.personId)) return `被合并吸收的人物不可再 rename: ${r.personId}`;
  }

  return null;
}

/** 执行完整整理：先改梦境角色文案，再合并/删除/重命名人物库 */
export function executePersonOrganizePlan(plan: PersonOrganizePlan): {
  dreamsUpdated: number;
  error?: string;
  /** 实际执行的计划（含过滤后的 tagAssignments） */
  appliedPlan?: PersonOrganizePlan;
} {
  const personsById = new Map(getAllPersons().map((p) => [p.id, p]));
  const planToRun = sanitizePersonOrganizePlan(plan, personsById);
  const err = validateOrganizePlan(planToRun, personsById);
  if (err) return { dreamsUpdated: 0, error: err };

  for (const t of planToRun.tagAssignments ?? []) {
    const p = getPersonById(t.personId);
    if (!p || p.relationships.length > 0) continue;
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const raw of t.tags ?? []) {
      const s = String(raw).trim();
      if (!s) continue;
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      tags.push(s);
    }
    if (tags.length > 0) {
      updatePerson(t.personId, { relationships: tags });
    }
  }

  const { removeNames, replaceMap } = buildOrganizeMaps(personsById, planToRun);
  const dreamsUpdated = applyDreamPatchesForOrganize(removeNames, replaceMap);

  for (const g of planToRun.mergeGroups) {
    mergePersonRecords(g.keepPersonId, g.absorbPersonIds, g.canonicalName.trim());
  }

  for (const id of planToRun.deletePersonIds) {
    deletePerson(id);
  }

  for (const r of planToRun.renameOnly) {
    const p = getPersonById(r.personId);
    if (p) {
      updatePerson(r.personId, { name: r.newName.trim() });
    }
  }

  return { dreamsUpdated, appliedPlan: planToRun };
}

import type { Character, Person } from "@/types/dream";

/** 场景描述里是否出现该角色（用姓名 / 身份做子串匹配）。 */
export function characterAppearsInSceneDescription(
  sceneDescription: string,
  character: Character
): boolean {
  const d = sceneDescription;
  const tokens = [character.name, character.identity].filter(
    (x): x is string => Boolean(x && String(x).trim())
  );
  for (const t of tokens) {
    if (d.includes(t.trim())) return true;
  }
  return false;
}

/**
 * 本场景中第一个「在人物库有参考图」且文本里出现的角色对应的人物。
 * `findPerson` 由 person-store 注入（按 name / identity 查库）。
 */
export function pickReferencePersonForScene(
  sceneDescription: string,
  characters: Character[],
  findPerson: (c: Character) => Person | undefined
): Person | undefined {
  for (const char of characters) {
    if (!characterAppearsInSceneDescription(sceneDescription, char)) continue;
    const person = findPerson(char);
    if (person?.referenceImageFilename) return person;
  }
  return undefined;
}

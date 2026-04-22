import fs from "fs";
import path from "path";
import type { Character, Person } from "@/types/dream";

const PERSON_REF_DIR = path.join(process.cwd(), "data", "person-reference");

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

const DATA_DIR = path.join(process.cwd(), "data");
const PERSONS_FILE = path.join(DATA_DIR, "persons.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
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
      return new Map(parsed.map((p: Person) => [p.id, p]));
    }
    return new Map();
  } catch {
    return new Map();
  }
}

function writePersonsToFile(persons: Map<string, Person>): void {
  ensureDataDir();
  const data = JSON.stringify(Array.from(persons.values()), null, 2);
  fs.writeFileSync(PERSONS_FILE, data, "utf-8");
}

let personsCache: Map<string, Person> | null = null;

function getPersons(): Map<string, Person> {
  if (!personsCache) {
    personsCache = readPersonsFromFile();
  }
  return personsCache;
}

export function getAllPersons(): Person[] {
  return Array.from(getPersons().values()).sort(
    (a, b) => b.appearances - a.appearances
  );
}

export function getPersonById(id: string): Person | undefined {
  return getPersons().get(id);
}

export function findPersonByName(name: string): Person | undefined {
  return Array.from(getPersons().values()).find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
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
  const persons = getPersons();
  persons.set(person.id, person);
  personsCache = persons;
  writePersonsToFile(persons);
  return person;
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
  const updated = { ...person, ...updates, updatedAt: new Date().toISOString() };
  persons.set(id, updated);
  personsCache = persons;
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
    personsCache = persons;
    writePersonsToFile(persons);
  }
  return result;
}

export function upsertPersonFromDream(
  name: string,
  relationship: string | undefined,
  dreamId: string,
  dreamDate: string
): Person {
  const existing = findPersonByName(name);
  const now = new Date().toISOString();

  if (existing) {
    const updatedDreamIds = existing.dreamIds.includes(dreamId)
      ? existing.dreamIds
      : [...existing.dreamIds, dreamId];
    const updatedRelationships =
      relationship && !existing.relationships.includes(relationship)
        ? [...existing.relationships, relationship]
        : existing.relationships;

    return updatePerson(existing.id, {
      appearances: existing.appearances + (existing.dreamIds.includes(dreamId) ? 0 : 1),
      dreamIds: updatedDreamIds,
      relationships: updatedRelationships,
      lastSeen: dreamDate,
    })!;
  }

  const person: Person = {
    id: crypto.randomUUID(),
    name,
    appearances: 1,
    firstSeen: dreamDate,
    lastSeen: dreamDate,
    relationships: relationship ? [relationship] : [],
    dreamIds: [dreamId],
    createdAt: now,
    updatedAt: now,
  };

  return createPerson(person);
}

export function clearAllPersons(): void {
  personsCache = new Map();
  writePersonsToFile(personsCache);
}

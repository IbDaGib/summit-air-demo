/**
 * Service-area lookup: town -> county.
 *
 * Pure and synchronous. Coverage is a fixed business fact, not a database row —
 * keeping it in code means `check_service_area` still answers correctly when the
 * database is unreachable, and it is unit-testable without one.
 *
 * Input arrives from speech-to-text, so it is dirty: casing, padding, trailing
 * state names, and a predictable set of mis-hearings ("Boseman", "Belgrad").
 */
import type { County } from "./types";

export interface ServiceAreaTown {
  /** Canonical, caller-facing spelling. */
  town: string;
  county: County;
}

export const SERVICE_AREA_TOWNS: readonly ServiceAreaTown[] = [
  { town: "Bozeman", county: "Gallatin" },
  { town: "Belgrade", county: "Gallatin" },
  { town: "Manhattan", county: "Gallatin" },
  { town: "Three Forks", county: "Gallatin" },
  { town: "Big Sky", county: "Gallatin" },
  { town: "Livingston", county: "Park" },
  { town: "Ennis", county: "Madison" },
  { town: "West Yellowstone", county: "Madison" },
];

export const COUNTIES: readonly County[] = ["Gallatin", "Park", "Madison"];

export const SERVICE_AREA_MESSAGE =
  "We cover Gallatin, Park and Madison counties — Bozeman, Belgrade, Manhattan, " +
  "Three Forks, Big Sky, Livingston, Ennis and West Yellowstone.";

const BY_KEY = new Map<string, ServiceAreaTown>(
  SERVICE_AREA_TOWNS.map((t) => [t.town.toLowerCase(), t]),
);

/**
 * Mis-hearings and spellings seen from speech-to-text, mapped to the canonical
 * key. Cheaper and far more predictable than fuzzy matching alone.
 */
const ALIASES: Record<string, string> = {
  boseman: "bozeman",
  bozman: "bozeman",
  bozemann: "bozeman",
  "boze man": "bozeman",
  belgrad: "belgrade",
  belgrave: "belgrade",
  "bell grade": "belgrade",
  "bel grade": "belgrade",
  manhatten: "manhattan",
  manhatan: "manhattan",
  "3 forks": "three forks",
  "threeforks": "three forks",
  "three fork": "three forks",
  "big skye": "big sky",
  "bigsky": "big sky",
  livingstone: "livingston",
  "livingston mt": "livingston",
  enis: "ennis",
  eniss: "ennis",
  "west yellow stone": "west yellowstone",
  "west yellowstone mt": "west yellowstone",
  "w yellowstone": "west yellowstone",
  "westyellowstone": "west yellowstone",
};

const STATE_SUFFIX = /[\s,]+(?:mt|mont|montana)\.?$/;

/**
 * Lowercase, strip punctuation and a trailing state name, collapse whitespace.
 * Exported so handlers and tests agree on what "the same town" means.
 */
export function normalizeTown(input: string): string {
  let t = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(STATE_SUFFIX, "").replace(/,+$/, "").trim();
  return t.replace(/\s+/g, " ");
}

/** Levenshtein, capped: we only ever care whether the distance is 0 or 1. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (short.length === long.length) i++;
    j++;
  }
  return edits + (long.length - j) + (short.length - i) <= 1;
}

/**
 * Resolve a spoken town to its service-area entry, or null if we do not cover it.
 *
 * Order: exact -> known alias -> whitespace-insensitive -> one-edit fuzzy. The
 * fuzzy pass is deliberately last and deliberately tight; guessing a town into
 * coverage is worse than asking the caller to repeat it.
 */
export function resolveTown(input: string): ServiceAreaTown | null {
  if (!input) return null;
  const key = normalizeTown(input);
  if (!key) return null;

  const direct = BY_KEY.get(key) ?? BY_KEY.get(ALIASES[key] ?? "");
  if (direct) return direct;

  const squashed = key.replace(/\s/g, "");
  for (const [candidate, town] of BY_KEY) {
    if (candidate.replace(/\s/g, "") === squashed) return town;
  }

  // Too short to fuzzy-match safely — "Ennis" and "Enid" are one edit apart.
  if (squashed.length < 6) return null;
  for (const [candidate, town] of BY_KEY) {
    if (withinOneEdit(candidate.replace(/\s/g, ""), squashed)) return town;
  }
  return null;
}

export function countyForTown(input: string): County | null {
  return resolveTown(input)?.county ?? null;
}

/** Canonical spelling for the ticket, so "boseman" is filed as "Bozeman". */
export function canonicalTownName(input: string): string | null {
  return resolveTown(input)?.town ?? null;
}

import { describe, expect, it } from "vitest";
import { canonicalTownName, countyForTown, normalizeTown, resolveTown } from "./serviceArea";

describe("resolveTown", () => {
  it.each([
    ["Bozeman", "Gallatin"],
    ["Belgrade", "Gallatin"],
    ["Manhattan", "Gallatin"],
    ["Three Forks", "Gallatin"],
    ["Big Sky", "Gallatin"],
    ["Livingston", "Park"],
    ["Ennis", "Madison"],
    ["West Yellowstone", "Madison"],
  ] as const)("maps %s to %s county", (town, county) => {
    expect(countyForTown(town)).toBe(county);
  });

  it.each(["bozeman", "BOZEMAN", "  Bozeman  ", "Bozeman, MT", "bozeman montana", "Bozeman."])(
    "normalises %j",
    (input) => {
      expect(canonicalTownName(input)).toBe("Bozeman");
    },
  );

  it.each([
    ["Boseman", "Bozeman"],
    ["Bozman", "Bozeman"],
    ["Belgrad", "Belgrade"],
    ["bell grade", "Belgrade"],
    ["Livingstone", "Livingston"],
    ["Big Skye", "Big Sky"],
    ["bigsky", "Big Sky"],
    ["three fork", "Three Forks"],
    ["Manhatten", "Manhattan"],
    ["west yellow stone", "West Yellowstone"],
  ])("tolerates the speech-to-text spelling %j", (heard, expected) => {
    expect(canonicalTownName(heard)).toBe(expected);
  });

  it.each(["Butte", "Helena", "Missoula", "Great Falls", "Billings", "Idaho Falls", ""])(
    "declines %j",
    (town) => {
      expect(resolveTown(town)).toBeNull();
    },
  );

  it("does not fuzzy-match a short unrelated town into coverage", () => {
    expect(resolveTown("Enid")).toBeNull();
    expect(resolveTown("Ennis")).not.toBeNull();
  });

  it("normalizeTown strips the state and collapses whitespace", () => {
    expect(normalizeTown("  Three   Forks , MT ")).toBe("three forks");
  });
});

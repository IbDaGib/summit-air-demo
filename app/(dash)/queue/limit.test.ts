import { describe, expect, it } from "vitest";
import { LIMIT, countLabel } from "./limit";

describe("countLabel", () => {
  it("shows the number up to the cap", () => {
    expect(countLabel(0)).toBe("0");
    expect(countLabel(7)).toBe("7");
    expect(countLabel(LIMIT)).toBe("50");
  });

  it("says 50+ once the fetch came back with more rows than the page shows", () => {
    expect(countLabel(LIMIT + 1)).toBe("50+");
    expect(countLabel(200)).toBe("50+");
  });

  it("caps at whatever limit the caller passes", () => {
    expect(countLabel(11, 10)).toBe("10+");
    expect(countLabel(10, 10)).toBe("10");
  });
});

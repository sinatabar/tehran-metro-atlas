import { describe, it, expect } from "vitest";
import {
  getPath,
  pathFor,
  norm,
  initialFilters,
  visible,
  distanceKm,
  date,
  base,
  badgeInk,
  type RecordItem,
} from "../../apps/web/src/model";
describe("bilingual atlas", () => {
  it("normalizes Persian variants, marks, diacritics, joiners and numerals", () => {
    expect(norm("كريم‌خَان ١۲")).toBe(norm("کریم خان 12"));
    expect(norm("Shahr-e Qods")).toBe(norm("Shahre Qods"));
  });
  it("round trips deep links on the configured hosting path", () => {
    const choice = { kind: "stations" as const, id: "station-r1" };
    expect(getPath(pathFor("en", "map", choice))).toEqual({
      lang: "en",
      section: "map",
      choice,
    });
    expect(getPath(base)).toEqual({ lang: "fa", choice: null, section: "map" });
  });
  it("keeps lifecycle, line and positional filters independent", () => {
    const r = {
      status: "operational",
      confidence: "approximate",
      lineIds: ["a", "b"],
    } as RecordItem;
    expect(visible(r, initialFilters())).toBe(true);
    expect(visible(r, { ...initialFilters(), uncertain: false })).toBe(false);
    expect(visible(r, { ...initialFilters(), hidden: ["a"] })).toBe(true);
    expect(visible(r, { ...initialFilters(), hidden: ["a", "b"] })).toBe(false);
  });
  it("returns physical distances and localizes stored civil dates without shifting a day", () => {
    expect(distanceKm([51, 35], [51, 35])).toBe(0);
    expect(distanceKm([51, 35], [51, 36])).toBeCloseTo(111.195, 2);
    expect(date("2026-11-24", "fa")).toContain("۱۴۰۵");
  });
  it("uses distinct readable text on yellow and navy line badges", () => {
    expect(badgeInk("#F9DE0C")).toBe("#080d11");
    expect(badgeInk("#2C3992")).toBe("#ffffff");
  });
});

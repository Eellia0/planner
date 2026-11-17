import { describe, expect, it } from "vitest";
import { CATALOG, catalogItem, GROUPS } from "./catalog";
import type { Part, Size } from "./parts";
import { scaleParts, tone } from "./parts";

/** Рамка детали: [x0, x1, y0, y1, z0, z1]. */
function extent(p: Part): number[] {
  switch (p.kind) {
    case "box":
      return [p.x0, p.x1, p.y0, p.y1, p.z0, p.z1];
    case "cyl": {
      const rx = Math.max(p.r, p.r2 ?? 0);
      const rz = (p.rz ?? p.r) * (rx / p.r || 1);
      return [p.x - rx, p.x + rx, p.y0, p.y1, p.z - rz, p.z + rz];
    }
    case "disc":
      return [p.x - p.r, p.x + p.r, p.y - p.r, p.y + p.r, p.z, p.z + p.depth];
    case "rod":
      return [
        Math.min(p.a[0], p.b[0]),
        Math.max(p.a[0], p.b[0]),
        Math.min(p.a[1], p.b[1]),
        Math.max(p.a[1], p.b[1]),
        Math.min(p.a[2], p.b[2]),
        Math.max(p.a[2], p.b[2]),
      ];
    case "ball":
      return [p.x - p.r, p.x + p.r, p.y - p.r, p.y + p.r, p.z - p.r, p.z + p.r];
    case "wave":
      return [p.x0, p.x1, p.y0, p.y1, p.z - p.amp, p.z + p.amp];
  }
}

describe("каталог мебели", () => {
  it("виды не повторяются, у каждого есть группа и цвет", () => {
    expect(new Set(CATALOG.map((c) => c.type)).size).toBe(CATALOG.length);
    const groups = new Set(GROUPS.map(([g]) => g));
    for (const c of CATALOG) {
      expect(groups.has(c.group)).toBe(true);
      expect(c.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(catalogItem("bed")?.name).toBe("Кровать двуспальная");
  });

  // каждый предмет — в своём размере и в полтора раза больше по ширине: всё конечно и почти в габаритах
  // (одеяло свисает с кровати, подушки наклонены, кран над мойкой — запас 35 см сверху и 6 см по бокам)
  for (const c of CATALOG) {
    it(`«${c.name}» строится в своих габаритах`, () => {
      for (const s of [
        { w: c.size[0], d: c.size[1], h: c.size[2] },
        { w: c.size[0] * 1.5, d: c.size[1], h: c.size[2] * 0.8 },
      ] as Size[]) {
        const parts = c.build(s, c.color);
        expect(parts.length).toBeGreaterThan(0);
        for (const p of parts) {
          const [x0, x1, y0, y1, z0, z1] = extent(p);
          for (const v of [x0, x1, y0, y1, z0, z1]) expect(Number.isFinite(v)).toBe(true);
          expect(x0!).toBeGreaterThanOrEqual(-0.06);
          expect(x1!).toBeLessThanOrEqual(s.w + 0.06);
          expect(z0!).toBeGreaterThanOrEqual(-0.06);
          expect(z1!).toBeLessThanOrEqual(s.d + 0.06);
          expect(y0!).toBeGreaterThanOrEqual(-0.001);
          expect(y1!).toBeLessThanOrEqual(s.h + 0.35);
        }
        for (const p of c.plan?.(s) ?? [])
          expect(
            Object.values(p)
              .flat(2)
              .every((v) => typeof v !== "number" || Number.isFinite(v)),
          ).toBe(true);
      }
    });
  }

  it("растяжение деталей и оттенок цвета", () => {
    const [b] = scaleParts(
      [{ kind: "box", x0: 0, x1: 1, z0: 0, z1: 1, y0: 0, y1: 1, mat: { color: "#000000" } }],
      2,
      3,
      4,
    );
    expect(b).toMatchObject({ x1: 2, y1: 3, z1: 4 });
    expect(tone("#808080", -0.5)).toBe("#404040");
    expect(tone("#000000", 0.5)).toBe("#808080");
  });
});

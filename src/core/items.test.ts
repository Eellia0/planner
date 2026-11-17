import { describe, expect, it } from "vitest";
import {
  badItems,
  guessUnit,
  type ItemDraft,
  itemCorners,
  itemGaps,
  normalizeRotation,
  placeItem,
  resizeItem,
  snapItem,
} from "./items";
import * as ops from "./ops";
import { emptyProject, type Item, type Project } from "./types";

/** Комната 4 × 3 изнутри, стены 12 см наружу. */
function room(): Project {
  const p = emptyProject();
  const ids = [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ].map(([x, y]) => ops.addNode(p, { x: x!, y: y! }));
  ids.forEach((id, i) => ops.addWall(p, id, ids[(i + 1) % ids.length]!));
  ops.addRoom(p, ids);
  return p;
}

const draft = (o: Partial<ItemDraft> = {}): ItemDraft => ({
  type: "box",
  name: "Ящик",
  rotation: 0,
  width: 1,
  depth: 0.5,
  height: 0.8,
  elevation: 0,
  lock: false,
  ...o,
});
const item = (o: Partial<Item> = {}): Item => ({ ...draft(), id: "i", x: 2, y: 1.5, ...o });
const put = (p: Project, ...items: Item[]) => {
  for (const it of items) p.items[it.id] = it;
  return p;
};
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("мебель: оси и углы", () => {
  it("при повороте 0 перед смотрит вниз, при 90 — влево", () => {
    const [bl, , fr] = itemCorners(item());
    near(bl!.x, 1.5);
    near(bl!.y, 1.25);
    near(fr!.x, 2.5);
    near(fr!.y, 1.75);
    const [bl90] = itemCorners(item({ rotation: 90 }));
    // спинка слева при повороте 90° — справа сверху: перед смотрит в −x
    near(bl90!.x, 2.25);
    near(bl90!.y, 1);
  });
  it("поворот приводится к 0–360", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450.004)).toBe(90);
    expect(Object.is(normalizeRotation(-0), 0)).toBe(true);
  });
});

describe("мебель: наложения", () => {
  it("предметы рядом вплотную — не наложение, внахлёст — наложение у обоих", () => {
    const p = put(room(), item({ id: "a", x: 1 }), item({ id: "b", x: 2 }));
    expect(badItems(p).size).toBe(0);
    p.items.b!.x = 1.9;
    expect([...badItems(p)].sort()).toEqual(["a", "b"]);
  });
  it("ковёр под мебелью и шкаф над столешницей — не наложение", () => {
    const p = put(
      room(),
      item({ id: "a" }),
      item({ id: "rug", width: 3, depth: 2, height: 0.012 }),
      item({ id: "up", elevation: 1.5, height: 0.7 }),
    );
    expect(badItems(p).size).toBe(0);
    p.items.up!.elevation = 0.7; // опустили на столешницу
    expect([...badItems(p)].sort()).toEqual(["a", "up"]);
  });
  it("заходит в стену — наложение, вплотную к ней — нет", () => {
    const p = put(room(), item({ id: "a", y: 0.25 }));
    expect(badItems(p).size).toBe(0);
    p.items.a!.y = 0.2;
    expect(badItems(p).has("a")).toBe(true);
  });
  it("круглый проверяется по эллипсу: в угол квадрата соседа не попадает", () => {
    const p = put(
      room(),
      item({ id: "a", x: 1, y: 1, width: 1, depth: 1 }),
      item({ id: "b", x: 1.85, y: 1.85, width: 1, depth: 1 }),
    );
    expect(badItems(p).size).toBe(2);
    expect(badItems(p, () => true).size).toBe(0);
  });
});

describe("мебель: прилипание и постановка", () => {
  it("сторона ближе допуска к стене — встаёт вплотную; дальше — не двигается", () => {
    const p = room();
    near(snapItem(p, item({ y: 0.3 }), 0.1).y, 0.25);
    near(snapItem(p, item({ y: 0.22 }), 0.1).y, 0.25); // чуть зашёл в стену — выталкивается
    near(snapItem(p, item({ y: 0.5 }), 0.1).y, 0.5);
  });
  it("в углу прилипает к обеим стенам, повёрнутый на 30° — ни к одной", () => {
    const p = room();
    const s = snapItem(p, item({ x: 0.55, y: 0.3 }), 0.1);
    near(s.x, 0.5);
    near(s.y, 0.25);
    const r = snapItem(p, item({ x: 0.6, y: 0.4, rotation: 30 }), 0.1);
    near(r.x, 0.6);
    near(r.y, 0.4);
  });
  it("прилипает к соседнему предмету", () => {
    const p = put(room(), item({ id: "bed", x: 2, y: 1.5, width: 1.6, depth: 2 }));
    // тумба в 8 см от кровати: левой стороной встаёт к её правому боку (2,8)
    near(snapItem(p, item({ id: "n", x: 3.08, y: 0.5, width: 0.4, depth: 0.4 }), 0.1).x, 3.0);
  });
  it("новый предмет у стены разворачивается к ней спинкой и встаёт вплотную", () => {
    const p = room();
    const o = { againstWall: true, reach: 0.6, tol: 0.05 };
    const top = placeItem(p, draft(), { x: 2, y: 0.6 }, o);
    expect(top.rotation).toBe(0);
    near(top.y, 0.25);
    const right = placeItem(p, draft(), { x: 3.5, y: 1.5 }, o);
    expect(right.rotation).toBe(90);
    near(right.x, 3.75);
    const bottom = placeItem(p, draft(), { x: 2, y: 2.6 }, o);
    expect(bottom.rotation).toBe(180);
    near(bottom.y, 2.75);
    const left = placeItem(p, draft(), { x: 0.4, y: 1.5 }, o);
    expect(left.rotation).toBe(270);
    near(left.x, 0.25);
  });
  it("посреди комнаты и без «к стене» — как есть", () => {
    const p = room();
    const mid = placeItem(p, draft({ rotation: 45 }), { x: 2, y: 1.5 }, { againstWall: true, reach: 0.6, tol: 0.05 });
    expect(mid.rotation).toBe(45);
    near(mid.x, 2);
    const free = placeItem(p, draft(), { x: 2, y: 0.6 }, { againstWall: false, reach: 0.6, tol: 0.05 });
    expect(free.rotation).toBe(0);
    near(free.y, 0.6);
  });
});

describe("мебель: размеры", () => {
  it("без пропорций меняется один размер, спинка стоит", () => {
    const it0 = item({ y: 0.25 });
    resizeItem(it0, { depth: 0.7 });
    expect([it0.width, it0.depth, it0.height]).toEqual([1, 0.7, 0.8]);
    near(it0.y - it0.depth / 2, 0);
  });
  it("с пропорциями все три — в одно число раз", () => {
    const it0 = item({ lock: true });
    resizeItem(it0, { width: 1.5 });
    expect([it0.width, it0.depth, it0.height]).toEqual([1.5, 0.75, 1.2]);
  });
  it("тянут правую сторону — левая стоит; у повёрнутого — по его осям", () => {
    const it0 = item({ x: 2 });
    resizeItem(it0, { width: 1.4 }, { u: -1, v: -1 });
    near(it0.x - it0.width / 2, 1.5);
    const r = item({ x: 2, y: 1.5, rotation: 90 });
    resizeItem(r, { width: 1.4 }, { u: -1, v: 0 });
    near(r.x, 2);
    near(r.y, 1.7); // ось ширины при 90° смотрит вниз
  });
});

it("единицы модели угадываются по размеру", () => {
  expect(guessUnit(2.2)).toBe(1);
  expect(guessUnit(220)).toBe(100);
  expect(guessUnit(2200)).toBe(1000);
});

it("несколько размеров разом ставятся как есть и при сохранении пропорций; спинка стоит", () => {
  const it0 = item({ lock: true, y: 0.25 });
  resizeItem(it0, { width: 2, depth: 1, height: 1.6 });
  expect([it0.width, it0.depth, it0.height]).toEqual([2, 1, 1.6]);
  expect(it0.y - it0.depth / 2).toBeCloseTo(0, 6);
});

it("проходы: от сторон до стен и соседа на той же высоте", () => {
  const p = put(
    room(),
    item({ id: "a", x: 1, y: 1.5 }),
    item({ id: "b", x: 3, y: 1.5 }),
    item({ id: "up", x: 2, y: 1.5, elevation: 1.5, height: 0.5 }),
  );
  const gaps = itemGaps(p, p.items.a!)
    .map((g) => g.d)
    .sort();
  // слева до стены 0,5, справа до соседа 1,0 (висящий выше не мешает), до верхней и нижней стен по 1,25
  expect(gaps).toEqual([0.5, 1, 1.25, 1.25]);
  p.items.a!.x = 0.5; // вплотную к левой стене — прохода нет
  expect(
    itemGaps(p, p.items.a!)
      .map((g) => g.d)
      .sort(),
  ).toEqual([1.25, 1.25, 1.5]);
});

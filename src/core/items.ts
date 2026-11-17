// Мебель на плане: оси и контур предмета, наложения, прилипание к стенам и соседям, постановка у стены, размеры.
import { add, cross, dot, len, mul, norm, perp, sub, wallOffsets } from "./geometry";
import { wallHeight } from "./openings";
import type { Id, Item, Point, Project, Wall } from "./types";
import { round } from "./units";

/** Ниже — ковёр или коврик: на него ставят мебель, наложением это не считается. */
export const FLAT = 0.03;
/** Наименьший размер предмета. */
export const MIN_ITEM = 0.005;
const TOUCH = 0.005; // заходит меньше чем на 5 мм — это «вплотную», а не наложение
const PARALLEL = Math.sin((1 * Math.PI) / 180); // стороны параллельны с точностью до градуса

/** Предмет без места на плане: то, что ставит каталог. */
export type ItemDraft = Omit<Item, "id" | "x" | "y">;
/** Круглый ли предмет (у каталога своё мнение, ядро его не знает). */
export type IsRound = (it: Item) => boolean;
const square: IsRound = () => false;

/** Поворот в пределах 0–360°, с точностью до сотой градуса. */
export function normalizeRotation(deg: number): number {
  const r = (Math.round(deg * 100) / 100) % 360;
  return (r < 0 ? r + 360 : r) + 0; // + 0 превращает −0 в 0
}

/** Оси предмета на плане: u — вдоль ширины, v — от спинки к переду. */
export function itemAxes(it: Pick<Item, "rotation">): { u: Point; v: Point } {
  const a = (it.rotation * Math.PI) / 180;
  return { u: { x: Math.cos(a), y: Math.sin(a) }, v: { x: -Math.sin(a), y: Math.cos(a) } };
}

/** Точка в осях предмета (от его центра) → точка плана. */
export function itemPoint(it: Item, du: number, dv: number): Point {
  const { u, v } = itemAxes(it);
  return add({ x: it.x, y: it.y }, add(mul(u, du), mul(v, dv)));
}

/** Углы предмета: спинка слева, спинка справа, перед справа, перед слева. */
export function itemCorners(it: Item): Point[] {
  const w = it.width / 2;
  const d = it.depth / 2;
  return [itemPoint(it, -w, -d), itemPoint(it, w, -d), itemPoint(it, w, d), itemPoint(it, -w, d)];
}

/** Контур на плане: прямоугольник или эллипс многоугольником. */
export function itemOutline(it: Item, isRound = false): Point[] {
  if (!isRound) return itemCorners(it);
  const n = 24;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return itemPoint(it, (Math.cos(a) * it.width) / 2, (Math.sin(a) * it.depth) / 2);
  });
}

/** Насколько выпуклые многоугольники заходят друг на друга: наименьшее перекрытие по осям; ≤ 0 — не касаются. */
export function overlapDepth(a: Point[], b: Point[]): number {
  let depth = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub(poly[(i + 1) % poly.length]!, poly[i]!);
      if (len(e) < 1e-9) continue;
      const n = norm(perp(e));
      const pa = a.map((p) => dot(p, n));
      const pb = b.map((p) => dot(p, n));
      depth = Math.min(depth, Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)));
      if (depth <= 0) return depth;
    }
  }
  return depth;
}

/** Прямоугольник стены: от узла до узла, от правой грани до левой. Срезы углов не нужны — они снаружи комнат. */
export function wallRect(project: Project, w: Wall): Point[] {
  const a = project.nodes[w.a]!;
  const b = project.nodes[w.b]!;
  const n = perp(norm(sub(b, a)));
  const [r, l] = wallOffsets(w);
  return [add(a, mul(n, r)), add(b, mul(n, r)), add(b, mul(n, l)), add(a, mul(n, l))];
}

/** Предметы, которые заходят на стену или друг на друга (если и по высоте пересекаются). Ковры не считаются. */
export function badItems(project: Project, isRound: IsRound = square): Set<Id> {
  const bad = new Set<Id>();
  const items = Object.values(project.items).filter((it) => it.height >= FLAT);
  const shapes = items.map((it) => itemOutline(it, isRound(it)));
  const walls = Object.values(project.walls).map((w) => ({ h: wallHeight(project, w), poly: wallRect(project, w) }));
  items.forEach((it, i) => {
    if (walls.some((w) => it.elevation < w.h - TOUCH && overlapDepth(shapes[i]!, w.poly) > TOUCH)) bad.add(it.id);
    for (let j = i + 1; j < items.length; j++) {
      const o = items[j]!;
      const sameHeight =
        Math.min(it.elevation + it.height, o.elevation + o.height) - Math.max(it.elevation, o.elevation) > TOUCH;
      if (sameHeight && overlapDepth(shapes[i]!, shapes[j]!) > TOUCH) {
        bad.add(it.id);
        bad.add(o.id);
      }
    }
  });
  return bad;
}

/** Грань, к которой прилипает предмет: отрезок p0–p1 и нормаль наружу (от стены или соседнего предмета). */
interface Face {
  p0: Point;
  p1: Point;
  n: Point;
}

function wallFaces(project: Project): Face[] {
  return Object.values(project.walls).flatMap((w) => {
    const a = project.nodes[w.a]!;
    const b = project.nodes[w.b]!;
    const n = perp(norm(sub(b, a)));
    const [r, l] = wallOffsets(w);
    return [
      { p0: add(a, mul(n, l)), p1: add(b, mul(n, l)), n },
      { p0: add(a, mul(n, r)), p1: add(b, mul(n, r)), n: mul(n, -1) },
    ];
  });
}

function itemFaces(project: Project, skip: Id, isRound: IsRound): Face[] {
  return Object.values(project.items)
    .filter((o) => o.id !== skip && o.height >= FLAT && !isRound(o))
    .flatMap((o) => {
      const c = itemCorners(o);
      // углы идут по часовой на экране: наружу — против perp
      return c.map((p0, i) => {
        const p1 = c[(i + 1) % 4]!;
        return { p0, p1, n: mul(perp(norm(sub(p1, p0))), -1) };
      });
    });
}

/**
 * Прилипание: если сторона предмета ближе tol к параллельной грани стены или соседа, предмет встаёт к ней вплотную.
 * По каждой оси предмета — к своей ближайшей грани, поэтому в углу он прилипает к обеим стенам. Возвращает новый центр.
 */
export function snapItem(project: Project, it: Item, tol: number, isRound: IsRound = square): Point {
  const { u, v } = itemAxes(it);
  const corners = itemCorners(it);
  const c = { x: it.x, y: it.y };
  const best = [
    { gap: Infinity, shift: { x: 0, y: 0 } },
    { gap: Infinity, shift: { x: 0, y: 0 } },
  ]; // по u и по v
  for (const f of [...wallFaces(project), ...itemFaces(project, it.id, isRound)]) {
    const k = Math.abs(cross(f.n, u)) < PARALLEL ? 0 : Math.abs(cross(f.n, v)) < PARALLEL ? 1 : -1;
    if (k < 0) continue;
    const length = len(sub(f.p1, f.p0));
    if (length < 1e-6) continue;
    const dir = mul(sub(f.p1, f.p0), 1 / length);
    // предмет должен стоять напротив грани, а не на её продолжении, и центром — с наружной стороны
    const along = corners.map((p) => dot(sub(p, f.p0), dir));
    if (Math.max(...along) <= TOUCH || Math.min(...along) >= length - TOUCH || dot(sub(c, f.p0), f.n) <= 0) continue;
    const gap = Math.min(...corners.map((p) => dot(sub(p, f.p0), f.n)));
    if (Math.abs(gap) > tol || Math.abs(gap) >= Math.abs(best[k]!.gap)) continue;
    best[k] = { gap, shift: mul(f.n, -gap) };
  }
  const p = best.reduce((q, b) => (b.gap === Infinity ? q : add(q, b.shift)), c);
  return { x: round(p.x), y: round(p.y) };
}

/**
 * Где встанет новый предмет у курсора p. Если стена ближе reach (от курсора до грани, плюс полглубины), предмет
 * разворачивается к ней спинкой и встаёт вплотную; потом прилипает к соседним стенам и мебели.
 */
export function placeItem(
  project: Project,
  draft: ItemDraft,
  p: Point,
  o: { againstWall: boolean; reach: number; tol: number; isRound?: IsRound },
): Item {
  const it: Item = { ...draft, id: "", x: round(p.x), y: round(p.y) };
  if (o.againstWall) {
    let best: { d: number; f: Face } | null = null;
    for (const f of wallFaces(project)) {
      const length = len(sub(f.p1, f.p0));
      if (length < 1e-6) continue;
      const t = dot(sub(p, f.p0), mul(sub(f.p1, f.p0), 1 / length));
      const d = dot(sub(p, f.p0), f.n);
      if (t < 0 || t > length || d <= 0 || d > o.reach + it.depth / 2) continue;
      if (!best || d < best.d) best = { d, f };
    }
    if (best) {
      const n = best.f.n;
      it.rotation = normalizeRotation((Math.atan2(-n.x, n.y) * 180) / Math.PI); // ось «спинка → перед» смотрит от стены
      const c = add(sub(p, mul(n, best.d)), mul(n, it.depth / 2));
      it.x = round(c.x);
      it.y = round(c.y);
    }
  }
  return { ...it, ...snapItem(project, it, o.tol, o.isRound) };
}

/** Расстояние от стороны предмета до ближайшей стены или мебели: от середины стороны (from) до препятствия (to). */
export interface Gap {
  from: Point;
  to: Point;
  d: number;
}

/**
 * Проходы вокруг предмета: от середины каждой стороны наружу, до ближайшей грани стены или предмета на той же высоте
 * (круглого — по его рамке). Вплотную и дальше max — не показываются.
 */
export function itemGaps(project: Project, it: Item, max = 6): Gap[] {
  const { u, v } = itemAxes(it);
  const level = (o: Item) =>
    Math.min(it.elevation + it.height, o.elevation + o.height) - Math.max(it.elevation, o.elevation) > TOUCH;
  const others = { ...project, items: Object.fromEntries(Object.entries(project.items).filter(([, o]) => level(o))) };
  const faces = [...wallFaces(project), ...itemFaces(others, it.id, square)];
  const sides: [Point, Point][] = [
    [itemPoint(it, -it.width / 2, 0), mul(u, -1)],
    [itemPoint(it, it.width / 2, 0), u],
    [itemPoint(it, 0, -it.depth / 2), mul(v, -1)],
    [itemPoint(it, 0, it.depth / 2), v],
  ];
  const gaps: Gap[] = [];
  for (const [from, dir] of sides) {
    let best = max;
    for (const f of faces) {
      if (dot(f.n, dir) >= 0) continue; // грань смотрит не на предмет
      const e = sub(f.p1, f.p0);
      const den = cross(dir, e);
      if (Math.abs(den) < 1e-9) continue;
      const w = sub(f.p0, from);
      const t = cross(w, e) / den;
      const s = cross(w, dir) / den;
      if (s >= 0 && s <= 1 && t > -TOUCH && t < best) best = t;
    }
    if (best < max && best > TOUCH) gaps.push({ from, to: add(from, mul(dir, best)), d: round(best) });
  }
  return gaps;
}

/** Какой край стоит при новом размере: −1 — левый (по ширине) или спинка (по глубине), 0 — середина, 1 — правый или перед. */
export type Anchor = -1 | 0 | 1;

/**
 * Новые размеры. С сохранением пропорций и одним заданным размером все три меняются в одно число раз;
 * заданные разом несколько размеров ставятся как есть. По умолчанию стоят середина ширины и спинка:
 * предмет у стены от неё не отходит.
 */
export function resizeItem(
  it: Item,
  size: Partial<Pick<Item, "width" | "depth" | "height">>,
  anchor: { u: Anchor; v: Anchor } = { u: 0, v: -1 },
): void {
  let width = size.width ?? it.width;
  let depth = size.depth ?? it.depth;
  let height = size.height ?? it.height;
  if (it.lock && [size.width, size.depth, size.height].filter((v) => v !== undefined).length === 1) {
    const k =
      size.width !== undefined
        ? size.width / it.width
        : size.depth !== undefined
          ? size.depth / it.depth
          : height / it.height;
    width = it.width * k;
    depth = it.depth * k;
    height = it.height * k;
  }
  width = Math.max(MIN_ITEM, round(width));
  depth = Math.max(MIN_ITEM, round(depth));
  height = Math.max(MIN_ITEM, round(height));
  // край anchor стоит — центр уходит на половину прироста в другую сторону
  const { u, v } = itemAxes(it);
  const c = add(
    { x: it.x, y: it.y },
    add(mul(u, (-anchor.u * (width - it.width)) / 2), mul(v, (-anchor.v * (depth - it.depth)) / 2)),
  );
  Object.assign(it, { width, depth, height, x: round(c.x), y: round(c.y) });
}

/** Во сколько раз уменьшить размеры из файла модели, чтобы вышли метры: модели часто сохраняют в сантиметрах или миллиметрах. */
export function guessUnit(largest: number): 1 | 100 | 1000 {
  return largest <= 10 ? 1 : largest <= 1000 ? 100 : 1000;
}

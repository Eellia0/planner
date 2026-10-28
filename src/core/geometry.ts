import type { Id, Point, Project, Room, Wall } from './types';

// ---------- векторы ----------
export const add = (p: Point, q: Point): Point => ({ x: p.x + q.x, y: p.y + q.y });
export const sub = (p: Point, q: Point): Point => ({ x: p.x - q.x, y: p.y - q.y });
export const mul = (p: Point, k: number): Point => ({ x: p.x * k, y: p.y * k });
export const len = (p: Point): number => Math.hypot(p.x, p.y);
export const dist = (p: Point, q: Point): number => len(sub(p, q));
export const cross = (p: Point, q: Point): number => p.x * q.y - p.y * q.x;
/** Нормаль «влево» от направления: (-dy, dx). */
export const perp = (p: Point): Point => ({ x: -p.y, y: p.x });
export function norm(p: Point): Point {
  const l = len(p);
  return l > 0 ? { x: p.x / l, y: p.y / l } : { x: 0, y: 0 };
}

/** Точка пересечения прямых p + s·d и q + t·e или null, если они почти параллельны. */
export function intersect(p: Point, d: Point, q: Point, e: Point): Point | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const s = cross(sub(q, p), e) / den;
  return add(p, mul(d, s));
}

// ---------- стены ----------
export function wallLength(project: Project, wall: Wall): number {
  return dist(project.nodes[wall.a]!, project.nodes[wall.b]!);
}

/** Смещения граней стены от её линии вдоль нормали «влево» от a к b: [правая грань, левая грань]. */
export function wallOffsets(wall: Wall): [number, number] {
  const t = wall.thickness;
  if (wall.side === 1) return [0, t];
  if (wall.side === -1) return [-t, 0];
  return [-t / 2, t / 2];
}

interface WallEnd {
  wall: Wall;
  /** Направление стены от узла наружу. */
  dir: Point;
  /** Смещения граней в системе этого направления: правая (меньшее) и левая (большее). */
  right: number;
  left: number;
}

function endAt(project: Project, wall: Wall, nodeId: Id): WallEnd {
  const a = project.nodes[wall.a]!, b = project.nodes[wall.b]!;
  const [o1, o2] = wallOffsets(wall);
  if (wall.a === nodeId) return { wall, dir: norm(sub(b, a)), right: o1, left: o2 };
  // у узла b направление обратное, значит и «лево» с «право» меняются местами
  return { wall, dir: norm(sub(a, b)), right: -o2, left: -o1 };
}

/** Самый длинный допустимый выступ угла «на ус» — в толщинах стены. Острее — обрезаем прямо. */
const MAX_MITER = 4;

/**
 * Углы стены у узла: точки её правой и левой граней (в системе направления от узла).
 * Стены, сходящиеся в узле, сортируются по кругу; левая грань каждой встречается с правой гранью следующей.
 */
function cornersAt(project: Project, wall: Wall, nodeId: Id): { right: Point; left: Point } {
  const node = project.nodes[nodeId]!;
  const ends = Object.values(project.walls)
    .filter(w => w.a === nodeId || w.b === nodeId)
    .map(w => endAt(project, w, nodeId))
    .sort((p, q) => Math.atan2(p.dir.y, p.dir.x) - Math.atan2(q.dir.y, q.dir.x));
  const i = ends.findIndex(e => e.wall.id === wall.id);
  const me = ends[i]!;
  const n = perp(me.dir);
  const plain = { right: add(node, mul(n, me.right)), left: add(node, mul(n, me.left)) };
  if (ends.length < 2) return plain;

  const next = ends[(i + 1) % ends.length]!;
  const prev = ends[(i - 1 + ends.length) % ends.length]!;
  const limit = MAX_MITER * Math.max(me.wall.thickness, 0.01);
  const miter = (myOffset: number, other: WallEnd, otherOffset: number, fallback: Point): Point => {
    const p = add(node, mul(n, myOffset));
    const q = add(node, mul(perp(other.dir), otherOffset));
    const x = intersect(p, me.dir, q, other.dir);
    return x && dist(x, node) <= limit ? x : fallback;
  };
  return {
    left: miter(me.left, next, next.right, plain.left),
    right: miter(me.right, prev, prev.left, plain.right),
  };
}

/** Контур стены на плане (4 точки по кругу) с подрезкой углов по соседним стенам. */
export function wallOutline(project: Project, wall: Wall): Point[] {
  const atA = cornersAt(project, wall, wall.a);
  const atB = cornersAt(project, wall, wall.b);
  // у узла a «право» — со стороны меньшего смещения, у узла b — наоборот
  return [atA.right, atB.left, atB.right, atA.left];
}

// ---------- комнаты ----------
export function roomPolygon(project: Project, room: Room): Point[] {
  return room.nodes.map(id => project.nodes[id]!);
}

/** Площадь со знаком (формула Гаусса). Больше нуля — внутренность по левую руку от обхода. */
export function signedArea(poly: Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export function centroid(poly: Point[]): Point {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-9) {
    const s = poly.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
    return mul(s, 1 / Math.max(poly.length, 1));
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Найти стену между двумя узлами, в любом направлении. */
export function wallBetween(project: Project, u: Id, v: Id): Wall | undefined {
  return Object.values(project.walls).find(w => (w.a === u && w.b === v) || (w.a === v && w.b === u));
}

/** Комнаты, которым принадлежит стена. */
export function roomsOfWall(project: Project, wall: Wall): Room[] {
  return Object.values(project.rooms).filter(r =>
    r.nodes.some((id, i) => {
      const next = r.nodes[(i + 1) % r.nodes.length]!;
      return (id === wall.a && next === wall.b) || (id === wall.b && next === wall.a);
    }),
  );
}

/** Сторона «внутрь комнаты» для стены: 1 — слева от a→b, -1 — справа. */
export function interiorSide(project: Project, room: Room, wall: Wall): 1 | -1 {
  const ccw = signedArea(roomPolygon(project, room)) > 0; // внутренность слева от обхода
  const i = room.nodes.indexOf(wall.a);
  const forward = room.nodes[(i + 1) % room.nodes.length] === wall.b; // стена идёт по обходу
  return ccw === forward ? 1 : -1;
}

export function bounds(points: Point[]): { min: Point; max: Point } | null {
  if (!points.length) return null;
  const min = { x: Infinity, y: Infinity }, max = { x: -Infinity, y: -Infinity };
  for (const p of points) {
    min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y);
    max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y);
  }
  return { min, max };
}

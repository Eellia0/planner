// Проёмы: окна, двери, проходы. Проём лежит на стене: offset — от узла a вдоль линии стены до ближнего края.
// Здесь же куски стены вокруг проёмов для 3D: стена режется на части, без булевых операций.
import { dot, interiorSide, norm, roomsOfWall, sub, wallLength, wallOutline } from './geometry';
import { newId, type Id, type Opening, type OpeningKind, type Point, type Project, type Wall } from './types';
import { round } from './units';

/** Размеры нового проёма по виду. Окно и дверь — как в kvartira, балконная дверь выше обычной. */
export const KIND_DEFAULTS: Record<OpeningKind, { width: number; height: number; sill: number }> = {
  window: { width: 1.2, height: 1.5, sill: 0.85 },
  panorama: { width: 2.4, height: 2.4, sill: 0 },
  door: { width: 0.8, height: 2.0, sill: 0 },
  balcony: { width: 0.75, height: 2.2, sill: 0 },
  passage: { width: 0.9, height: 2.1, sill: 0 },
};
export const KIND_NAMES: Record<OpeningKind, string> = {
  window: 'Окно', panorama: 'Панорамное окно', door: 'Дверь', balcony: 'Балконная дверь', passage: 'Проём',
};
export const MIN_OPENING = 0.3;

export const isWindow = (kind: OpeningKind) => kind === 'window' || kind === 'panorama';
/** Проём с полотном, которое открывается: дуга на плане, петли и сторона открывания. */
export const hasLeaf = (kind: OpeningKind) => kind === 'door' || kind === 'balcony';

/** Самая широкая створка: шире — окно делится на створки поровну. */
const MAX_SASH: Partial<Record<OpeningKind, number>> = { window: 0.9, panorama: 1.2 };

/** Сколько створок у окна: узкое — одна, шире 0,9 м — две, шире 1,8 — три и т. д. У остальных проёмов — 1. */
export function sashCount(o: Pick<Opening, 'kind' | 'width'>): number {
  const max = MAX_SASH[o.kind];
  return max ? Math.max(1, Math.ceil(o.width / max - 1e-6)) : 1;
}

export function wallHeight(project: Project, wall: Wall): number {
  return wall.height ?? project.ceilingHeight;
}

export function openingsOfWall(project: Project, wallId: Id): Opening[] {
  return Object.values(project.openings).filter(o => o.wall === wallId);
}

/** Сдвиг проёма в пределах стены, с точностью до сантиметра. */
export function clampOffset(offset: number, width: number, length: number): number {
  return Math.round(Math.min(Math.max(0, offset), Math.max(0, length - width)) * 100) / 100;
}

/** Высота и низ проёма, чтобы он помещался в стену по высоте. */
function fitHeight(o: Opening, wallH: number) {
  o.sill = round(Math.min(Math.max(0, o.sill), Math.max(0, wallH - 0.1)));
  o.height = round(Math.min(Math.max(0.1, o.height), wallH - o.sill));
}

/** Новый проём вида kind с серединой в center (м от узла a), в проект не кладётся. Дверь открывается внутрь комнаты. */
export function newOpening(project: Project, wallId: Id, kind: OpeningKind, center: number): Opening {
  const wall = project.walls[wallId]!;
  const length = wallLength(project, wall);
  const d = KIND_DEFAULTS[kind];
  const width = round(Math.min(d.width, length));
  const rooms = roomsOfWall(project, wall);
  const o: Opening = {
    id: newId(), wall: wallId, kind, width, height: d.height, sill: d.sill,
    offset: clampOffset(center - width / 2, width, length),
    hinge: 'a',
    swing: rooms.length === 1 ? interiorSide(project, rooms[0]!, wall) : 1,
  };
  fitHeight(o, wallHeight(project, wall));
  return o;
}

/** Поставить проём на стену (см. newOpening). */
export function addOpening(project: Project, wallId: Id, kind: OpeningKind, center: number): Id {
  const o = newOpening(project, wallId, kind, center);
  project.openings[o.id] = o;
  return o.id;
}

/** Сменить вид: высота и подоконник — по умолчанию нового вида, ширина остаётся. */
export function setOpeningKind(project: Project, o: Opening, kind: OpeningKind): void {
  if (o.kind === kind) return;
  o.kind = kind;
  o.height = KIND_DEFAULTS[kind].height;
  o.sill = KIND_DEFAULTS[kind].sill;
  const wall = project.walls[o.wall];
  if (wall) fitHeight(o, wallHeight(project, wall));
}

/** Проёмы, которые вылезают за стену (по длине или высоте) или накладываются друг на друга — их подсвечиваем красным. */
export function badOpenings(project: Project): Set<Id> {
  const bad = new Set<Id>();
  const byWall = new Map<Id, Opening[]>();
  for (const o of Object.values(project.openings)) {
    const wall = project.walls[o.wall];
    if (!wall) continue;
    const eps = 0.0005;
    if (o.offset < -eps || o.offset + o.width > wallLength(project, wall) + eps || o.sill + o.height > wallHeight(project, wall) + eps) bad.add(o.id);
    byWall.set(o.wall, [...(byWall.get(o.wall) ?? []), o]);
  }
  for (const list of byWall.values()) {
    list.sort((p, q) => p.offset - q.offset);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!, cur = list[i]!;
      if (cur.offset < prev.offset + prev.width - 0.0005) { bad.add(prev.id); bad.add(cur.id); }
    }
  }
  return bad;
}

// ---------- обслуживание при правке стен ----------
/** Стена развернулась (a↔b): проём меряется от другого конца, петли и открывание — зеркально. */
export function flipOpening(o: Opening, length: number): void {
  o.offset = round(length - o.offset - o.width);
  o.hinge = o.hinge === 'a' ? 'b' : 'a';
  o.swing = o.swing === 1 ? -1 : 1;
}

/** Стену разрезали в точке на расстоянии at от a; часть после разреза — стена rest. Проём уходит туда, где его середина. */
export function splitOpenings(project: Project, wallId: Id, rest: Id, at: number): void {
  for (const o of openingsOfWall(project, wallId)) {
    if (o.offset + o.width / 2 > at) { o.wall = rest; o.offset = round(o.offset - at); }
  }
}

/** Проёмы стен, которых больше нет. */
export function dropOrphanOpenings(project: Project): void {
  for (const o of Object.values(project.openings)) if (!project.walls[o.wall]) delete project.openings[o.id];
}

// ---------- куски стены для 3D ----------
export interface WallPiece {
  /** Контур куска на плане. */
  poly: Point[];
  h0: number;
  h1: number;
}

/** Часть многоугольника, где u = (p − a)·dir лежит в [lo, hi] (отсечение Сазерленда — Ходжмана по двум прямым). */
function clipAlong(poly: Point[], a: Point, dir: Point, lo: number, hi: number): Point[] {
  const u = (p: Point) => dot(sub(p, a), dir);
  const cut = (pts: Point[], keep: (v: number) => boolean, edge: number): Point[] => {
    const out: Point[] = [];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      const up = u(p), uq = u(q);
      if (keep(up)) out.push(p);
      if (keep(up) !== keep(uq)) {
        const t = (edge - up) / (uq - up);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    });
    return out;
  };
  let out = poly;
  if (lo > -Infinity) out = cut(out, v => v >= lo, lo);
  if (hi < Infinity) out = cut(out, v => v <= hi, hi);
  return out;
}

/**
 * Стена кусками вокруг проёмов. Вдоль стены она делится по краям проёмов; на каждом участке остаётся
 * то, что выше и ниже вырезов. Крайние участки сохраняют углы «на ус» — режутся только с одной стороны.
 */
export function wallPieces(project: Project, wall: Wall): WallPiece[] {
  const outline = wallOutline(project, wall);
  const H = wallHeight(project, wall);
  const length = wallLength(project, wall);
  const rects = openingsOfWall(project, wall.id)
    .map(o => ({ u0: Math.max(0, o.offset), u1: Math.min(length, o.offset + o.width), h0: Math.max(0, o.sill), h1: Math.min(H, o.sill + o.height) }))
    .filter(r => r.u1 - r.u0 > 0.001 && r.h1 - r.h0 > 0.001);
  if (!rects.length) return [{ poly: outline, h0: 0, h1: H }];

  const a = project.nodes[wall.a]!, dir = norm(sub(project.nodes[wall.b]!, a));
  const cuts = [...new Set(rects.flatMap(r => [r.u0, r.u1]))].filter(u => u > 0.0005 && u < length - 0.0005).sort((p, q) => p - q);
  const bounds = [0, ...cuts, length];
  const pieces: WallPiece[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const lo = bounds[k]!, hi = bounds[k + 1]!, mid = (lo + hi) / 2;
    // вырезы на этом участке по высоте, слитые
    const holes = rects.filter(r => r.u0 <= mid && r.u1 >= mid).map(r => [r.h0, r.h1] as const).sort((p, q) => p[0] - q[0]);
    const solid: [number, number][] = [];
    let h = 0;
    for (const [h0, h1] of holes) {
      if (h0 > h + 0.0005) solid.push([h, h0]);
      h = Math.max(h, h1);
    }
    if (H > h + 0.0005) solid.push([h, H]);
    if (!solid.length) continue;
    const poly = clipAlong(outline, a, dir, k === 0 ? -Infinity : lo, k === bounds.length - 2 ? Infinity : hi);
    if (poly.length < 3) continue;
    for (const [h0, h1] of solid) pieces.push({ poly, h0, h1 });
  }
  return pieces;
}

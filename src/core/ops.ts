// Операции над проектом. Меняют проект на месте — в хранилище их вызывают внутри immer, поэтому это безопасно.
import {
  add, dist, dot, interiorSide, mul, norm, pointInPolygon, roomPolygon, roomsOfWall, segmentParam, signedArea, STRAIGHT, sub, wallBetween,
} from './geometry';
import { newId, type Id, type Point, type Project, type Room, type Wall, type WallSide } from './types';
import { round } from './units';

/** Узел ближе tol к точке или undefined. */
export function nodeNear(project: Project, p: Point, tol: number): Id | undefined {
  let best: Id | undefined, bestD = tol;
  for (const n of Object.values(project.nodes)) {
    const d = dist(n, p);
    if (d <= bestD) { best = n.id; bestD = d; }
  }
  return best;
}

export function addNode(project: Project, p: Point): Id {
  const id = newId();
  project.nodes[id] = { id, x: round(p.x), y: round(p.y) };
  return id;
}

/** Стена между двумя узлами. Если такая уже есть — возвращает её, вторую не создаёт. */
export function addWall(project: Project, a: Id, b: Id, side: WallSide = -1): Id {
  const existing = wallBetween(project, a, b);
  if (existing) return existing.id;
  const id = newId();
  project.walls[id] = { id, a, b, thickness: project.defaultThickness, side };
  return id;
}

/** Замкнуть контур в комнату: толщина всех её стен разворачивается наружу, линия стены — внутренняя сторона. */
export function addRoom(project: Project, nodes: Id[], name?: string): Id {
  const room = newRoom(project, nodes, name);
  for (let i = 0; i < nodes.length; i++) {
    const wall = wallBetween(project, nodes[i]!, nodes[(i + 1) % nodes.length]!);
    // общую стену с другой комнатой не трогаем: её толщина уже выбрана для соседа
    if (wall && roomsOfWall(project, wall).length === 1) wall.side = (-interiorSide(project, room, wall)) as WallSide;
  }
  return room.id;
}

/** Комната без правки стен. */
function newRoom(project: Project, nodes: Id[], name?: string): Room {
  const id = newId();
  const room = { id, name: name ?? `Комната ${Object.keys(project.rooms).length + 1}`, nodes: [...nodes] };
  project.rooms[id] = room;
  return room;
}

/**
 * Стена, к линии которой точка ближе tol (плюс толщина стены), и ближайшая точка на этой линии.
 * У самых концов стены не ищет — там угол, к нему прилипают отдельно. Стены узла skip пропускает.
 */
export function wallNear(project: Project, p: Point, tol: number, skip?: Id): { id: Id; p: Point } | undefined {
  let best: { id: Id; p: Point } | undefined, bestD = Infinity;
  for (const w of Object.values(project.walls)) {
    if (w.a === skip || w.b === skip) continue;
    const a = project.nodes[w.a]!, b = project.nodes[w.b]!;
    const q = add(a, mul(sub(b, a), segmentParam(a, b, p)));
    if (dist(q, a) < 0.005 || dist(q, b) < 0.005) continue;
    const d = dist(q, p);
    if (d <= tol + w.thickness && d < bestD) { best = { id: w.id, p: q }; bestD = d; }
  }
  return best;
}

/**
 * Т-стык: разбить стену узлом в точке p на две с той же толщиной и стороной.
 * Узел новый или переданный (перенесённый на стену угол). Комнаты с этой стеной получают узел в свой обход.
 */
export function splitWall(project: Project, wallId: Id, p: Point, nodeId?: Id): Id {
  const wall = project.walls[wallId]!;
  const id = nodeId ?? addNode(project, p);
  const a = wall.a, b = wall.b;
  for (const room of roomsOfWall(project, wall)) {
    const i = room.nodes.findIndex((u, k) => {
      const v = room.nodes[(k + 1) % room.nodes.length];
      return (u === a && v === b) || (u === b && v === a);
    });
    room.nodes.splice(i + 1, 0, id);
  }
  const id2 = newId();
  project.walls[id2] = { ...wall, id: id2, a: id, b };
  wall.b = id;
  return id;
}

/** Узлы комнаты по обходу от индекса i до j включительно. */
function walk(room: Room, i: number, j: number): Id[] {
  const out: Id[] = [];
  for (let k = i; ; k = (k + 1) % room.nodes.length) {
    out.push(room.nodes[k]!);
    if (k === j) return out;
  }
}

/**
 * Цепочка стен path соединила два узла контура одной комнаты.
 * Цепочка внутри комнаты — это перегородка: комната делится на две.
 * Снаружи — пристройка: новая комната из цепочки и общего с соседкой куска контура.
 * Возвращает id новой комнаты или undefined, если комната не получилась.
 */
export function roomByPath(project: Project, path: Id[]): Id | undefined {
  const u = path[0]!, v = path[path.length - 1]!;
  if (path.length < 2 || u === v) return;
  const candidates = Object.values(project.rooms).filter(r => {
    const i = r.nodes.indexOf(u), j = r.nodes.indexOf(v), n = r.nodes.length;
    // цепочка из одной стены вдоль контура — ничего не замыкает
    return i >= 0 && j >= 0 && !(path.length === 2 && ((i + 1) % n === j || (j + 1) % n === i));
  });
  const firstStep = mul(add(project.nodes[path[0]!]!, project.nodes[path[1]!]!), 0.5);
  const inner = candidates.find(r => pointInPolygon(firstStep, roomPolygon(project, r)));
  const room = inner ?? candidates[0];
  if (!room) return;

  const i = room.nodes.indexOf(u), j = room.nodes.indexOf(v);
  const one = [...path, ...walk(room, j, i).slice(1, -1)];
  const two = [...[...path].reverse(), ...walk(room, i, j).slice(1, -1)];
  const area = (ids: Id[]) => Math.abs(signedArea(ids.map(id => project.nodes[id]!)));
  if (area(one) < 1e-6 || area(two) < 1e-6) return;

  if (inner) {
    // стороны толщины не трогаем: у старых стен они уже выбраны, у перегородки — как нарисовали
    room.nodes = one;
    return newRoom(project, two).id;
  }
  // из двух контуров снаружи тот, что меньше, — новая комната (больший охватывает и соседнюю)
  return addRoom(project, area(one) < area(two) ? one : two);
}

/** Новая длина стены: узел a стоит, узел b сдвигается вдоль стены. Соседние стены b подстраиваются. */
export function setWallLength(project: Project, wall: Wall, length: number): void {
  const a = project.nodes[wall.a]!, b = project.nodes[wall.b]!;
  const dir = norm(sub(b, a));
  if (length <= 0 || (dir.x === 0 && dir.y === 0)) return;
  const p = add(a, mul(dir, length));
  b.x = round(p.x);
  b.y = round(p.y);
}

export function moveNode(project: Project, id: Id, p: Point): void {
  const n = project.nodes[id];
  if (!n) return;
  n.x = round(p.x);
  n.y = round(p.y);
}

/** Сдвинуть узлы на одно и то же смещение (перенос группы). */
export function moveNodes(project: Project, ids: Iterable<Id>, delta: Point): void {
  for (const id of new Set(ids)) {
    const n = project.nodes[id];
    if (n) { n.x = round(n.x + delta.x); n.y = round(n.y + delta.y); }
  }
}

/** Узлы выбранных стен. */
export function nodesOfWalls(project: Project, wallIds: Iterable<Id>): Id[] {
  const out = new Set<Id>();
  for (const id of wallIds) {
    const w = project.walls[id];
    if (w) { out.add(w.a); out.add(w.b); }
  }
  return [...out];
}

/**
 * Стены в рамке. Рамка слева направо — только целиком попавшие (оба конца внутри),
 * справа налево — все, которых рамка касается (хотя бы один конец внутри или отрезок пересекает рамку).
 */
export function wallsInRect(project: Project, p: Point, q: Point, crossing: boolean): Id[] {
  const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y);
  const inside = (n: Point) => n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1;
  const corners: Point[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const segCross = (a: Point, b: Point, c: Point, d: Point) => {
    const o = (p1: Point, p2: Point, p3: Point) => Math.sign((p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  };
  return Object.values(project.walls).filter(w => {
    const a = project.nodes[w.a]!, b = project.nodes[w.b]!;
    if (!crossing) return inside(a) && inside(b);
    if (inside(a) || inside(b)) return true;
    return corners.some((c, i) => segCross(a, b, c, corners[(i + 1) % 4]!));
  }).map(w => w.id);
}

/**
 * Удалить стены. Перегородка между двумя комнатами — комнаты сливаются в одну, иначе комната распадается.
 * Узлы без стен удаляются, а разрезанная Т-стыком стена снова становится целой.
 */
export function deleteWalls(project: Project, wallIds: Id[]): void {
  const ends = new Set<Id>();
  for (const wallId of wallIds) {
    const wall = project.walls[wallId];
    if (!wall) continue;
    const rooms = roomsOfWall(project, wall);
    delete project.walls[wallId];
    const merged = rooms.length === 2 ? mergedNodes(rooms[0]!, rooms[1]!, wall.a, wall.b) : null;
    if (merged) rooms[0]!.nodes = merged;
    for (const room of merged ? [rooms[1]!] : rooms) delete project.rooms[room.id];
    ends.add(wall.a);
    ends.add(wall.b);
  }
  // склеиваем, только когда удалено всё: иначе склейка поглотит стену, которую тоже просили удалить
  for (const id of ends) {
    const used = Object.values(project.walls).some(w => w.a === id || w.b === id);
    if (!used) delete project.nodes[id];
    else joinStraight(project, id);
  }
}

export function deleteWall(project: Project, wallId: Id): void {
  deleteWalls(project, [wallId]);
}

/** Обход общей комнаты, если убрать стену u–v между комнатами A и B. null — если остаётся «хвост» перегородки. */
function mergedNodes(A: Room, B: Room, u: Id, v: Id): Id[] | null {
  // путь по контуру от from до to в обход прямой стороны from–to
  const around = (room: Room, from: Id, to: Id): Id[] => {
    const n = room.nodes.length, i = room.nodes.indexOf(from), j = room.nodes.indexOf(to);
    return room.nodes[(i + 1) % n] === to ? walk(room, j, i).reverse() : walk(room, i, j);
  };
  const nodes = [...around(A, v, u), ...around(B, u, v).slice(1, -1)];
  return new Set(nodes).size === nodes.length ? nodes : null;
}

/** Узел посреди прямой стены из двух частей одинаковой толщины — убрать, части склеить. */
function joinStraight(project: Project, nodeId: Id): void {
  const at = Object.values(project.walls).filter(w => w.a === nodeId || w.b === nodeId);
  if (at.length !== 2) return;
  const [w1, w2] = at as [Wall, Wall];
  const n = project.nodes[nodeId]!;
  const x = w1.a === nodeId ? w1.b : w1.a, y = w2.a === nodeId ? w2.b : w2.a;
  const p = project.nodes[x]!, q = project.nodes[y]!;
  if (dot(norm(sub(p, n)), norm(sub(q, n))) > -STRAIGHT || w1.thickness !== w2.thickness) return;
  // стороны толщины в направлении x → n → y: у стены, нарисованной навстречу, сторона меняет знак
  const s1 = w1.b === nodeId ? w1.side : -w1.side;
  const s2 = w2.a === nodeId ? w2.side : -w2.side;
  if (s1 !== s2) return;
  w1.a = x;
  w1.b = y;
  w1.side = s1 as WallSide;
  delete project.walls[w2.id];
  delete project.nodes[nodeId];
  for (const room of Object.values(project.rooms)) room.nodes = room.nodes.filter(id => id !== nodeId);
}

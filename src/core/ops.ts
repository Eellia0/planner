// Операции над проектом. Меняют проект на месте — в хранилище их вызывают внутри immer, поэтому это безопасно.
import { add, dist, interiorSide, mul, norm, sub, wallBetween } from './geometry';
import { newId, type Id, type Point, type Project, type Wall, type WallSide } from './types';
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
  const id = newId();
  const room = { id, name: name ?? `Комната ${Object.keys(project.rooms).length + 1}`, nodes: [...nodes] };
  project.rooms[id] = room;
  for (let i = 0; i < nodes.length; i++) {
    const wall = wallBetween(project, nodes[i]!, nodes[(i + 1) % nodes.length]!);
    if (wall) wall.side = (-interiorSide(project, room, wall)) as WallSide;
  }
  return id;
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

/** Удалить стену. Комнаты, в которые она входила, распадаются; узлы без стен удаляются. */
export function deleteWall(project: Project, wallId: Id): void {
  const wall = project.walls[wallId];
  if (!wall) return;
  delete project.walls[wallId];
  for (const room of Object.values(project.rooms)) {
    const inRoom = room.nodes.some((id, i) => {
      const next = room.nodes[(i + 1) % room.nodes.length];
      return (id === wall.a && next === wall.b) || (id === wall.b && next === wall.a);
    });
    if (inRoom) delete project.rooms[room.id];
  }
  for (const id of [wall.a, wall.b]) {
    const used = Object.values(project.walls).some(w => w.a === id || w.b === id);
    if (!used) delete project.nodes[id];
  }
}

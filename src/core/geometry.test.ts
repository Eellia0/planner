import { describe, expect, it } from 'vitest';
import { roomInnerPolygon, roomPolygon, signedArea, wallLength, wallOutline } from './geometry';
import {
  addNode, addRoom, addWall, deleteWall, deleteWalls, moveNodes, nodesOfWalls, roomByPath, setWallLength, splitWall, wallNear, wallsInRect,
} from './ops';
import { emptyProject, type Project } from './types';

/** Комната по внутренним размерам: 6,55 × 3,40, стены 20 см. */
function room(): { project: Project; walls: string[] } {
  const project = emptyProject();
  project.defaultThickness = 0.2;
  const pts = [{ x: 0, y: 0 }, { x: 6.55, y: 0 }, { x: 6.55, y: 3.4 }, { x: 0, y: 3.4 }];
  const ids = pts.map(p => addNode(project, p));
  const walls = ids.map((id, i) => addWall(project, id, ids[(i + 1) % ids.length]!));
  addRoom(project, ids);
  return { project, walls };
}

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('комната из четырёх стен', () => {
  it('площадь считается по внутренней стороне', () => {
    const { project } = room();
    const r = Object.values(project.rooms)[0]!;
    near(Math.abs(signedArea(roomPolygon(project, r))), 6.55 * 3.4);
  });

  it('толщина уходит наружу, углы стыкуются «на ус»', () => {
    const { project, walls } = room();
    const top = project.walls[walls[0]!]!; // от (0,0) к (6,55; 0); комната ниже, при y вниз
    const pts = wallOutline(project, top);
    const ys = pts.map(p => p.y).sort((a, b) => a - b);
    near(ys[0]!, -0.2); // наружная грань на 20 см выше линии
    near(ys[3]!, 0);    // внутренняя грань — по линии
    const xs = pts.map(p => p.x).sort((a, b) => a - b);
    near(xs[0]!, -0.2); // снаружи угол доходит до наружной грани соседней стены
    near(xs[3]!, 6.75);
  });

  it('стены по центру тоже стыкуются без щелей', () => {
    const { project, walls } = room();
    for (const id of walls) project.walls[id]!.side = 0;
    const pts = wallOutline(project, project.walls[walls[0]!]!);
    const xs = pts.map(p => p.x).sort((a, b) => a - b);
    near(xs[0]!, -0.1);
    near(xs[1]!, 0.1);
  });
});

describe('правка', () => {
  it('новая длина сдвигает дальний угол', () => {
    const { project, walls } = room();
    const w = project.walls[walls[0]!]!;
    setWallLength(project, w, 7);
    near(wallLength(project, w), 7);
  });

  it('перенос группы сдвигает углы, комната сохраняет площадь', () => {
    const { project, walls } = room();
    moveNodes(project, nodesOfWalls(project, walls), { x: 1, y: -0.5 });
    const r = Object.values(project.rooms)[0]!;
    near(Math.abs(signedArea(roomPolygon(project, r))), 6.55 * 3.4);
    near(project.nodes[project.walls[walls[0]!]!.a]!.x, 1);
  });

  it('рамка: слева направо — целиком, справа налево — касание', () => {
    const { project } = room();
    // рамка вокруг верхней стены целиком
    expect(wallsInRect(project, { x: -1, y: -1 }, { x: 7, y: 1 }, false)).toHaveLength(1);
    // та же рамка «касанием» задевает ещё обе боковые стены
    expect(wallsInRect(project, { x: -1, y: -1 }, { x: 7, y: 1 }, true)).toHaveLength(3);
    // узкая рамка поперёк середины комнаты касается только боковых стен
    expect(wallsInRect(project, { x: -1, y: 1.5 }, { x: 8, y: 2 }, true)).toHaveLength(2);
  });

  it('удаление стены разбирает комнату', () => {
    const { project, walls } = room();
    deleteWall(project, walls[0]!);
    expect(Object.keys(project.rooms)).toHaveLength(0);
    expect(Object.keys(project.walls)).toHaveLength(3);
    expect(Object.keys(project.nodes)).toHaveLength(4);
  });
});

/** Площади комнат по внутренним граням, по возрастанию. */
const areas = (project: Project) =>
  Object.values(project.rooms).map(r => Math.abs(signedArea(roomInnerPolygon(project, r)))).sort((a, b) => a - b);

/** Перегородка 12 см поперёк комнаты на x = 3: от верхней стены к нижней. */
function partitioned() {
  const { project, walls } = room();
  project.defaultThickness = 0.12;
  const top = splitWall(project, walls[0]!, { x: 3, y: 0 });
  const bottom = splitWall(project, walls[2]!, { x: 3, y: 3.4 });
  const stem = addWall(project, top, bottom);
  roomByPath(project, [top, bottom]);
  return { project, walls, top, bottom, stem };
}

describe('Т-стыки', () => {
  it('стена разбивается узлом, комната сохраняет площадь', () => {
    const { project, walls } = room();
    const id = splitWall(project, walls[0]!, { x: 3, y: 0 });
    expect(Object.keys(project.walls)).toHaveLength(5);
    const r = Object.values(project.rooms)[0]!;
    expect(r.nodes).toContain(id);
    near(Math.abs(signedArea(roomPolygon(project, r))), 6.55 * 3.4);
  });

  it('сквозная стена режется прямо, примыкающая упирается в её грань', () => {
    const { project, walls } = room();
    const id = splitWall(project, walls[0]!, { x: 3, y: 0 });
    const stem = addWall(project, id, addNode(project, { x: 3, y: 2 }));
    // левая половина верхней стены кончается ровно на x = 3 обеими гранями — без дыры над перегородкой
    const half = wallOutline(project, project.walls[walls[0]!]!);
    expect(half.filter(p => Math.abs(p.x - 3) < 1e-9)).toHaveLength(2);
    // перегородка начинается от внутренней грани (линии) верхней стены
    const ys = wallOutline(project, project.walls[stem]!).map(p => p.y).sort((a, b) => a - b);
    near(ys[0]!, 0);
  });

  it('стену находит у курсора, но не у самого угла', () => {
    const { project } = room();
    const hit = wallNear(project, { x: 3, y: 0.05 }, 0.1);
    expect(hit).toBeDefined();
    near(hit!.p.y, 0);
    expect(wallNear(project, { x: 0.003, y: -0.002 }, 0.1)).toBeUndefined(); // в 3 мм от угла — это угол
  });

  it('перегородка делит комнату на две, площадь — без её толщины', () => {
    const { project } = partitioned();
    expect(Object.keys(project.rooms)).toHaveLength(2);
    const [left, right] = areas(project);
    near(left!, 3 * 3.4);
    near(right!, (6.55 - 3 - 0.12) * 3.4); // толщина перегородки ушла вправо от направления рисования
  });

  it('удалили перегородку — комнаты слились, стены снова целые', () => {
    const { project, stem } = partitioned();
    deleteWalls(project, [stem]);
    expect(Object.keys(project.rooms)).toHaveLength(1);
    expect(Object.keys(project.walls)).toHaveLength(4);
    expect(Object.keys(project.nodes)).toHaveLength(4);
    near(areas(project)[0]!, 6.55 * 3.4);
  });

  it('пристройка: цепочка снаружи от угла до угла даёт новую комнату с общей стеной', () => {
    const { project } = room();
    const [, c1, c2] = Object.values(project.rooms)[0]!.nodes; // (6,55; 0) и (6,55; 3,4)
    const p1 = addNode(project, { x: 9.55, y: 0 }), p2 = addNode(project, { x: 9.55, y: 3.4 });
    addWall(project, c1!, p1); addWall(project, p1, p2); addWall(project, p2, c2!);
    roomByPath(project, [c1!, p1, p2, c2!]);
    expect(Object.keys(project.rooms)).toHaveLength(2);
    // общая стена 20 см осталась толщиной в сторону новой комнаты — её площадь меньше на эту толщину
    near(areas(project)[0]!, (3 - 0.2) * 3.4);
  });
});

describe('пристройка к разделённой комнате', () => {
  it('новая комната появляется и тогда, когда соседка уже поделена перегородкой', () => {
    const { project } = partitioned();
    const right = Object.values(project.rooms).find(r => r.nodes.some(id => project.nodes[id]!.x === 6.55))!;
    const c1 = right.nodes.find(id => project.nodes[id]!.x === 6.55 && project.nodes[id]!.y === 0)!;
    const c2 = right.nodes.find(id => project.nodes[id]!.x === 6.55 && project.nodes[id]!.y === 3.4)!;
    const p1 = addNode(project, { x: 9.55, y: 0 }), p2 = addNode(project, { x: 9.55, y: 3.4 });
    addWall(project, c1, p1); addWall(project, p1, p2); addWall(project, p2, c2);
    roomByPath(project, [c1, p1, p2, c2]);
    expect(Object.keys(project.rooms)).toHaveLength(3);
  });
});

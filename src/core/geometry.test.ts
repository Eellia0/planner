import { describe, expect, it } from 'vitest';
import { roomPolygon, signedArea, wallLength, wallOutline } from './geometry';
import { addNode, addRoom, addWall, deleteWall, moveNodes, nodesOfWalls, setWallLength, wallsInRect } from './ops';
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

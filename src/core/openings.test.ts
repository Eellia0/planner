import { describe, expect, it } from 'vitest';
import { add, mul, norm, sub } from './geometry';
import { addOpening, badOpenings, sashCount, setOpeningKind, wallPieces } from './openings';
import * as ops from './ops';
import { projectFromFile, projectToFile } from './projectFile';
import { emptyProject, type Opening, type Project } from './types';

/** Комната 6,55 × 3,40, стены 20 см; стены по порядку: верх, право, низ, лево. */
function room(): { project: Project; walls: string[] } {
  const project = emptyProject();
  project.defaultThickness = 0.2;
  const ids = [{ x: 0, y: 0 }, { x: 6.55, y: 0 }, { x: 6.55, y: 3.4 }, { x: 0, y: 3.4 }].map(p => ops.addNode(project, p));
  const walls = ids.map((id, i) => ops.addWall(project, id, ids[(i + 1) % ids.length]!));
  ops.addRoom(project, ids);
  return { project, walls };
}

/** Где на плане середина проёма. */
function centerOf(project: Project, o: Opening) {
  const w = project.walls[o.wall]!, a = project.nodes[w.a]!, b = project.nodes[w.b]!;
  return add(a, mul(norm(sub(b, a)), o.offset + o.width / 2));
}

describe('створки окна', () => {
  it('узкое — одна, шире 0,9 — две, шире 1,8 — три; у панорамного створка до 1,2', () => {
    expect(sashCount({ kind: 'window', width: 0.6 })).toBe(1);
    expect(sashCount({ kind: 'window', width: 0.9 })).toBe(1);
    expect(sashCount({ kind: 'window', width: 0.91 })).toBe(2);
    expect(sashCount({ kind: 'window', width: 1.8 })).toBe(2);
    expect(sashCount({ kind: 'window', width: 2.1 })).toBe(3);
    expect(sashCount({ kind: 'panorama', width: 2.4 })).toBe(2);
    expect(sashCount({ kind: 'door', width: 2 })).toBe(1);
  });
});

describe('проём на стене', () => {
  it('встаёт серединой в точку клика, у края — впритык к концу стены', () => {
    const { project, walls } = room();
    const o = project.openings[addOpening(project, walls[0]!, 'window', 3)]!;
    expect(o.offset).toBeCloseTo(2.4, 6);
    expect([o.width, o.height, o.sill]).toEqual([1.2, 1.5, 0.85]);
    const edge = project.openings[addOpening(project, walls[0]!, 'door', 6.5)]!;
    expect(edge.offset).toBeCloseTo(6.55 - 0.8, 6);
  });

  it('дверь по умолчанию открывается внутрь комнаты', () => {
    const { project, walls } = room();
    const w = project.walls[walls[0]!]!;
    const o = project.openings[addOpening(project, w.id, 'door', 1)]!;
    expect(o.swing).toBe(-w.side); // толщина у комнаты наружу, значит внутрь — другая сторона
  });

  it('смена вида меняет высоту и подоконник, ширина остаётся', () => {
    const { project, walls } = room();
    const o = project.openings[addOpening(project, walls[0]!, 'window', 3)]!;
    setOpeningKind(project, o, 'panorama');
    expect([o.width, o.height, o.sill]).toEqual([1.2, 2.4, 0]);
  });

  it('на низкой стене проём ниже стены', () => {
    const { project, walls } = room();
    project.walls[walls[0]!]!.height = 1.2;
    const o = project.openings[addOpening(project, walls[0]!, 'window', 3)]!;
    expect(o.sill + o.height).toBeLessThanOrEqual(1.2 + 1e-9);
  });

  it('наложение и выход за стену подсвечиваются', () => {
    const { project, walls } = room();
    const a = addOpening(project, walls[0]!, 'window', 2);
    const b = addOpening(project, walls[0]!, 'window', 2.8);
    const c = addOpening(project, walls[0]!, 'window', 5);
    expect([...badOpenings(project)].sort()).toEqual([a, b].sort());
    project.openings[c]!.offset = 6;
    expect(badOpenings(project).has(c)).toBe(true);
  });
});

describe('куски стены в 3D', () => {
  it('окно: слева и справа до потолка, под ним и над ним', () => {
    const { project, walls } = room();
    addOpening(project, walls[0]!, 'window', 3);
    const pieces = wallPieces(project, project.walls[walls[0]!]!);
    expect(pieces.map(p => [p.h0, p.h1])).toEqual([[0, 2.7], [0, 0.85], [2.35, 2.7], [0, 2.7]]);
  });

  it('дверь до пола: под ней куска нет', () => {
    const { project, walls } = room();
    addOpening(project, walls[0]!, 'door', 3);
    expect(wallPieces(project, project.walls[walls[0]!]!).map(p => [p.h0, p.h1])).toEqual([[0, 2.7], [2, 2.7], [0, 2.7]]);
  });

  it('без проёмов — одна часть по контуру стены; своя высота стены', () => {
    const { project, walls } = room();
    project.walls[walls[1]!]!.height = 1.1;
    expect(wallPieces(project, project.walls[walls[1]!]!).map(p => [p.h0, p.h1])).toEqual([[0, 1.1]]);
  });
});

describe('проёмы при правке стен', () => {
  it('разрез стены: проём переходит на часть, где его середина, и стоит на месте', () => {
    const { project, walls } = room();
    const o = project.openings[addOpening(project, walls[0]!, 'window', 5)]!;
    const before = centerOf(project, o);
    ops.splitWall(project, walls[0]!, { x: 3, y: 0 });
    expect(o.wall).not.toBe(walls[0]);
    expect(centerOf(project, o)).toEqual(before);
  });

  it('удаление стены удаляет её проёмы', () => {
    const { project, walls } = room();
    addOpening(project, walls[0]!, 'window', 3);
    ops.deleteWalls(project, [walls[0]!]);
    expect(Object.keys(project.openings)).toHaveLength(0);
  });

  it('склейка после удаления перегородки: проёмы обеих половин на месте, у развёрнутой половины петли зеркально', () => {
    const { project, walls } = room();
    const n1 = ops.splitWall(project, walls[0]!, { x: 3, y: 0 });
    const n2 = ops.splitWall(project, walls[2]!, { x: 3, y: 3.4 });
    const part = ops.addWall(project, n1, n2);
    ops.roomByPath(project, [n1, n2]);
    const left = project.walls[walls[0]!]!;
    const right = Object.values(project.walls).find(w => w.a === n1 && w.id !== part)!;
    const d1 = project.openings[addOpening(project, left.id, 'door', 1)]!;
    const d2 = project.openings[addOpening(project, right.id, 'door', 2)]!;
    // развернём левую половину вместе с её проёмом, как если бы её нарисовали навстречу
    [left.a, left.b] = [left.b, left.a];
    left.side = (-left.side) as 1 | -1;
    d1.offset = 3 - d1.offset - d1.width; d1.hinge = 'b'; d1.swing = (-d1.swing) as 1 | -1;
    const c1 = centerOf(project, d1), c2 = centerOf(project, d2);
    const swing2 = d2.swing;
    ops.deleteWalls(project, [part]);
    expect(d1.wall).toBe(d2.wall);
    expect(centerOf(project, d1).x).toBeCloseTo(c1.x, 6);
    expect(centerOf(project, d2).x).toBeCloseTo(c2.x, 6);
    expect(d1.hinge).toBe('a'); // снова меряется в исходную сторону
    expect(d1.swing).toBe(swing2);
  });
});

describe('файл с проёмами', () => {
  it('проёмы и высота стены сохраняются, проём на несуществующей стене пропускается', () => {
    const { project, walls } = room();
    const id = addOpening(project, walls[0]!, 'balcony', 3);
    project.walls[walls[1]!]!.height = 1.1;
    project.openings.x = { ...project.openings[id]!, id: 'x', wall: 'нет' };
    const back = projectFromFile(projectToFile(project));
    expect(back.openings[id]).toEqual(project.openings[id]);
    expect(back.openings.x).toBeUndefined();
    expect(back.walls[walls[1]!]!.height).toBe(1.1);
  });

  it('старый файл без проёмов открывается', () => {
    const { project } = room();
    const old = JSON.parse(projectToFile(project));
    delete old.project.openings;
    expect(projectFromFile(JSON.stringify(old)).openings).toEqual({});
  });
});

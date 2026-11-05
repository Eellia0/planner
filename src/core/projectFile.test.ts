import { describe, expect, it } from 'vitest';
import * as ops from './ops';
import { fileName, projectFromFile, projectToFile } from './projectFile';
import { emptyProject } from './types';

function sample() {
  const p = emptyProject('Однушка');
  p.ceilingHeight = 2.65;
  const ids = [[0, 0], [3, 0], [3, 2], [0, 2]].map(([x, y]) => ops.addNode(p, { x: x!, y: y! }));
  ids.forEach((id, i) => ops.addWall(p, id, ids[(i + 1) % ids.length]!));
  ops.addRoom(p, ids);
  return p;
}

describe('файл проекта', () => {
  it('сохранение и загрузка дают тот же проект, но с новым id', () => {
    const p = sample();
    const back = projectFromFile(projectToFile(p));
    expect(back.id).not.toBe(p.id);
    expect({ ...back, id: '', updatedAt: 0 }).toEqual({ ...p, id: '', updatedAt: 0 });
  });

  it('не JSON, чужой JSON и файл новой версии — понятные ошибки', () => {
    expect(() => projectFromFile('PK\u0003\u0004')).toThrow('не JSON');
    expect(() => projectFromFile('{"a":1}')).toThrow('не файл проекта');
    expect(() => projectFromFile(JSON.stringify({ format: 'planner', version: 99, project: {} }))).toThrow('более новой');
  });

  it('стена на несуществующий угол — ошибка, а не сломанный план', () => {
    const p = sample();
    const w = Object.values(p.walls)[0]!;
    w.b = 'нет';
    expect(() => projectFromFile(projectToFile(p))).toThrow('повреждён');
  });

  it('битая комната пропускается, точки без стен убираются, пустая толщина — по умолчанию', () => {
    const p = sample();
    const room = Object.values(p.rooms)[0]!;
    room.nodes = [...room.nodes, 'нет'];
    ops.addNode(p, { x: 9, y: 9 });
    (Object.values(p.walls)[0] as { thickness: unknown }).thickness = null;
    const back = projectFromFile(projectToFile(p));
    expect(Object.keys(back.rooms)).toHaveLength(0);
    expect(Object.keys(back.nodes)).toHaveLength(4);
    expect(Object.values(back.walls)[0]!.thickness).toBe(p.defaultThickness);
  });

  it('имя файла без запрещённых знаков', () => {
    const p = emptyProject('Квартира: план "А"/2');
    expect(fileName(p)).toBe('Квартира план А 2.planner.json');
    expect(fileName(emptyProject('  '))).toBe('Проект.planner.json');
  });
});

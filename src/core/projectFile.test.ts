import { describe, expect, it } from "vitest";
import * as ops from "./ops";
import { fileName, fromBase64, parseProjectFile, projectFromFile, projectToFile, toBase64 } from "./projectFile";
import { emptyProject } from "./types";

function sample() {
  const p = emptyProject("Однушка");
  p.ceilingHeight = 2.65;
  const ids = [
    [0, 0],
    [3, 0],
    [3, 2],
    [0, 2],
  ].map(([x, y]) => ops.addNode(p, { x: x!, y: y! }));
  ids.forEach((id, i) => ops.addWall(p, id, ids[(i + 1) % ids.length]!));
  ops.addRoom(p, ids);
  return p;
}

describe("файл проекта", () => {
  it("сохранение и загрузка дают тот же проект, но с новым id", () => {
    const p = sample();
    const back = projectFromFile(projectToFile(p));
    expect(back.id).not.toBe(p.id);
    expect({ ...back, id: "", updatedAt: 0 }).toEqual({ ...p, id: "", updatedAt: 0 });
  });

  it("не JSON, чужой JSON и файл новой версии — понятные ошибки", () => {
    expect(() => projectFromFile("PK\u0003\u0004")).toThrow("не JSON");
    expect(() => projectFromFile('{"a":1}')).toThrow("не файл проекта");
    expect(() => projectFromFile(JSON.stringify({ format: "planner", version: 99, project: {} }))).toThrow(
      "более новой",
    );
  });

  it("стена на несуществующий угол — ошибка, а не сломанный план", () => {
    const p = sample();
    const w = Object.values(p.walls)[0]!;
    w.b = "нет";
    expect(() => projectFromFile(projectToFile(p))).toThrow("повреждён");
  });

  it("битая комната пропускается, точки без стен убираются, пустая толщина — по умолчанию", () => {
    const p = sample();
    const room = Object.values(p.rooms)[0]!;
    room.nodes = [...room.nodes, "нет"];
    ops.addNode(p, { x: 9, y: 9 });
    (Object.values(p.walls)[0] as { thickness: unknown }).thickness = null;
    const back = projectFromFile(projectToFile(p));
    expect(Object.keys(back.rooms)).toHaveLength(0);
    expect(Object.keys(back.nodes)).toHaveLength(4);
    expect(Object.values(back.walls)[0]!.thickness).toBe(p.defaultThickness);
  });

  it("имя файла без запрещённых знаков", () => {
    const p = emptyProject('Квартира: план "А"/2');
    expect(fileName(p)).toBe("Квартира план А 2.planner.json");
    expect(fileName(emptyProject("  "))).toBe("Проект.planner.json");
  });
});

describe("файл проекта: цвет", () => {
  it("цвет граней сохраняется, чужая строка вместо цвета отбрасывается", () => {
    const p = sample();
    const [w1, w2] = Object.values(p.walls);
    w1!.paintLeft = "#A2AC96";
    (w2 as unknown as { paintRight: string }).paintRight = "red; drop";
    const back = projectFromFile(projectToFile(p));
    expect(back.walls[w1!.id]!.paintLeft).toBe("#A2AC96");
    expect(back.walls[w2!.id]!.paintRight).toBeUndefined();
  });
});

describe("файл проекта: мебель и свои модели", () => {
  it("мебель и модели сохраняются и читаются, данные модели — те же байты", () => {
    const p = sample();
    p.items.a = {
      id: "a",
      type: "bed",
      name: "Кровать",
      x: 1,
      y: 1.06,
      rotation: 0,
      width: 1.72,
      depth: 2.12,
      height: 1.18,
      elevation: 0,
      lock: false,
      color: "#B9A58A",
    };
    p.items.m = {
      id: "m",
      type: "model",
      model: "mdl1",
      name: "Кресло",
      x: 2,
      y: 1,
      rotation: 90,
      width: 0.8,
      depth: 0.8,
      height: 0.9,
      elevation: 0,
      lock: true,
    };
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128]);
    const model = {
      id: "mdl1",
      name: "Кресло",
      format: "glb" as const,
      unit: 100,
      size: { w: 0.8, d: 0.8, h: 0.9 },
      data: toBase64(bytes.buffer),
    };
    const { project, models } = parseProjectFile(projectToFile(p, [model]));
    expect(project.items).toEqual(p.items);
    expect(models).toEqual([model]);
    expect([...new Uint8Array(fromBase64(models[0]!.data))]).toEqual([...bytes]);
  });

  it("предмет с плохими размерами и модель без данных пропускаются, старый файл без мебели открывается", () => {
    const p = sample();
    p.items.a = {
      id: "a",
      type: "bed",
      name: "Кровать",
      x: 1,
      y: 1,
      rotation: -90,
      width: 0,
      depth: 2,
      height: 1,
      elevation: -1,
      lock: false,
    };
    p.items.b = {
      id: "b",
      type: "chair",
      name: "",
      x: 1,
      y: 1,
      rotation: -90,
      width: 0.4,
      depth: 0.4,
      height: 0.9,
      elevation: -1,
      lock: false,
      color: "red",
    };
    p.items.c = {
      id: "c",
      type: "model",
      name: "Без ссылки",
      x: 1,
      y: 1,
      rotation: 0,
      width: 1,
      depth: 1,
      height: 1,
      elevation: 0,
      lock: true,
    };
    const text = projectToFile(p, [
      { id: "x", name: "x", format: "glb", unit: 1, size: { w: 1, d: 1, h: 1 }, data: 5 as unknown as string },
    ]);
    const { project, models } = parseProjectFile(text);
    expect(Object.keys(project.items)).toEqual(["b"]);
    expect(project.items.b).toMatchObject({ name: "Предмет", rotation: 270, elevation: 0 });
    expect(project.items.b!.color).toBeUndefined();
    expect(models).toEqual([]);
    const old = JSON.parse(projectToFile(sample()));
    delete old.project.items;
    expect(projectFromFile(JSON.stringify(old)).items).toEqual({});
  });
});

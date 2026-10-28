// Модель проекта. Все длины — в метрах. План лежит в плоскости XY как на экране: x вправо, y вниз.
// Стены образуют граф: углы — узлы (Node), стены опираются на два узла. Сдвинул узел — едут все его стены.

export type Id = string;

export interface Point {
  x: number;
  y: number;
}

export interface PlanNode extends Point {
  id: Id;
}

/**
 * Где толщина относительно линии, по которой стену нарисовали и измерили (от узла a к узлу b):
 *  1 — слева (по нормали (-dy, dx)), -1 — справа, 0 — поровну в обе стороны.
 * Квартиру меряют изнутри, поэтому у замкнутой комнаты толщина уходит наружу, а линия стены — внутренняя сторона.
 */
export type WallSide = 1 | -1 | 0;

export interface Wall {
  id: Id;
  a: Id;
  b: Id;
  thickness: number;
  side: WallSide;
}

/** Замкнутый контур стен. Узлы перечислены по порядку обхода. */
export interface Room {
  id: Id;
  name: string;
  nodes: Id[];
}

export interface Project {
  id: Id;
  name: string;
  /** Высота стен. */
  ceilingHeight: number;
  /** Толщина новой стены. */
  defaultThickness: number;
  nodes: Record<Id, PlanNode>;
  walls: Record<Id, Wall>;
  rooms: Record<Id, Room>;
  updatedAt: number;
}

export function newId(): Id {
  return crypto.randomUUID().slice(0, 8);
}

export function emptyProject(name = 'Новый проект'): Project {
  return {
    id: newId(),
    name,
    ceilingHeight: 2.7,
    defaultThickness: 0.12,
    nodes: {},
    walls: {},
    rooms: {},
    updatedAt: Date.now(),
  };
}

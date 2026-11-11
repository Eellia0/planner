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
  /** Цвет грани слева от a→b ('#rrggbb'). Нет — стена цвета WALL_COLOR. */
  paintLeft?: string;
  /** Цвет грани справа от a→b. */
  paintRight?: string;
  /** Своя высота (короб, низкая перегородка). Нет — до потолка. */
  height?: number;
}

/** Цвет неокрашенной стены. */
export const WALL_COLOR = '#F2F1EE';

/** Грань стены: сторона 1 — слева от a→b, -1 — справа (как у WallSide). */
export interface Face {
  wall: Id;
  side: 1 | -1;
}

/**
 * Вид проёма: окно, панорамное окно (от пола), дверь, балконная дверь (остеклённая), проём без двери.
 */
export type OpeningKind = 'window' | 'panorama' | 'door' | 'balcony' | 'passage';

/** Окно, дверь или проём в стене. Положение — вдоль линии стены от её узла a. */
export interface Opening {
  id: Id;
  wall: Id;
  kind: OpeningKind;
  /** От узла a стены до ближнего края проёма, вдоль стены. */
  offset: number;
  width: number;
  height: number;
  /** Низ проёма от пола: у окна — подоконник, у двери — 0. */
  sill: number;
  /** Двери: петли у края проёма со стороны узла a или b стены. */
  hinge: 'a' | 'b';
  /** Двери: куда открывается — 1 в сторону нормали «влево» от a→b, -1 — в другую (как у WallSide). */
  swing: 1 | -1;
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
  openings: Record<Id, Opening>;
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
    openings: {},
    updatedAt: Date.now(),
  };
}

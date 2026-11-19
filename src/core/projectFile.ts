// Файл проекта: JSON с меткой формата и версией. Чтение проверяет всё, что потом используется,
// чтобы испорченный или чужой файл не ломал приложение, а давал понятную ошибку.
import { normalizeRotation } from "./items";
import { KIND_DEFAULTS } from "./openings";
import { dropLooseNodes } from "./ops";
import {
  emptyProject,
  type Id,
  type Item,
  type ModelFormat,
  newId,
  type Opening,
  type OpeningKind,
  type Project,
  type Room,
  type Wall,
} from "./types";

export const FILE_FORMAT = "planner";
export const FILE_VERSION = 1;
export const FILE_EXT = ".planner.json";

/** Своя 3D-модель внутри файла проекта: данные — в base64, остальное как в библиотеке. */
export interface ModelFile {
  id: Id;
  name: string;
  format: ModelFormat;
  unit: number;
  size: { w: number; d: number; h: number };
  data: string;
}

/** Файл проекта; models — свои модели, которые в нём стоят: файл открывается и там, где их нет в библиотеке. */
export function projectToFile(project: Project, models: ModelFile[] = []): string {
  return JSON.stringify(
    { format: FILE_FORMAT, version: FILE_VERSION, project, ...(models.length ? { models } : {}) },
    null,
    1,
  );
}

export function toBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(text: string): ArrayBuffer {
  const s = atob(text);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

/** Имя файла из названия проекта: без запрещённых в Windows знаков. */
export function fileName(project: Project): string {
  const base =
    project.name
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Проект";
  return base + FILE_EXT;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const MODEL_FORMATS: ModelFormat[] = ["glb", "gltf", "obj"];

/** Проект из текста файла (без моделей) — см. parseProjectFile. */
export const projectFromFile = (text: string): Project => parseProjectFile(text).project;

/**
 * Проект и свои модели из текста файла. Проект получает новый id: загрузка никогда не затирает проект, который уже
 * есть в списке. Ошибка — исключение с текстом для пользователя.
 */
export function parseProjectFile(text: string): { project: Project; models: ModelFile[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Это не файл проекта: внутри не JSON.");
  }
  if (!isObj(data) || data.format !== FILE_FORMAT || !isObj(data.project))
    throw new Error("Это не файл проекта планировщика.");
  if (!isNum(data.version) || data.version > FILE_VERSION)
    throw new Error("Файл сохранён более новой версией планировщика.");

  const src = data.project;
  const p = emptyProject(typeof src.name === "string" && src.name.trim() ? src.name.trim() : "Проект из файла");
  if (isNum(src.ceilingHeight) && src.ceilingHeight > 0) p.ceilingHeight = src.ceilingHeight;
  if (isNum(src.defaultThickness) && src.defaultThickness > 0) p.defaultThickness = src.defaultThickness;

  const broken = () => new Error("Файл повреждён: не хватает данных о стенах.");
  if (!isObj(src.nodes) || !isObj(src.walls) || !isObj(src.rooms)) throw broken();
  for (const [id, n] of Object.entries(src.nodes)) {
    if (!isObj(n) || !isNum(n.x) || !isNum(n.y)) throw broken();
    p.nodes[id] = { id, x: n.x, y: n.y };
  }
  for (const [id, w] of Object.entries(src.walls)) {
    if (
      !isObj(w) ||
      typeof w.a !== "string" ||
      typeof w.b !== "string" ||
      !p.nodes[w.a] ||
      !p.nodes[w.b] ||
      w.a === w.b
    )
      throw broken();
    const thickness = isNum(w.thickness) && w.thickness > 0 ? w.thickness : p.defaultThickness;
    const side = w.side === 1 || w.side === -1 ? w.side : 0;
    const wall: Wall = { id, a: w.a, b: w.b, thickness, side };
    if (isColor(w.paintLeft)) wall.paintLeft = w.paintLeft;
    if (isColor(w.paintRight)) wall.paintRight = w.paintRight;
    if (isNum(w.height) && w.height > 0) wall.height = w.height;
    p.walls[id] = wall;
  }
  for (const [id, r] of Object.entries(src.rooms)) {
    // комнату со ссылкой на несуществующий угол пропускаем: стены останутся, комнату можно замкнуть заново
    if (!isObj(r) || !Array.isArray(r.nodes) || r.nodes.length < 3) continue;
    if (!r.nodes.every((n) => typeof n === "string" && p.nodes[n])) continue;
    p.rooms[id] = {
      id,
      name: typeof r.name === "string" && r.name.trim() ? r.name : "Комната",
      nodes: r.nodes as string[],
    } satisfies Room;
  }
  // проёмы — необязательные (файлы до них); проём на несуществующей стене или непонятного вида пропускаем
  if (isObj(src.openings)) {
    for (const [id, o] of Object.entries(src.openings)) {
      if (
        !isObj(o) ||
        typeof o.wall !== "string" ||
        !p.walls[o.wall] ||
        typeof o.kind !== "string" ||
        !(o.kind in KIND_DEFAULTS)
      )
        continue;
      if (!isNum(o.offset) || !isNum(o.width) || !isNum(o.height) || !isNum(o.sill) || o.width <= 0 || o.height <= 0)
        continue;
      p.openings[id] = {
        id,
        wall: o.wall,
        kind: o.kind as OpeningKind,
        offset: o.offset,
        width: o.width,
        height: o.height,
        sill: Math.max(0, o.sill),
        hinge: o.hinge === "b" ? "b" : "a",
        swing: o.swing === -1 ? -1 : 1,
      } satisfies Opening;
    }
  }
  // мебель — тоже необязательная; предмет с неверными размерами пропускаем, неизвестный вид оставляем (покажется ящиком)
  if (isObj(src.items)) {
    for (const [id, it] of Object.entries(src.items)) {
      if (!isObj(it) || typeof it.type !== "string" || !isNum(it.x) || !isNum(it.y)) continue;
      if (![it.width, it.depth, it.height].every((v) => isNum(v) && v > 0)) continue;
      if (it.type === "model" && typeof it.model !== "string") continue;
      const item: Item = {
        id,
        type: it.type,
        name: typeof it.name === "string" && it.name.trim() ? it.name : "Предмет",
        x: it.x,
        y: it.y,
        rotation: isNum(it.rotation) ? normalizeRotation(it.rotation) : 0,
        width: it.width as number,
        depth: it.depth as number,
        height: it.height as number,
        elevation: isNum(it.elevation) && it.elevation > 0 ? it.elevation : 0,
        lock: it.lock === true,
      };
      if (typeof it.model === "string") item.model = it.model;
      if (isColor(it.color)) item.color = it.color;
      p.items[id] = item;
    }
  }
  dropLooseNodes(p);
  p.id = newId();

  const models: ModelFile[] = [];
  if (Array.isArray(data.models)) {
    for (const m of data.models) {
      if (
        !isObj(m) ||
        typeof m.id !== "string" ||
        typeof m.data !== "string" ||
        !MODEL_FORMATS.includes(m.format as ModelFormat)
      )
        continue;
      const size = m.size;
      if (!isNum(m.unit) || m.unit <= 0 || !isObj(size) || ![size.w, size.d, size.h].every((v) => isNum(v) && v > 0))
        continue;
      models.push({
        id: m.id,
        name: typeof m.name === "string" ? m.name : "Модель",
        format: m.format as ModelFormat,
        unit: m.unit,
        size: { w: size.w as number, d: size.d as number, h: size.h as number },
        data: m.data,
      });
    }
  }
  return { project: p, models };
}

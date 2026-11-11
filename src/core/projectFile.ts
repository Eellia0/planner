// Файл проекта: JSON с меткой формата и версией. Чтение проверяет всё, что потом используется,
// чтобы испорченный или чужой файл не ломал приложение, а давал понятную ошибку.
import { dropLooseNodes } from './ops';
import { KIND_DEFAULTS } from './openings';
import { emptyProject, newId, type Opening, type OpeningKind, type Project, type Room, type Wall } from './types';

export const FILE_FORMAT = 'planner';
export const FILE_VERSION = 1;
export const FILE_EXT = '.planner.json';

export function projectToFile(project: Project): string {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, project }, null, 1);
}

/** Имя файла из названия проекта: без запрещённых в Windows знаков. */
export function fileName(project: Project): string {
  const base = project.name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Проект';
  return base + FILE_EXT;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Проект из текста файла. Получает новый id: загрузка никогда не затирает проект, который уже есть в списке.
 * Ошибка — исключение с текстом для пользователя.
 */
export function projectFromFile(text: string): Project {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('Это не файл проекта: внутри не JSON.'); }
  if (!isObj(data) || data.format !== FILE_FORMAT || !isObj(data.project)) throw new Error('Это не файл проекта планировщика.');
  if (!isNum(data.version) || data.version > FILE_VERSION) throw new Error('Файл сохранён более новой версией планировщика.');

  const src = data.project;
  const p = emptyProject(typeof src.name === 'string' && src.name.trim() ? src.name.trim() : 'Проект из файла');
  if (isNum(src.ceilingHeight) && src.ceilingHeight > 0) p.ceilingHeight = src.ceilingHeight;
  if (isNum(src.defaultThickness) && src.defaultThickness > 0) p.defaultThickness = src.defaultThickness;

  const broken = () => new Error('Файл повреждён: не хватает данных о стенах.');
  if (!isObj(src.nodes) || !isObj(src.walls) || !isObj(src.rooms)) throw broken();
  for (const [id, n] of Object.entries(src.nodes)) {
    if (!isObj(n) || !isNum(n.x) || !isNum(n.y)) throw broken();
    p.nodes[id] = { id, x: n.x, y: n.y };
  }
  for (const [id, w] of Object.entries(src.walls)) {
    if (!isObj(w) || typeof w.a !== 'string' || typeof w.b !== 'string' || !p.nodes[w.a] || !p.nodes[w.b] || w.a === w.b) throw broken();
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
    if (!r.nodes.every(n => typeof n === 'string' && p.nodes[n])) continue;
    p.rooms[id] = { id, name: typeof r.name === 'string' && r.name.trim() ? r.name : 'Комната', nodes: r.nodes as string[] } satisfies Room;
  }
  // проёмы — необязательные (файлы до них); проём на несуществующей стене или непонятного вида пропускаем
  if (isObj(src.openings)) {
    for (const [id, o] of Object.entries(src.openings)) {
      if (!isObj(o) || typeof o.wall !== 'string' || !p.walls[o.wall] || typeof o.kind !== 'string' || !(o.kind in KIND_DEFAULTS)) continue;
      if (!isNum(o.offset) || !isNum(o.width) || !isNum(o.height) || !isNum(o.sill) || o.width <= 0 || o.height <= 0) continue;
      p.openings[id] = {
        id, wall: o.wall, kind: o.kind as OpeningKind, offset: o.offset, width: o.width, height: o.height, sill: Math.max(0, o.sill),
        hinge: o.hinge === 'b' ? 'b' : 'a', swing: o.swing === -1 ? -1 : 1,
      } satisfies Opening;
    }
  }
  dropLooseNodes(p);
  p.id = newId();
  return p;
}

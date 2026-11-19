import { temporal } from "zundo";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { dist, wallLength } from "../core/geometry";
import { type ItemDraft, itemAxes, MIN_ITEM, normalizeRotation, resizeItem } from "../core/items";
import { addOpening, clampOffset, setOpeningKind } from "../core/openings";
import * as ops from "../core/ops";
import {
  emptyProject,
  type Face,
  type Id,
  type Item,
  newId,
  type Opening,
  type OpeningKind,
  type Point,
  type Project,
  type WallSide,
} from "../core/types";
import { round } from "../core/units";

export type Tool = "select" | "wall" | "window" | "door" | "furniture";
/** Поля предмета, которые меняются из свойств и мышью. */
export type ItemPatch = Partial<
  Pick<Item, "name" | "x" | "y" | "rotation" | "width" | "depth" | "height" | "elevation" | "lock" | "color">
>;
const COPY_SHIFT = 0.2; // копия встаёт со сдвигом, чтобы не лечь ровно на оригинал
/** Куда встанет первая точка: в угол, на стену или в свободное место. */
export interface ChainStart {
  p: Point;
  node?: Id;
  wall?: Id;
}

interface EditorState {
  project: Project;
  /** Черновик во время перетаскивания: рисуется вместо project, в историю не попадает. */
  preview: Project | null;
  tool: Tool;
  /** Выбранные стены. */
  selection: Id[];
  /** Выбранная комната (тогда стены не выбраны). */
  room: Id | null;
  /** Выбранный проём (тогда ни стены, ни комната не выбраны). */
  opening: Id | null;
  /** Выбранный предмет мебели (тогда больше ничего не выбрано). */
  item: Id | null;
  /** Что ставит инструмент «Мебель»; null — открыт каталог. */
  placing: ItemDraft | null;
  /** Скопированный предмет (Ctrl+C), в историю не попадает. */
  clipboard: Item | null;
  /** Угол выбранной стены, который стоит на месте при новой длине: ближний к месту клика. */
  anchor: Id | null;
  /** Узлы рисуемой сейчас цепочки стен. */
  chain: Id[];
  /** Первая точка цепочки: в проект попадает только вместе с первой стеной, чтобы не оставалось одиноких точек. */
  start: ChainStart | null;

  setTool: (tool: Tool) => void;
  setSelection: (ids: Id[]) => void;
  setAnchor: (id: Id | null) => void;
  selectRoom: (id: Id | null) => void;
  selectOpening: (id: Id | null) => void;
  selectItem: (id: Id | null) => void;
  /** Взять предмет из каталога: дальше клик на плане ставит его. null — вернуться к каталогу. */
  startPlacing: (draft: ItemDraft | null) => void;
  rotatePlacing: (by: number) => void;
  /** Поставить предмет и выбрать его. keep — не выходить из постановки (ставить ещё такой же). */
  addItem: (it: Item, keep?: boolean) => void;
  /** Поменять поля предмета одним шагом отмены; color: undefined — цвет каталога. */
  updateItem: (id: Id, patch: ItemPatch) => void;
  /** Новый размер (с пропорциями, если они сохраняются); спинка стоит на месте. */
  resizeItem: (id: Id, size: Partial<Pick<Item, "width" | "depth" | "height">>) => void;
  rotateItem: (id: Id, by: number) => void;
  moveItem: (id: Id, delta: Point) => void;
  deleteItem: (id: Id) => void;
  duplicateItem: (id: Id) => void;
  copyItem: (id: Id) => void;
  pasteItem: () => void;
  /** Поставить окно или дверь на стену серединой в center (м от узла a) и выбрать его. */
  addOpening: (wall: Id, kind: OpeningKind, center: number) => void;
  /** Поменять поля проёма одним шагом отмены. Сдвиг и ширина не выходят за стену. */
  updateOpening: (
    id: Id,
    patch: Partial<Pick<Opening, "offset" | "width" | "height" | "sill" | "hinge" | "swing">>,
  ) => void;
  setOpeningKind: (id: Id, kind: OpeningKind) => void;
  deleteOpening: (id: Id) => void;
  /** Своя высота стен; null — до потолка. */
  setWallHeight: (ids: Id[], h: number | null) => void;
  renameRoom: (id: Id, name: string) => void;
  /**
   * Поставить точку цепочки: в существующий узел, на стену (Т-стык — стена разбивается) или новую.
   * Попали в начало — комната замкнута. Упёрлись в существующую стену или угол — цепочка закончена.
   */
  placePoint: (p: Point, snapNode?: Id, snapWall?: Id) => void;
  endChain: () => void;
  /** Перенос: пока тянут — черновик, по отпусканию — одно действие в истории. */
  setPreview: (p: Project | null) => void;
  moveNodes: (ids: Id[], delta: Point) => void;
  /** Перенести угол; если отпустили на стене — встаёт в неё Т-стыком. */
  moveNode: (id: Id, p: Point, onWall?: Id) => void;
  setWallLength: (id: Id, length: number) => void;
  setWallThickness: (ids: Id[], thickness: number) => void;
  setWallSide: (id: Id, side: WallSide) => void;
  /** Покрасить грани стен одним шагом отмены; null — вернуть цвет по умолчанию. */
  paintFaces: (faces: Face[], color: string | null) => void;
  deleteWalls: (ids: Id[]) => void;
  setDefaultThickness: (t: number) => void;
  setCeilingHeight: (h: number) => void;
  renameProject: (name: string) => void;
}

export const useEditor = create<EditorState>()(
  temporal(
    immer((set) => ({
      project: emptyProject(), // настоящий проект открывает initProjects (store/projects.ts)
      preview: null,
      tool: "select",
      selection: [],
      room: null,
      opening: null,
      item: null,
      placing: null,
      clipboard: null,
      anchor: null,
      chain: [],
      start: null,

      setTool: (tool) =>
        set((s) => {
          s.tool = tool;
          s.chain = [];
          s.start = null;
          s.placing = null;
          if (tool === "wall") {
            s.selection = [];
            s.room = null;
            s.opening = null;
            s.item = null;
          }
        }),
      setSelection: (ids) =>
        set((s) => {
          s.selection = ids;
          s.room = null;
          s.opening = null;
          s.item = null;
        }),
      setAnchor: (id) =>
        set((s) => {
          s.anchor = id;
        }),
      selectRoom: (id) =>
        set((s) => {
          s.room = id;
          s.selection = [];
          s.opening = null;
          s.item = null;
        }),
      selectOpening: (id) =>
        set((s) => {
          s.opening = id;
          s.selection = [];
          s.room = null;
          s.item = null;
        }),
      selectItem: (id) =>
        set((s) => {
          s.item = id;
          s.selection = [];
          s.room = null;
          s.opening = null;
        }),
      startPlacing: (draft) =>
        set((s) => {
          s.tool = "furniture";
          s.placing = draft;
          s.chain = [];
          s.start = null;
        }),
      rotatePlacing: (by) =>
        set((s) => {
          if (s.placing) s.placing.rotation = normalizeRotation(s.placing.rotation + by);
        }),
      addItem: (it, keep) =>
        set((s) => {
          const id = newId();
          s.project.items[id] = { ...it, id };
          s.item = id;
          s.selection = [];
          s.room = null;
          s.opening = null;
          if (!keep) {
            s.tool = "select";
            s.placing = null;
          }
        }),
      updateItem: (id, patch) =>
        set((s) => {
          s.preview = null;
          const it = s.project.items[id];
          if (!it) return;
          const name = it.name;
          Object.assign(it, patch);
          if ("color" in patch && patch.color === undefined) delete it.color;
          it.name = it.name.trim() || name;
          it.rotation = normalizeRotation(it.rotation);
          it.width = Math.max(MIN_ITEM, round(it.width));
          it.depth = Math.max(MIN_ITEM, round(it.depth));
          it.height = Math.max(MIN_ITEM, round(it.height));
          it.elevation = Math.max(0, round(it.elevation));
        }),
      resizeItem: (id, size) =>
        set((s) => {
          const it = s.project.items[id];
          if (it) resizeItem(it, size);
        }),
      rotateItem: (id, by) =>
        set((s) => {
          const it = s.project.items[id];
          if (it) it.rotation = normalizeRotation(it.rotation + by);
        }),
      moveItem: (id, delta) =>
        set((s) => {
          const it = s.project.items[id];
          if (it) {
            it.x = round(it.x + delta.x);
            it.y = round(it.y + delta.y);
          }
        }),
      deleteItem: (id) =>
        set((s) => {
          delete s.project.items[id];
          if (s.item === id) s.item = null;
        }),
      duplicateItem: (id) =>
        set((s) => {
          const it = s.project.items[id];
          if (!it) return;
          const copy = shifted(it);
          s.project.items[copy.id] = copy;
          s.item = copy.id;
        }),
      copyItem: (id) =>
        set((s) => {
          const it = s.project.items[id];
          if (it) s.clipboard = { ...it };
        }),
      pasteItem: () =>
        set((s) => {
          if (!s.clipboard) return;
          // каждая следующая вставка — ещё на шаг дальше
          const copy = shifted(s.clipboard);
          s.project.items[copy.id] = copy;
          s.clipboard = { ...copy };
          s.item = copy.id;
          s.selection = [];
          s.room = null;
          s.opening = null;
        }),
      addOpening: (wall, kind, center) =>
        set((s) => {
          if (!s.project.walls[wall]) return;
          s.opening = addOpening(s.project, wall, kind, center);
          s.selection = [];
          s.room = null;
          s.item = null;
        }),
      updateOpening: (id, patch) =>
        set((s) => {
          s.preview = null;
          const o = s.project.openings[id];
          const w = o && s.project.walls[o.wall];
          if (!o || !w) return;
          Object.assign(o, patch);
          const length = wallLength(s.project, w);
          o.width = Math.max(0.1, Math.min(o.width, length));
          o.offset = clampOffset(o.offset, o.width, length);
          o.sill = Math.max(0, o.sill);
          o.height = Math.max(0.1, o.height);
        }),
      setOpeningKind: (id, kind) =>
        set((s) => {
          const o = s.project.openings[id];
          if (o) setOpeningKind(s.project, o, kind);
        }),
      deleteOpening: (id) =>
        set((s) => {
          delete s.project.openings[id];
          if (s.opening === id) s.opening = null;
        }),
      setWallHeight: (ids, h) =>
        set((s) => {
          if (h !== null && h <= 0) return;
          for (const id of ids) {
            const w = s.project.walls[id];
            if (!w) continue;
            if (h === null || Math.abs(h - s.project.ceilingHeight) < 0.0005) delete w.height;
            else w.height = h;
          }
        }),
      renameRoom: (id, name) =>
        set((s) => {
          const r = s.project.rooms[id];
          if (r && name.trim()) r.name = name.trim();
        }),

      placePoint: (p, snapNode, snapWall) =>
        set((s) => {
          const pr = s.project;
          if (!s.chain.length && !s.start) {
            s.start = { p, node: snapNode, wall: snapWall };
            return;
          }
          // узел в точке: существующий угол, Т-стык на стене или новый
          const nodeAt = (q: Point, node?: Id, wall?: Id) =>
            node ?? (wall && pr.walls[wall] ? ops.splitWall(pr, wall, q) : undefined);
          if (s.start) {
            if ((snapNode && snapNode === s.start.node) || dist(p, s.start.p) < 0.005) return; // повторный клик в начало
            // первая стена: теперь можно ставить и начальную точку
            s.chain = [nodeAt(s.start.p, s.start.node, s.start.wall) ?? ops.addNode(pr, s.start.p)];
            s.start = null;
          }
          const last = s.chain[s.chain.length - 1];
          if (snapNode && last === snapNode) return; // повторный клик в ту же точку
          const existing = nodeAt(p, snapNode, snapWall);
          const id = existing ?? ops.addNode(pr, p);
          if (last) ops.addWall(pr, last, id);
          if (s.chain.length >= 3 && id === s.chain[0]) {
            // попали в начало цепочки — контур замкнут, получилась комната
            ops.addRoom(pr, s.chain);
            s.chain = [];
          } else if (last && existing) {
            // упёрлись в стену или угол: цепочка закончена, а если она соединила две точки комнаты — делим или пристраиваем
            ops.roomByPath(pr, [...s.chain, id]);
            s.chain = [];
          } else {
            s.chain.push(id);
          }
          pr.updatedAt = Date.now();
        }),
      endChain: () =>
        set((s) => {
          s.chain = [];
          s.start = null;
        }),

      setPreview: (p) =>
        set((s) => {
          s.preview = p;
        }),
      moveNodes: (ids, delta) =>
        set((s) => {
          s.preview = null;
          ops.moveNodes(s.project, ids, delta);
        }),
      moveNode: (id, p, onWall) =>
        set((s) => {
          s.preview = null;
          ops.moveNode(s.project, id, p);
          if (onWall && s.project.walls[onWall]) ops.splitWall(s.project, onWall, p, id);
        }),
      setWallLength: (id, length) =>
        set((s) => {
          const w = s.project.walls[id];
          if (w) ops.setWallLength(s.project, w, length, s.anchor === w.b ? w.b : w.a);
        }),
      setWallThickness: (ids, t) =>
        set((s) => {
          if (t <= 0) return;
          for (const id of ids) {
            const w = s.project.walls[id];
            if (w) w.thickness = t;
          }
        }),
      setWallSide: (id, side) =>
        set((s) => {
          const w = s.project.walls[id];
          if (w) w.side = side;
        }),
      paintFaces: (faces, color) =>
        set((s) => {
          ops.paintFaces(s.project, faces, color);
        }),
      deleteWalls: (ids) =>
        set((s) => {
          ops.deleteWalls(s.project, ids);
          s.selection = s.selection.filter((id) => s.project.walls[id]);
          if (s.room && !s.project.rooms[s.room]) s.room = null;
          if (s.opening && !s.project.openings[s.opening]) s.opening = null;
        }),
      setDefaultThickness: (t) =>
        set((s) => {
          if (t > 0) s.project.defaultThickness = t;
        }),
      setCeilingHeight: (h) =>
        set((s) => {
          if (h > 0) s.project.ceilingHeight = h;
        }),
      renameProject: (name) =>
        set((s) => {
          if (name.trim()) s.project.name = name.trim();
        }),
    })),
    {
      // в историю отмены попадает только сам проект: выбор, инструмент и черновик не отменяются
      partialize: (s) => ({ project: s.project }),
      equality: (a, b) => a.project === b.project,
      limit: 200,
    },
  ),
);

/** Копия предмета с новым id, сдвинутая вбок и вперёд. */
function shifted(it: Item): Item {
  const { u, v } = itemAxes(it);
  return { ...it, id: newId(), x: round(it.x + (u.x + v.x) * COPY_SHIFT), y: round(it.y + (u.y + v.y) * COPY_SHIFT) };
}

// после отмены или повтора рисуемая цепочка и выбор могут ссылаться на то, чего уже нет
function afterHistory() {
  const s = useEditor.getState();
  useEditor.setState({
    chain: [],
    start: null,
    preview: null,
    selection: s.selection.filter((id) => s.project.walls[id]),
    room: s.room && s.project.rooms[s.room] ? s.room : null,
    opening: s.opening && s.project.openings[s.opening] ? s.opening : null,
    item: s.item && s.project.items[s.item] ? s.item : null,
  });
}
export const undo = () => {
  useEditor.temporal.getState().undo();
  afterHistory();
};
export const redo = () => {
  useEditor.temporal.getState().redo();
  afterHistory();
};

/** Открыть другой проект: выбор и рисование сбрасываются, история отмены начинается заново. */
export function openProject(project: Project) {
  project.openings ??= {}; // проекты, сохранённые до проёмов
  project.items ??= {}; // и до мебели
  useEditor.setState({
    project,
    preview: null,
    chain: [],
    start: null,
    selection: [],
    room: null,
    opening: null,
    item: null,
    placing: null,
    anchor: null,
  });
  useEditor.temporal.getState().clear();
}

/** Что рисовать: черновик, если сейчас что-то тянут, иначе проект. */
export const useShownProject = () => useEditor((s) => s.preview ?? s.project);

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import * as ops from '../core/ops';
import { emptyProject, type Id, type Point, type Project, type WallSide } from '../core/types';

export type Tool = 'select' | 'wall';

interface EditorState {
  project: Project;
  /** Черновик во время перетаскивания: рисуется вместо project, в историю не попадает. */
  preview: Project | null;
  tool: Tool;
  /** Выбранные стены. */
  selection: Id[];
  /** Узлы рисуемой сейчас цепочки стен. */
  chain: Id[];

  setTool: (tool: Tool) => void;
  setSelection: (ids: Id[]) => void;
  /** Поставить точку цепочки: к существующему узлу (если рядом) или новую. Замыкает комнату, если попали в начало. */
  placePoint: (p: Point, snapNode?: Id) => void;
  endChain: () => void;
  /** Перенос: пока тянут — черновик, по отпусканию — одно действие в истории. */
  setPreview: (p: Project | null) => void;
  moveNodes: (ids: Id[], delta: Point) => void;
  moveNode: (id: Id, p: Point) => void;
  setWallLength: (id: Id, length: number) => void;
  setWallThickness: (ids: Id[], thickness: number) => void;
  setWallSide: (id: Id, side: WallSide) => void;
  deleteWalls: (ids: Id[]) => void;
  setDefaultThickness: (t: number) => void;
  setCeilingHeight: (h: number) => void;
  newProject: () => void;
}

const STORAGE_KEY = 'planner.project';

function loadProject(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Project;
  } catch { /* хранилище недоступно или испорчено — начинаем с пустого */ }
  return emptyProject();
}

export const useEditor = create<EditorState>()(
  temporal(
    immer(set => ({
      project: loadProject(),
      preview: null,
      tool: 'select',
      selection: [],
      chain: [],

      setTool: tool => set(s => { s.tool = tool; s.chain = []; if (tool === 'wall') s.selection = []; }),
      setSelection: ids => set(s => { s.selection = ids; }),

      placePoint: (p, snapNode) => set(s => {
        const pr = s.project;
        const id = snapNode ?? ops.addNode(pr, p);
        const last = s.chain[s.chain.length - 1];
        if (last === id) return; // повторный клик в ту же точку
        if (last) ops.addWall(pr, last, id);
        // попали в начало цепочки — контур замкнут, получилась комната
        if (s.chain.length >= 3 && id === s.chain[0]) {
          ops.addRoom(pr, s.chain);
          s.chain = [];
        } else {
          s.chain.push(id);
        }
        pr.updatedAt = Date.now();
      }),
      endChain: () => set(s => { s.chain = []; }),

      setPreview: p => set(s => { s.preview = p; }),
      moveNodes: (ids, delta) => set(s => { s.preview = null; ops.moveNodes(s.project, ids, delta); }),
      moveNode: (id, p) => set(s => { s.preview = null; ops.moveNode(s.project, id, p); }),
      setWallLength: (id, length) => set(s => {
        const w = s.project.walls[id];
        if (w) ops.setWallLength(s.project, w, length);
      }),
      setWallThickness: (ids, t) => set(s => {
        if (t <= 0) return;
        for (const id of ids) { const w = s.project.walls[id]; if (w) w.thickness = t; }
      }),
      setWallSide: (id, side) => set(s => {
        const w = s.project.walls[id];
        if (w) w.side = side;
      }),
      deleteWalls: ids => set(s => {
        for (const id of ids) ops.deleteWall(s.project, id);
        s.selection = s.selection.filter(id => !ids.includes(id));
      }),
      setDefaultThickness: t => set(s => { if (t > 0) s.project.defaultThickness = t; }),
      setCeilingHeight: h => set(s => { if (h > 0) s.project.ceilingHeight = h; }),
      newProject: () => set(s => { s.project = emptyProject(); s.chain = []; s.selection = []; }),
    })),
    {
      // в историю отмены попадает только сам проект: выбор, инструмент и черновик не отменяются
      partialize: s => ({ project: s.project }),
      equality: (a, b) => a.project === b.project,
      limit: 200,
    },
  ),
);

// после отмены или повтора рисуемая цепочка и выбор могут ссылаться на то, чего уже нет
function afterHistory() {
  const s = useEditor.getState();
  useEditor.setState({ chain: [], preview: null, selection: s.selection.filter(id => s.project.walls[id]) });
}
export const undo = () => { useEditor.temporal.getState().undo(); afterHistory(); };
export const redo = () => { useEditor.temporal.getState().redo(); afterHistory(); };

/** Что рисовать: черновик, если сейчас что-то тянут, иначе проект. */
export const useShownProject = () => useEditor(s => s.preview ?? s.project);

// автосохранение в браузере
useEditor.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s.project)); } catch { /* нет места или запрещено */ }
});

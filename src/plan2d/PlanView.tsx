import { useEffect, useMemo, useRef, useState } from 'react';
import { add, centroid, dist, mul, norm, roomPolygon, signedArea, sub, wallLength, wallOutline } from '../core/geometry';
import * as ops from '../core/ops';
import type { Id, Point, Project } from '../core/types';
import { formatMeters, parseLength, round } from '../core/units';
import { useEditor, useShownProject } from '../store/editor';

// План сверху. Всё внутри рисуется в метрах; вид (масштаб и сдвиг) переводит метры в пиксели.
interface View { s: number; ox: number; oy: number }

/** Что сейчас тянут мышью в режиме «Выбор». */
type Drag =
  | { kind: 'move'; start: Point; nodes: Id[]; moved: boolean }
  | { kind: 'node'; start: Point; id: Id; moved: boolean }
  | { kind: 'box'; start: Point; end: Point; add: boolean; moved: boolean };

const SNAP_PX = 12;              // радиус прилипания к узлу, пикселей
const GRID_SNAP = 0.05;          // шаг сетки для свободной точки, м
const ANGLE_STEP = Math.PI / 12; // 15°
const DRAG_PX = 3;               // меньше — это клик, а не перетаскивание

const pts = (ps: Point[]) => ps.map(p => `${p.x},${p.y}`).join(' ');
const round2 = (p: Point): Point => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
const isTyping = (e: { target: EventTarget | null }) => (e.target as HTMLElement).closest?.('input, textarea, select');

export function PlanView() {
  const project = useShownProject();
  const tool = useEditor(s => s.tool);
  const chain = useEditor(s => s.chain);
  const selection = useEditor(s => s.selection);
  const st = useEditor.getState();

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ s: 50, ox: 60, oy: 60 });
  const [cursor, setCursor] = useState<Point | null>(null);
  const [typed, setTyped] = useState('');
  const [box, setBox] = useState<{ a: Point; b: Point } | null>(null);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const lengthRef = useRef<HTMLInputElement>(null);

  // поле длины получает фокус после каждой поставленной точки
  useEffect(() => { if (tool === 'wall' && chain.length) lengthRef.current?.focus(); }, [tool, chain.length]);

  const onLengthKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const s = useEditor.getState();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!typed || parseLength(typed) === null || !snap) return; // пусто или неразборчиво — не ставим
      s.placePoint(snap.p, snap.node);
      setTyped('');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (typed) setTyped('');
      else { s.endChain(); lengthRef.current?.blur(); }
    }
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toPlan = (clientX: number, clientY: number): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.ox) / view.s, y: (clientY - r.top - view.oy) / view.s };
  };

  // ---------- инструмент «Стена»: куда встанет следующая точка ----------
  const last = chain.length ? project.nodes[chain[chain.length - 1]!] : undefined;
  const snap = useMemo(() => {
    if (tool !== 'wall' || !cursor) return null;
    const near = ops.nodeNear(project, cursor, SNAP_PX / view.s);
    if (near && near !== chain[chain.length - 1]) return { p: project.nodes[near]! as Point, node: near };
    if (!last) return { p: { x: round(Math.round(cursor.x / GRID_SNAP) * GRID_SNAP), y: round(Math.round(cursor.y / GRID_SNAP) * GRID_SNAP) } };
    // от последней точки: угол с шагом 15°, длина — набранная или до курсора с точностью 1 см
    const d = sub(cursor, last);
    const ang = Math.round(Math.atan2(d.y, d.x) / ANGLE_STEP) * ANGLE_STEP;
    const dir = { x: Math.cos(ang), y: Math.sin(ang) };
    const length = parseLength(typed) ?? Math.max(0.01, Math.round(Math.abs(d.x * dir.x + d.y * dir.y) * 100) / 100);
    return { p: add(last, mul(dir, length)) };
  }, [tool, cursor, project, view.s, chain, last, typed]);

  // ---------- клавиатура ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = useEditor.getState();
      if (s.tool === 'wall') {
        if (e.key === 'Escape') {
          if (typed) setTyped('');
          else if (s.chain.length) s.endChain();
          else s.setTool('select');
          return;
        }
        // цифра, набранная мимо поля длины, всё равно попадает в него
        if (s.chain.length && /^[0-9]$/.test(e.key)) { setTyped(t => t + e.key); lengthRef.current?.focus(); e.preventDefault(); }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection.length) { s.deleteWalls(s.selection); return; }
      if (e.key === 'Escape') { s.setSelection([]); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'ф')) { e.preventDefault(); s.setSelection(Object.keys(s.project.walls)); return; }
      const arrows: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
      const a = arrows[e.key];
      if (a && s.selection.length) {
        e.preventDefault();
        s.moveNodes(ops.nodesOfWalls(s.project, s.selection), mul(a, e.shiftKey ? 0.1 : 0.01));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [typed, snap]);

  // ---------- мышь ----------
  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setView(v => {
      const s = Math.min(800, Math.max(10, v.s * Math.exp(-e.deltaY * 0.0015)));
      return { s, ox: mx - ((mx - v.ox) / v.s) * s, oy: my - ((my - v.oy) / v.s) * s }; // точка под курсором стоит на месте
    });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isTyping(e)) return;
    if (e.button === 1 || e.button === 2) {
      pan.current = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0 || tool !== 'select') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPlan(e.clientX, e.clientY);
    const target = e.target as Element;
    const nodeId = target.getAttribute('data-node');
    const wallId = target.getAttribute('data-wall');
    if (nodeId) { drag.current = { kind: 'node', start: p, id: nodeId, moved: false }; return; }
    if (wallId) {
      let sel = selection;
      if (e.shiftKey) sel = sel.includes(wallId) ? sel.filter(id => id !== wallId) : [...sel, wallId];
      else if (!sel.includes(wallId)) sel = [wallId];
      st.setSelection(sel);
      drag.current = { kind: 'move', start: p, nodes: ops.nodesOfWalls(useEditor.getState().project, sel), moved: false };
      return;
    }
    drag.current = { kind: 'box', start: p, end: p, add: e.shiftKey, moved: false };
  };

  /** Черновик проекта для перетаскивания: копия с применённым сдвигом. */
  const draftWith = (fn: (pr: Project) => void): Project => {
    const copy = structuredClone(useEditor.getState().project);
    fn(copy);
    return copy;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pan.current) {
      const dx = e.clientX - pan.current.x, dy = e.clientY - pan.current.y;
      setView(v => ({ ...v, ox: pan.current!.ox + dx, oy: pan.current!.oy + dy }));
      return;
    }
    const p = toPlan(e.clientX, e.clientY);
    setCursor(p);
    const d = drag.current;
    if (!d) return;
    if (!d.moved && dist(p, d.start) * view.s < DRAG_PX) return;
    d.moved = true;
    if (d.kind === 'move') {
      const delta = round2(sub(p, d.start));
      st.setPreview(draftWith(pr => ops.moveNodes(pr, d.nodes, delta)));
    } else if (d.kind === 'node') {
      const base = useEditor.getState().project;
      const near = ops.nodeNear({ ...base, nodes: Object.fromEntries(Object.entries(base.nodes).filter(([id]) => id !== d.id)) }, p, SNAP_PX / view.s);
      const to = near ? base.nodes[near]! : round2(p);
      st.setPreview(draftWith(pr => ops.moveNode(pr, d.id, to)));
    } else {
      d.end = p;
      setBox({ a: d.start, b: p });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (isTyping(e)) return;
    if (pan.current) { pan.current = null; return; }
    if (e.button !== 0) return;
    if (tool === 'wall') {
      if (snap) { st.placePoint(snap.p, snap.node); setTyped(''); }
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const p = toPlan(e.clientX, e.clientY);
    if (d.kind === 'move') {
      if (d.moved) st.moveNodes(d.nodes, round2(sub(p, d.start)));
    } else if (d.kind === 'node') {
      const preview = useEditor.getState().preview;
      if (d.moved && preview) st.moveNode(d.id, preview.nodes[d.id]!);
    } else {
      setBox(null);
      if (!d.moved) { if (!d.add) st.setSelection([]); return; }
      const found = ops.wallsInRect(useEditor.getState().project, d.start, p, p.x < d.start.x);
      st.setSelection(d.add ? [...new Set([...selection, ...found])] : found);
    }
    st.setPreview(null);
  };

  // ---------- что рисовать ----------
  const walls = Object.values(project.walls);
  const rooms = Object.values(project.rooms);
  const px = 1 / view.s; // один экранный пиксель в метрах
  const selected = new Set(selection);
  const visible = { x0: -view.ox / view.s, y0: -view.oy / view.s, x1: (size.w - view.ox) / view.s, y1: (size.h - view.oy) / view.s };
  const grid = useMemo(() => {
    const lines: React.ReactNode[] = [];
    const step = view.s > 40 ? 0.1 : 1;
    for (let i = Math.floor(visible.x0 / step); i <= Math.ceil(visible.x1 / step); i++) {
      const major = Math.round(i * step * 10) % 10 === 0;
      lines.push(<line key={`v${i}`} className={major ? 'grid-major' : 'grid-minor'} x1={i * step} y1={visible.y0} x2={i * step} y2={visible.y1} />);
    }
    for (let j = Math.floor(visible.y0 / step); j <= Math.ceil(visible.y1 / step); j++) {
      const major = Math.round(j * step * 10) % 10 === 0;
      lines.push(<line key={`h${j}`} className={major ? 'grid-major' : 'grid-minor'} x1={visible.x0} y1={j * step} x2={visible.x1} y2={j * step} />);
    }
    return lines;
  }, [visible.x0, visible.y0, visible.x1, visible.y1, view.s]);

  // подпись длины вдоль стены — со стороны, противоположной толщине (у комнаты это внутри)
  const wallLabel = (aP: Point, bP: Point, side: number, thickness: number, text: string, key: string) => {
    const d = norm(sub(bP, aP));
    const n = { x: -d.y, y: d.x };
    const offset = side === 0 ? thickness / 2 + 14 * px : 14 * px;
    const m = add(mul(add(aP, bP), 0.5), mul(n, (side === 0 ? 1 : -side) * offset));
    let deg = (Math.atan2(d.y, d.x) * 180) / Math.PI;
    if (deg > 90 || deg < -90) deg += 180;
    return (
      <text key={key} className="dim-text" x={m.x} y={m.y} fontSize={12 * px} strokeWidth={3 * px}
        transform={`rotate(${deg} ${m.x} ${m.y})`} textAnchor="middle" dominantBaseline="middle">{text}</text>
    );
  };

  const preview = tool === 'wall' && last && snap ? { a: last as Point, b: snap.p } : null;
  const handles = tool === 'select' ? ops.nodesOfWalls(project, selection) : [];
  const empty = !Object.keys(project.walls).length;

  return (
    <svg ref={svgRef} className={`plan tool-${tool}`} onWheel={onWheel} onPointerDown={onPointerDown}
      onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerLeave={() => { if (!chain.length) setCursor(null); }}
      onContextMenu={e => e.preventDefault()}>
      <rect width="100%" height="100%" className="plan-paper" />
      <g transform={`translate(${view.ox} ${view.oy}) scale(${view.s})`}>
        {grid}

        {rooms.map(r => {
          const poly = roomPolygon(project, r);
          const c = centroid(poly);
          return (
            <g key={r.id}>
              <polygon className="room-floor" points={pts(poly)} />
              <text className="room-name" x={c.x} y={c.y - 9 * px} fontSize={13 * px} textAnchor="middle">{r.name}</text>
              <text className="room-area" x={c.x} y={c.y + 9 * px} fontSize={12 * px} textAnchor="middle">
                {Math.abs(signedArea(poly)).toFixed(2).replace('.', ',')} м²
              </text>
            </g>
          );
        })}

        {walls.map(w => (
          <polygon key={w.id} data-wall={w.id} points={pts(wallOutline(project, w))} className={`wall${selected.has(w.id) ? ' selected' : ''}`} />
        ))}
        {walls.map(w => wallLabel(project.nodes[w.a]!, project.nodes[w.b]!, w.side, w.thickness, formatMeters(wallLength(project, w)), `l${w.id}`))}

        {handles.map(id => {
          const n = project.nodes[id]!;
          return <rect key={id} data-node={id} className="handle" x={n.x - 5 * px} y={n.y - 5 * px} width={10 * px} height={10 * px} rx={2 * px} />;
        })}

        {tool === 'wall' && Object.values(project.nodes).map(n => (
          <circle key={n.id} className={`node${n.id === chain[0] && chain.length >= 3 ? ' close' : ''}`} cx={n.x} cy={n.y} r={4 * px} />
        ))}
        {preview && (
          <g className="preview">
            <line x1={preview.a.x} y1={preview.a.y} x2={preview.b.x} y2={preview.b.y} strokeWidth={project.defaultThickness} />
            {wallLabel(preview.a, preview.b, -1, project.defaultThickness, formatMeters(dist(preview.a, preview.b)), 'pl')}
          </g>
        )}
        {tool === 'wall' && snap && <circle className="snap" cx={snap.p.x} cy={snap.p.y} r={5 * px} />}

        {box && (
          <rect className={`marquee${box.b.x < box.a.x ? ' crossing' : ''}`}
            x={Math.min(box.a.x, box.b.x)} y={Math.min(box.a.y, box.b.y)}
            width={Math.abs(box.b.x - box.a.x)} height={Math.abs(box.b.y - box.a.y)} />
        )}
      </g>

      {tool === 'wall' && chain.length > 0 && preview && (() => {
        // поле длины — у конца рисуемой стены, не вылезая за край плана
        const W = 196, H = 40;
        const ex = preview.b.x * view.s + view.ox + 16, ey = preview.b.y * view.s + view.oy + 12;
        const x = Math.min(Math.max(8, ex), size.w - W - 8), y = Math.min(Math.max(8, ey), size.h - H - 60);
        const bad = !!typed && parseLength(typed) === null;
        return (
          <foreignObject x={x} y={y} width={W} height={H}>
            <label className={`length-box${bad ? ' bad' : ''}`}>
              <span>Длина</span>
              <input ref={lengthRef} value={typed} placeholder={formatMeters(dist(preview.a, preview.b))}
                onChange={e => setTyped(e.target.value)} onKeyDown={onLengthKey} aria-label="Длина стены" />
            </label>
          </foreignObject>
        );
      })()}
      {tool === 'wall' && chain.length > 0 && (
        <foreignObject x={12} y={size.h - 64} width={size.w - 24} height={56}>
          <div className="chip">
            {typed && parseLength(typed) === null
              ? <><b className="bad">{typed}</b> не понимаю длину — пример: 3,40 или 340 или 3400 мм</>
              : <>Направление — мышью, длина — в поле: <b>3,40</b> · <b>340</b> · <b>3400 мм</b>, затем Enter. Или просто кликните. Esc — закончить</>}
          </div>
        </foreignObject>
      )}
      {tool === 'select' && selection.length > 1 && (
        <foreignObject x={12} y={size.h - 52} width={size.w - 24} height={40}>
          <div className="chip">Выбрано стен: <b>{selection.length}</b> · тяните, чтобы перенести · Delete — удалить</div>
        </foreignObject>
      )}
      {empty && tool === 'select' && (
        <text x={size.w / 2} y={size.h / 2} className="plan-empty" textAnchor="middle">Нажмите «Стена» слева или W и кликните на плане, чтобы начать</text>
      )}
    </svg>
  );
}

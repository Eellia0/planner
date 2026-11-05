import { useEffect, useMemo, useRef, useState } from 'react';
import { add, centroid, dist, intersect, mul, norm, roomInnerPolygon, segmentParam, signedArea, sub, wallLength, wallOutline } from '../core/geometry';
import * as ops from '../core/ops';
import type { Id, Point, Project, Wall } from '../core/types';
import { formatAngle, formatMeters, parseAngle, parseLength, round } from '../core/units';
import { useEditor, useShownProject } from '../store/editor';

// План сверху. Всё внутри рисуется в метрах; вид (масштаб и сдвиг) переводит метры в пиксели.
interface View { s: number; ox: number; oy: number }

/** Что сейчас тянут мышью в режиме «Выбор». */
type Drag =
  | { kind: 'move'; start: Point; nodes: Id[]; moved: boolean }
  | { kind: 'node'; start: Point; id: Id; moved: boolean; wall?: Id }
  | { kind: 'box'; start: Point; end: Point; add: boolean; moved: boolean };

const SNAP_PX = 12;              // радиус прилипания к узлу, пикселей
const GRID_SNAP = 0.05;          // шаг сетки для свободной точки, м
const ANGLE_STEP = Math.PI / 12; // 15°
const DRAG_PX = 3;               // меньше — это клик, а не перетаскивание
const EXACT = 0.002;             // набранная длина попала на стену или угол точнее 2 мм — встаём в них

/** Куда встанет точка: в существующий угол, на стену (Т-стык) или в свободное место. */
interface Snap { p: Point; node?: Id; wall?: Id }

const pts = (ps: Point[]) => ps.map(p => `${p.x},${p.y}`).join(' ');
const round2 = (p: Point): Point => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
const isTyping = (e: { target: EventTarget | null }) => (e.target as HTMLElement).closest?.('input, textarea, select');

export function PlanView() {
  const project = useShownProject();
  const tool = useEditor(s => s.tool);
  const chain = useEditor(s => s.chain);
  const start = useEditor(s => s.start);
  const drawing = chain.length > 0 || !!start;
  const selection = useEditor(s => s.selection);
  const selectedRoom = useEditor(s => s.room);
  const anchor = useEditor(s => s.anchor);
  const st = useEditor.getState();

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ s: 50, ox: 60, oy: 60 });
  const [cursor, setCursor] = useState<Point | null>(null);
  const [typed, setTyped] = useState('');
  const [typedAngle, setTypedAngle] = useState('');
  const [box, setBox] = useState<{ a: Point; b: Point } | null>(null);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const lengthRef = useRef<HTMLInputElement>(null);

  // поле длины получает фокус после каждой поставленной точки
  useEffect(() => { if (tool === 'wall' && drawing) lengthRef.current?.focus(); }, [tool, chain.length, start]);

  const clearTyped = () => { setTyped(''); setTypedAngle(''); };
  // Enter и Esc одинаково работают в полях длины и угла, Tab переходит между ними
  const onFieldKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const s = useEditor.getState();
    if (e.key === 'Enter') {
      e.preventDefault();
      const bad = (typed && parseLength(typed) === null) || (typedAngle && parseAngle(typedAngle) === null);
      if ((!typed && !typedAngle) || bad || !snap) return; // пусто или неразборчиво — не ставим
      s.placePoint(snap.p, snap.node, snap.wall);
      clearTyped();
      lengthRef.current?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (typed || typedAngle) clearTyped();
      else { s.endChain(); (e.target as HTMLInputElement).blur(); }
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
  const last = chain.length ? project.nodes[chain[chain.length - 1]!] : start?.p;
  // считается и по курсору для отрисовки, и по месту клика: быстрый клик сразу после движения не должен попасть в старую точку
  const snapAt = (cursor: Point | null): Snap | null => {
    if (tool !== 'wall' || !cursor) return null;
    const tol = SNAP_PX / view.s;
    const lastId = chain[chain.length - 1] ?? start?.node;
    const lastWall = start?.wall; // первая точка ещё не в проекте: её стену тоже пропускаем, вдоль неё не рисуют
    // направление: набранный угол (0° — вправо, 90° — вверх) или прилипание к углам через 15°
    const d = last ? sub(cursor, last) : { x: 0, y: 0 };
    const typedDeg = parseAngle(typedAngle);
    const ang = typedDeg !== null ? (-typedDeg * Math.PI) / 180 : Math.round(Math.atan2(d.y, d.x) / ANGLE_STEP) * ANGLE_STEP;
    const dir = { x: Math.cos(ang), y: Math.sin(ang) };

    // точка на луче: если она пришлась на угол или стену, встаём в них
    const exact = (p: Point): Snap => {
      const node = ops.nodeNear(project, p, EXACT);
      if (node && node !== lastId) return { p: project.nodes[node]!, node };
      const onWall = ops.wallNear(project, p, EXACT, lastId, lastWall);
      if (onWall && dist(onWall.p, p) <= EXACT) return { p: onWall.p, wall: onWall.id };
      return { p };
    };

    const typedLength = parseLength(typed);
    if (last && typedLength !== null) return exact(add(last, mul(dir, typedLength)));

    // угол набран — к углам у курсора не прилипаем, точка остаётся на луче
    const near = typedDeg === null ? ops.nodeNear(project, cursor, tol) : undefined;
    if (near && near !== lastId) return { p: project.nodes[near]!, node: near };
    const onWall = ops.wallNear(project, cursor, tol, lastId, lastWall);
    if (onWall) {
      const w = project.walls[onWall.id]!;
      const a = project.nodes[w.a]!, b = project.nodes[w.b]!;
      if (last) {
        // стена по направлению упирается в эту стену — встаём точно в точку упора
        const x = intersect(last, dir, a, sub(b, a));
        const t = x ? segmentParam(a, b, x) : 0;
        if (x && t > 0 && t < 1 && dist(x, cursor) <= 3 * tol && (x.x - last.x) * dir.x + (x.y - last.y) * dir.y > 0) {
          return { p: { x: round(x.x), y: round(x.y) }, wall: w.id };
        }
      }
      if (typedDeg === null) {
        // иначе — проекция курсора на стену, расстояние от её начала с точностью 1 см
        const along = Math.round(dist(a, onWall.p) * 100) / 100;
        const p = add(a, mul(norm(sub(b, a)), along));
        return { p: { x: round(p.x), y: round(p.y) }, wall: w.id };
      }
    }
    if (!last) return { p: { x: round(Math.round(cursor.x / GRID_SNAP) * GRID_SNAP), y: round(Math.round(cursor.y / GRID_SNAP) * GRID_SNAP) } };
    // длина — до курсора с точностью 1 см
    const length = Math.max(0.01, Math.round(Math.abs(d.x * dir.x + d.y * dir.y) * 100) / 100);
    return typedDeg === null ? { p: add(last, mul(dir, length)) } : exact(add(last, mul(dir, length)));
  };
  const snap = snapAt(cursor);

  // ---------- клавиатура ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = useEditor.getState();
      if (s.tool === 'wall') {
        if (e.key === 'Escape') {
          if (typed || typedAngle) clearTyped();
          else if (s.chain.length || s.start) s.endChain();
          else s.setTool('select');
          return;
        }
        // цифра, набранная мимо поля длины, всё равно попадает в него
        if ((s.chain.length || s.start) && /^[0-9]$/.test(e.key)) { setTyped(t => t + e.key); lengthRef.current?.focus(); e.preventDefault(); }
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
  }, [typed, typedAngle]);

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
      // при новой длине стоит угол, ближний к месту клика
      const w = project.walls[wallId]!;
      st.setAnchor(dist(p, project.nodes[w.a]!) <= dist(p, project.nodes[w.b]!) ? w.a : w.b);
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
      // значения берём сразу: функцию в setView React вызовет позже, когда кнопку могут уже отпустить и pan.current станет null
      const ox = pan.current.ox + e.clientX - pan.current.x, oy = pan.current.oy + e.clientY - pan.current.y;
      setView(v => ({ ...v, ox, oy }));
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
      const tol = SNAP_PX / view.s;
      const near = ops.nodeNear({ ...base, nodes: Object.fromEntries(Object.entries(base.nodes).filter(([id]) => id !== d.id)) }, p, tol);
      // угол прилипает к другим углам, а если их рядом нет — к стенам (встанет в стену Т-стыком)
      const onWall = near ? undefined : ops.wallNear(base, p, tol, d.id);
      d.wall = onWall?.id;
      const to = near ? base.nodes[near]! : onWall ? { x: round(onWall.p.x), y: round(onWall.p.y) } : round2(p);
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
      const at = snapAt(toPlan(e.clientX, e.clientY));
      if (at) { st.placePoint(at.p, at.node, at.wall); clearTyped(); }
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
      if (d.moved && preview) st.moveNode(d.id, preview.nodes[d.id]!, d.wall);
    } else {
      setBox(null);
      // просто клик: по полу — выбрать комнату, мимо — снять выбор
      if (!d.moved) { if (!d.add) st.selectRoom(ops.roomAt(useEditor.getState().project, p) ?? null); return; }
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
  const anchorOf = (w?: Wall) => (w && anchor === w.b ? w.b : w?.a);
  const empty = !Object.keys(project.walls).length;

  return (
    <svg ref={svgRef} className={`plan tool-${tool}`} onWheel={onWheel} onPointerDown={onPointerDown}
      onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerLeave={() => { if (!drawing) setCursor(null); }}
      onDoubleClick={e => {
        // двойной клик по полу — сразу переименовать комнату
        if (tool !== 'select' || !ops.roomAt(project, toPlan(e.clientX, e.clientY))) return;
        requestAnimationFrame(() => (document.getElementById('room-name') as HTMLInputElement | null)?.select());
      }}
      onContextMenu={e => e.preventDefault()}>
      <rect width="100%" height="100%" className="plan-paper" />
      <g transform={`translate(${view.ox} ${view.oy}) scale(${view.s})`}>
        {grid}

        {rooms.map(r => {
          const poly = roomInnerPolygon(project, r);
          const c = centroid(poly);
          return (
            <g key={r.id}>
              <polygon className={`room-floor${r.id === selectedRoom ? ' selected' : ''}`} points={pts(poly)} />
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
        {walls.filter(w => w.id !== snap?.wall).map(w => wallLabel(project.nodes[w.a]!, project.nodes[w.b]!, w.side, w.thickness, formatMeters(wallLength(project, w)), `l${w.id}`))}

        {handles.map(id => {
          const n = project.nodes[id]!;
          // у одной выбранной стены закрашен угол, который стоит при новой длине
          const fixed = selection.length === 1 && id === anchorOf(project.walls[selection[0]!]);
          return <rect key={id} data-node={id} className={`handle${fixed ? ' anchor' : ''}`} x={n.x - 5 * px} y={n.y - 5 * px} width={10 * px} height={10 * px} rx={2 * px} />;
        })}

        {tool === 'wall' && Object.values(project.nodes).map(n => (
          <circle key={n.id} className={`node${n.id === chain[0] && chain.length >= 3 ? ' close' : ''}`} cx={n.x} cy={n.y} r={4 * px} />
        ))}
        {tool === 'wall' && start && <circle className="node" cx={start.p.x} cy={start.p.y} r={4 * px} />}
        {preview && (
          <g className="preview">
            <line x1={preview.a.x} y1={preview.a.y} x2={preview.b.x} y2={preview.b.y} strokeWidth={project.defaultThickness} />
            {wallLabel(preview.a, preview.b, -1, project.defaultThickness, formatMeters(dist(preview.a, preview.b)), 'pl')}
          </g>
        )}
        {tool === 'wall' && snap && <circle className={`snap${snap.wall ? ' on-wall' : ''}`} cx={snap.p.x} cy={snap.p.y} r={5 * px} />}
        {tool === 'wall' && snap?.wall && project.walls[snap.wall] && (() => {
          // точка встаёт на стену — подписываем, сколько от неё до концов стены
          const w = project.walls[snap.wall]!, a = project.nodes[w.a]!, b = project.nodes[w.b]!;
          return (
            <g className="snap-dims">
              {wallLabel(a, snap.p, w.side, w.thickness, formatMeters(dist(a, snap.p)), 'sa')}
              {wallLabel(snap.p, b, w.side, w.thickness, formatMeters(dist(snap.p, b)), 'sb')}
            </g>
          );
        })()}

        {box && (
          <rect className={`marquee${box.b.x < box.a.x ? ' crossing' : ''}`}
            x={Math.min(box.a.x, box.b.x)} y={Math.min(box.a.y, box.b.y)}
            width={Math.abs(box.b.x - box.a.x)} height={Math.abs(box.b.y - box.a.y)} />
        )}
      </g>

      {tool === 'wall' && drawing && preview && (() => {
        // поля длины и угла — у конца рисуемой стены, не вылезая за край плана
        const W = 300, H = 40;
        const ex = preview.b.x * view.s + view.ox + 16, ey = preview.b.y * view.s + view.oy + 12;
        const x = Math.min(Math.max(8, ex), size.w - W - 8), y = Math.min(Math.max(8, ey), size.h - H - 60);
        const badLength = !!typed && parseLength(typed) === null;
        const badAngle = !!typedAngle && parseAngle(typedAngle) === null;
        // текущее направление для подсказки: 0° — вправо, 90° — вверх
        const deg = ((Math.atan2(preview.a.y - preview.b.y, preview.b.x - preview.a.x) * 180) / Math.PI + 360) % 360;
        return (
          <foreignObject x={x} y={y} width={W} height={H}>
            <div className={`length-box${badLength || badAngle ? ' bad' : ''}`}>
              <label>
                <span>Длина</span>
                <input ref={lengthRef} value={typed} placeholder={formatMeters(dist(preview.a, preview.b))} aria-invalid={badLength}
                  onChange={e => setTyped(e.target.value)} onKeyDown={onFieldKey} aria-label="Длина стены" />
              </label>
              <label className="angle">
                <span>Угол</span>
                <input value={typedAngle} placeholder={formatAngle(deg)} aria-invalid={badAngle}
                  onChange={e => setTypedAngle(e.target.value)} onKeyDown={onFieldKey} aria-label="Угол стены" />
              </label>
            </div>
          </foreignObject>
        );
      })()}
      {tool === 'wall' && drawing && (
        <foreignObject x={12} y={size.h - 64} width={size.w - 24} height={56}>
          <div className="chip">
            {typed && parseLength(typed) === null
              ? <><b className="bad">{typed}</b> не понимаю длину — пример: 3,40 или 340 или 3400 мм</>
              : typedAngle && parseAngle(typedAngle) === null
                ? <><b className="bad">{typedAngle}</b> не понимаю угол — пример: 30 или 22,5 или -45</>
                : <>Длина — в поле: <b>3,40</b> · <b>340</b> · <b>3400 мм</b>, Tab — угол: <b>0°</b> вправо, <b>90°</b> вверх. Enter — поставить. Или просто кликните. Esc — закончить</>}
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

import { useEffect, useRef, useState } from 'react';
import { PlanView } from './plan2d/PlanView';
import { redo, undo, useEditor, type Tool } from './store/editor';
import { Inspector } from './ui/Inspector';
import { ProjectMenu } from './ui/ProjectMenu';
import { Scene3D } from './view3d/Scene3D';

const TOOLS: [Tool, string, string, string][] = [
  ['select', 'Выбор', 'V', 'M4 3l6 16 2.5-6.5L19 10z'],
  ['wall', 'Стена', 'W', 'M3 17h18v3H3zM6 4h3v13H6z'],
];
type Layout = 'both' | 'plan' | '3d';
const LAYOUTS: [Layout, string][] = [['plan', 'План'], ['both', 'План + 3D'], ['3d', '3D']];

const SPLIT_KEY = 'planner.split';
const SPLIT_MIN = 0.2, SPLIT_MAX = 0.8;
const clampSplit = (v: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, v));

const GHOST_KEY = 'planner.ghostWalls';
function readGhost(): boolean {
  try { return localStorage.getItem(GHOST_KEY) !== 'off'; } catch { return true; }
}

function readSplit(): number {
  try { const v = Number(localStorage.getItem(SPLIT_KEY)); if (v) return clampSplit(v); } catch { /* нет доступа — пополам */ }
  return 0.5;
}

/** Полоска между планом и 3D: тянуть — менять доли, двойной клик — пополам, стрелки — по шагу. */
function Splitter({ split, onChange }: { split: number; onChange: (v: number) => void }) {
  const dragging = useRef(false);
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.parentElement!.getBoundingClientRect();
    onChange(clampSplit((e.clientX - box.left) / box.width));
  };
  return (
    <div className="splitter" role="separator" aria-orientation="vertical" aria-label="Ширина плана и 3D" tabIndex={0}
      aria-valuemin={SPLIT_MIN * 100} aria-valuemax={SPLIT_MAX * 100} aria-valuenow={Math.round(split * 100)}
      title="Тяните, чтобы поменять ширину. Двойной клик — пополам"
      onPointerDown={e => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); document.body.classList.add('resizing'); }}
      onPointerMove={e => { if (dragging.current) at(e); }}
      onPointerUp={() => { dragging.current = false; document.body.classList.remove('resizing'); }}
      onLostPointerCapture={() => { dragging.current = false; document.body.classList.remove('resizing'); }}
      onDoubleClick={() => onChange(0.5)}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(clampSplit(split - 0.05)); }
        if (e.key === 'ArrowRight') { e.preventDefault(); onChange(clampSplit(split + 0.05)); }
      }}>
      <span className="splitter-grip" aria-hidden="true">
        <svg viewBox="0 0 16 24"><path d="M6 7l-4 5 4 5zM10 7l4 5-4 5z" /></svg>
      </span>
    </div>
  );
}

// Каркас окна: сверху панель проекта, слева инструменты, в центре план и 3D, справа свойства.
export function App() {
  const tool = useEditor(s => s.tool);
  const setTool = useEditor(s => s.setTool);
  const [layout, setLayout] = useState<Layout>('both');
  const [split, setSplit] = useState(readSplit);
  const [ghost, setGhost] = useState(readGhost);
  useEffect(() => { try { localStorage.setItem(GHOST_KEY, ghost ? 'on' : 'off'); } catch { /* не запомнится — не страшно */ } }, [ghost]);
  useEffect(() => { try { localStorage.setItem(SPLIT_KEY, String(split)); } catch { /* не запомнится — не страшно */ } }, [split]);

  // горячие клавиши, общие для всего окна
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'я')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'н')) { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useEditor.getState();
      if (s.chain.length || s.start) return; // во время рисования буквы не переключают инструмент
      if (k === 'v' || k === 'м') setTool('select');
      if (k === 'w' || k === 'ц') setTool('wall');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Планировщик</span>
        <ProjectMenu />
        <span className="spacer" />
        <div className="pills" role="group" aria-label="Вид">
          {LAYOUTS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={layout === key} onClick={() => setLayout(key)}>{label}</button>
          ))}
        </div>
        <div className="pills" role="group" aria-label="История">
          <button type="button" onClick={undo} title="Отменить (Ctrl+Z)">Отменить</button>
          <button type="button" onClick={redo} title="Повторить (Ctrl+Y)">Повторить</button>
        </div>
      </header>

      <nav className="tools" aria-label="Инструменты">
        {TOOLS.map(([key, label, hot, icon]) => (
          <button key={key} type="button" className="tool" aria-pressed={tool === key} onClick={() => setTool(key)} title={`${label} (${hot})`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
            <span>{label}</span>
            <kbd>{hot}</kbd>
          </button>
        ))}
      </nav>

      <main className={`views layout-${layout}`}
        style={layout === 'both' ? { gridTemplateColumns: `minmax(0, ${split}fr) 16px minmax(0, ${1 - split}fr)` } : undefined}>
        <section className="pane pane-plan" aria-label="План">
          <PlanView />
          <span className="pane-tag">План</span>
        </section>
        {layout === 'both' && <Splitter split={split} onChange={setSplit} />}
        <section className="pane pane-3d" aria-label="3D">
          <Scene3D ghost={ghost} />
          <span className="pane-tag">3D · тяните — вращение, колесо — масштаб</span>
          <button type="button" className="pane-switch" role="switch" aria-checked={ghost} onClick={() => setGhost(!ghost)}
            title="Стены между камерой и серединой вида становятся прозрачными. Выключите, чтобы смотреть на стены снаружи">
            <i aria-hidden="true" />Прозрачные стены
          </button>
        </section>
      </main>

      <Inspector />
    </div>
  );
}

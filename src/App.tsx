import { useEffect, useState } from 'react';
import { PlanView } from './plan2d/PlanView';
import { redo, undo, useEditor, type Tool } from './store/editor';
import { Inspector } from './ui/Inspector';
import { Scene3D } from './view3d/Scene3D';

const TOOLS: [Tool, string, string, string][] = [
  ['select', 'Выбор', 'V', 'M4 3l6 16 2.5-6.5L19 10z'],
  ['wall', 'Стена', 'W', 'M3 17h18v3H3zM6 4h3v13H6z'],
];
type Layout = 'both' | 'plan' | '3d';
const LAYOUTS: [Layout, string][] = [['plan', 'План'], ['both', 'План + 3D'], ['3d', '3D']];

// Каркас окна: сверху панель проекта, слева инструменты, в центре план и 3D, справа свойства.
export function App() {
  const tool = useEditor(s => s.tool);
  const setTool = useEditor(s => s.setTool);
  const [layout, setLayout] = useState<Layout>('both');

  // горячие клавиши, общие для всего окна
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'я')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'н')) { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (useEditor.getState().chain.length) return; // во время рисования буквы не переключают инструмент
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

      <main className={`views layout-${layout}`}>
        <section className="pane pane-plan" aria-label="План">
          <PlanView />
          <span className="pane-tag">План</span>
        </section>
        <section className="pane pane-3d" aria-label="3D">
          <Scene3D />
          <span className="pane-tag">3D · тяните — вращение, колесо — масштаб</span>
        </section>
      </main>

      <Inspector />
    </div>
  );
}

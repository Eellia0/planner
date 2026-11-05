import { useEffect, useRef, useState } from 'react';
import type { Project } from '../core/types';
import { useEditor } from '../store/editor';
import { createProject, deleteProject, exportProject, importProject, listProjects, switchProject, useSaveStatus } from '../store/projects';

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Действие с понятной ошибкой вместо тихого провала. */
async function attempt(action: () => Promise<unknown>) {
  try { await action(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
}

/** Кнопка с названием проекта в шапке: список проектов, новый, файл. Ctrl+S — в файл, Ctrl+O — из файла. */
export function ProjectMenu() {
  const name = useEditor(s => s.project.name);
  const currentId = useEditor(s => s.project.id);
  const status = useSaveStatus();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Project[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) void listProjects().then(setList); }, [open, currentId]);

  // закрыть по клику мимо и по Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 's' || k === 'ы') { e.preventDefault(); void attempt(exportProject); }
      if (k === 'o' || k === 'щ') { e.preventDefault(); fileInput.current?.click(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (action: () => Promise<unknown>) => { setOpen(false); void attempt(action); };
  const remove = (p: Project) => {
    if (!confirm(`Удалить проект «${p.name}»? Вернуть его можно будет только из файла.`)) return;
    void attempt(async () => { await deleteProject(p.id); setList(await listProjects()); });
  };

  const statusText = status.state === 'error' ? 'не сохраняется!' : status.state === 'pending' ? 'сохраняю…' : 'сохранено';

  return (
    <div className="project-menu" ref={root}>
      <button type="button" className="project-btn" aria-expanded={open} onClick={() => setOpen(!open)} title="Проекты">
        <span className="project-name">{name}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5z" /></svg>
      </button>
      <span className={`save-status ${status.state}`} title={status.error || 'Проект сохраняется в браузере сам'}>{statusText}</span>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(() => importProject(f)); }} />

      {open && (
        <div className="project-pop" role="dialog" aria-label="Проекты">
          <div className="project-actions">
            <button type="button" className="ghost" onClick={() => pick(createProject)}>Новый проект</button>
            <button type="button" className="ghost" onClick={() => { setOpen(false); fileInput.current?.click(); }} title="Ctrl+O">Открыть файл…</button>
            <button type="button" className="ghost" onClick={() => pick(exportProject)} title="Ctrl+S">Сохранить в файл</button>
          </div>
          <p className="hint">Проекты хранятся в этом браузере. Если почистить данные браузера, они пропадут — сохраняйте важное в файл.</p>
          <ul className="project-list">
            {list.map(p => (
              <li key={p.id} className={p.id === currentId ? 'current' : undefined}>
                <button type="button" className="project-open" onClick={() => pick(() => switchProject(p.id))}>
                  <b>{p.name}</b>
                  <span>{when(p.updatedAt)} · помещений {Object.keys(p.rooms).length}</span>
                </button>
                <button type="button" className="project-del" onClick={() => remove(p)} title="Удалить проект" aria-label={`Удалить «${p.name}»`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 13H7zM9 4h6l1 2H8z" /></svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

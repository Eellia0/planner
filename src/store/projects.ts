// Проекты в IndexedDB (Dexie): список, открытие, автосохранение, файл проекта.
// Открыт всегда ровно один проект — тот, что лежит в хранилище редактора.
import { Dexie, type EntityTable } from 'dexie';
import { create } from 'zustand';
import { dropLooseNodes } from '../core/ops';
import { fileName, projectFromFile, projectToFile } from '../core/projectFile';
import { emptyProject, type Id, type Project } from '../core/types';
import { openProject, useEditor } from './editor';

const db = new Dexie('planner') as Dexie & { projects: EntityTable<Project, 'id'> };
db.version(1).stores({ projects: 'id, updatedAt' });

const CURRENT_KEY = 'planner.current'; // какой проект открыт
const OLD_KEY = 'planner.project'; // где лежал единственный проект до списка проектов

/** Состояние сохранения для шапки. */
export const useSaveStatus = create<{ state: 'saved' | 'pending' | 'error'; error: string }>(() => ({ state: 'saved', error: '' }));

let pending: Project | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Записать отложенные изменения сразу (перед сменой проекта, выгрузкой в файл, закрытием вкладки). */
export async function flush() {
  clearTimeout(timer);
  if (!pending) return;
  const p = pending;
  pending = null;
  try {
    await db.projects.put({ ...p, updatedAt: Date.now() });
    if (!pending) useSaveStatus.setState({ state: 'saved', error: '' });
  } catch (e) {
    useSaveStatus.setState({ state: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

function remember(id: Id) {
  try { localStorage.setItem(CURRENT_KEY, id); } catch { /* не страшно: откроется последний изменённый */ }
}

function show(p: Project) {
  dropLooseNodes(p); // точки без стен оставались от брошенного начала цепочки
  openProject(p);
  remember(p.id);
}

/** При запуске: перенести старый проект из localStorage, открыть последний, включить автосохранение. */
export async function initProjects() {
  let current: string | null = null;
  try {
    current = localStorage.getItem(CURRENT_KEY);
    const old = localStorage.getItem(OLD_KEY);
    if (!current && old) {
      // старую копию не стираем: она ничему не мешает, а данные целы при любой ошибке
      const p = JSON.parse(old) as Project;
      if (!(await db.projects.get(p.id))) await db.projects.put(p);
      current = p.id;
    }
  } catch { /* localStorage недоступен или испорчен — просто откроем последний */ }

  let p = current ? await db.projects.get(current) : undefined;
  p ??= await db.projects.orderBy('updatedAt').last();
  if (!p) { p = emptyProject(); await db.projects.put(p); }
  show(p);

  useEditor.subscribe((s, prev) => {
    // смена проекта — не правка: не трогаем его дату
    if (s.project === prev.project || s.project.id !== prev.project.id) return;
    pending = s.project;
    useSaveStatus.setState({ state: 'pending' });
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  });
  // при закрытии вкладки не ждём таймера
  window.addEventListener('pagehide', () => { void flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); });
}

/** Все проекты, последний изменённый сверху. */
export async function listProjects(): Promise<Project[]> {
  await flush();
  return db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function switchProject(id: Id) {
  await flush();
  const p = await db.projects.get(id);
  if (p) show(p);
}

export async function createProject() {
  await flush();
  const p = emptyProject();
  await db.projects.put(p);
  show(p);
}

/** Удалить проект. Если он открыт — открывается последний изменённый из оставшихся или новый. */
export async function deleteProject(id: Id) {
  await flush();
  await db.projects.delete(id);
  if (useEditor.getState().project.id !== id) return;
  const next = await db.projects.orderBy('updatedAt').last();
  if (next) show(next);
  else await createProject();
}

/** Загрузить проект из файла: он появляется в списке новым проектом и открывается. Ошибка — с текстом для пользователя. */
export async function importProject(file: File) {
  const p = projectFromFile(await file.text());
  await flush();
  await db.projects.put(p);
  show(p);
}

// окно «Сохранить как» есть в Edge и Chrome; в остальных браузерах файл уходит в «Загрузки»
type SavePicker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) =>
  Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;

/** Сохранить открытый проект в файл. false — пользователь закрыл окно выбора файла. */
export async function exportProject(): Promise<boolean> {
  await flush();
  const project = useEditor.getState().project;
  const blob = new Blob([projectToFile(project)], { type: 'application/json' });
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: fileName(project), types: [{ description: 'Проект планировщика', accept: { 'application/json': ['.json'] } }] });
      const out = await handle.createWritable();
      await out.write(blob);
      await out.close();
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false;
      throw e;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName(project);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

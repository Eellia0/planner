import { useEffect, useState } from 'react';
import { interiorSide, roomInnerPolygon, roomsOfWall, signedArea, wallLength } from '../core/geometry';
import type { WallSide } from '../core/types';
import { formatCm, formatMeters, parseLength } from '../core/units';
import { useEditor } from '../store/editor';

/** Поле длины: принимает «340», «3,40», «3400 мм»; применяет по Enter или при уходе из поля. */
function LengthField({ label, value, format, onCommit }: {
  label: string; value: number | null; format: (m: number) => string; onCommit: (m: number) => void;
}) {
  const shown = value === null ? '' : format(value);
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(shown); setBad(false); }, [shown]);
  const commit = () => {
    if (text === shown) return;
    const m = parseLength(text);
    if (m === null || m <= 0) { setBad(true); return; }
    setBad(false);
    onCommit(m);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input value={text} placeholder={value === null ? 'разные' : undefined} aria-invalid={bad}
        onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setText(shown); }} />
    </label>
  );
}

const meters = (m: number) => `${formatMeters(m)} м`;
const cm = (m: number) => `${formatCm(m)} см`;

export function Inspector() {
  const project = useEditor(s => s.project);
  const selection = useEditor(s => s.selection);
  const st = useEditor.getState();
  const walls = selection.map(id => project.walls[id]).filter(w => !!w);
  const wall = walls.length === 1 ? walls[0] : undefined;

  // «наружу» и «внутрь» есть только у стены одной комнаты; у перегородки между двумя — просто стороны
  const wallRooms = wall ? roomsOfWall(project, wall) : [];
  const room = wallRooms.length === 1 ? wallRooms[0] : undefined;
  const inside = wall && room ? interiorSide(project, room, wall) : 1;
  const sides: [WallSide, string][] = room
    ? [[(-inside) as WallSide, 'наружу'], [inside, 'внутрь'], [0, 'по центру']]
    : [[-1, 'в одну сторону'], [1, 'в другую'], [0, 'по центру']];

  const rooms = Object.values(project.rooms);
  const total = rooms.reduce((s, r) => s + Math.abs(signedArea(roomInnerPolygon(project, r))), 0);
  const sameThickness = walls.length && walls.every(w => w.thickness === walls[0]!.thickness) ? walls[0]!.thickness : null;

  return (
    <aside className="inspector" aria-label="Свойства">
      <header className="insp-head">
        <p className="eyebrow">Проект</p>
        <h1>{project.name}</h1>
        <p className="kv-line">
          <span>Помещений <b>{rooms.length}</b></span>
          <span>Площадь <b>{formatMeters(total)} м²</b></span>
        </p>
      </header>

      {wall ? (
        <section className="card">
          <h2>Стена</h2>
          <LengthField label="Длина" value={wallLength(project, wall)} format={meters} onCommit={m => st.setWallLength(wall.id, m)} />
          <LengthField label="Толщина" value={wall.thickness} format={cm} onCommit={m => st.setWallThickness([wall.id], m)} />
          <div className="field">
            <span>Толщина растёт</span>
            <div className="seg">
              {sides.map(([side, text]) => (
                <button key={text} type="button" aria-pressed={wall.side === side} onClick={() => st.setWallSide(wall.id, side)}>{text}</button>
              ))}
            </div>
          </div>
          <p className="hint">Длина — по линии, на которой стену рисовали{room ? ': у комнаты это внутренняя сторона' : ''}. Новая длина двигает дальний конец.</p>
          <button type="button" className="danger" onClick={() => st.deleteWalls([wall.id])}>Удалить стену</button>
        </section>
      ) : walls.length > 1 ? (
        <section className="card">
          <h2>Выбрано стен: {walls.length}</h2>
          <LengthField label="Толщина всех" value={sameThickness} format={cm} onCommit={m => st.setWallThickness(selection, m)} />
          <p className="hint">Тяните любую из выбранных стен — переедут все. Стрелки сдвигают на 1 см, с Shift — на 10 см.</p>
          <button type="button" className="danger" onClick={() => st.deleteWalls(selection)}>Удалить выбранные</button>
        </section>
      ) : null}

      <section className="card">
        <h2>Параметры</h2>
        <LengthField label="Высота потолка" value={project.ceilingHeight} format={meters} onCommit={st.setCeilingHeight} />
        <LengthField label="Толщина новых стен" value={project.defaultThickness} format={cm} onCommit={st.setDefaultThickness} />
      </section>

      {!walls.length && (
        <section className="card">
          <h2>Как работать</h2>
          <ul className="help">
            <li><kbd>W</kbd> — стена: клик, затем наберите длину (<kbd>3,40</kbd>, <kbd>340</kbd>, <kbd>3400 мм</kbd>) и <kbd>Enter</kbd>. Клик в начало замыкает комнату.</li>
            <li><kbd>V</kbd> — выбор: клик по стене, <kbd>Shift</kbd> — добавить. Рамка слева направо — стены целиком, справа налево — всё, чего касается.</li>
            <li>Тяните стену или квадратик угла, чтобы перенести. <kbd>Delete</kbd> — удалить, <kbd>Ctrl+A</kbd> — всё.</li>
            <li>Колесо — масштаб, правая кнопка — сдвиг вида, <kbd>Ctrl+Z</kbd> — отменить.</li>
          </ul>
        </section>
      )}
    </aside>
  );
}

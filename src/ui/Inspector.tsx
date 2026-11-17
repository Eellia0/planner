import { interiorSide, perimeter, roomInnerPolygon, roomsOfWall, signedArea, wallLength } from "../core/geometry";
import { wallHeight } from "../core/openings";
import * as ops from "../core/ops";
import type { Face, Project, WallSide } from "../core/types";
import { formatCm, formatMeters } from "../core/units";
import { useEditor } from "../store/editor";
import { ColorField } from "./ColorField";
import { LengthField, TextField } from "./fields";
import { OpeningCard } from "./OpeningCard";

/** Общий цвет граней: undefined — все без цвета, null — разные. */
function commonPaint(project: Project, faces: Face[]): string | undefined | null {
  if (!faces.length) return undefined;
  const all = faces.map((f) => ops.paintOf(project.walls[f.wall]!, f.side));
  return all.every((c) => c === all[0]) ? all[0] : null;
}

const meters = (m: number) => `${formatMeters(m)} м`;
const cm = (m: number) => `${formatCm(m)} см`;

export function Inspector() {
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  const roomId = useEditor((s) => s.room);
  const openingId = useEditor((s) => s.opening);
  const opening = openingId ? project.openings[openingId] : undefined;
  const st = useEditor.getState();
  const selectedRoom = roomId ? project.rooms[roomId] : undefined;
  const roomFloor = selectedRoom ? roomInnerPolygon(project, selectedRoom) : [];
  const walls = selection.map((id) => project.walls[id]).filter((w) => !!w);
  const wall = walls.length === 1 ? walls[0] : undefined;

  // «наружу» и «внутрь» есть только у стены одной комнаты; у перегородки между двумя — просто стороны
  const wallRooms = wall ? roomsOfWall(project, wall) : [];
  const room = wallRooms.length === 1 ? wallRooms[0] : undefined;
  const inside = wall && room ? interiorSide(project, room, wall) : 1;
  const sides: [WallSide, string][] = room
    ? [
        [-inside as WallSide, "наружу"],
        [inside, "внутрь"],
        [0, "по центру"],
      ]
    : [
        [-1, "в одну сторону"],
        [1, "в другую"],
        [0, "по центру"],
      ];

  // концы стены называем по положению на плане: у пологой — левый и правый, у крутой — верхний и нижний
  const anchor = useEditor((s) => s.anchor);
  const fixed = wall && anchor === wall.b ? wall.b : wall?.a;
  let ends: [string, string][] = [];
  if (wall) {
    const a = project.nodes[wall.a]!;
    const b = project.nodes[wall.b]!;
    const flat = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const aFirst = flat ? a.x <= b.x : a.y <= b.y;
    const [first, second] = flat ? ["левый угол", "правый угол"] : ["верхний угол", "нижний угол"];
    ends = aFirst
      ? [
          [wall.a, first],
          [wall.b, second],
        ]
      : [
          [wall.b, first],
          [wall.a, second],
        ];
  }

  const rooms = Object.values(project.rooms);
  const total = rooms.reduce((s, r) => s + Math.abs(signedArea(roomInnerPolygon(project, r))), 0);
  // цвет граней: у стены одной комнаты — изнутри и снаружи, у перегородки — со стороны каждой комнаты
  const faceFields: [string, Face][] = !wall
    ? []
    : room
      ? [
          ["Цвет изнутри", { wall: wall.id, side: inside }],
          ["Цвет снаружи", { wall: wall.id, side: -inside as 1 | -1 }],
        ]
      : wallRooms.length === 2
        ? wallRooms.map((r) => [`Цвет со стороны «${r.name}»`, { wall: wall.id, side: interiorSide(project, r, wall) }])
        : [
            ["Цвет с одной стороны", { wall: wall.id, side: 1 }],
            ["Цвет с другой стороны", { wall: wall.id, side: -1 }],
          ];
  const multiFaces = walls.length > 1 ? ops.insideFaces(project, walls) : [];
  const roomFaces = selectedRoom ? ops.roomFaces(project, selectedRoom) : [];

  const sameThickness =
    walls.length && walls.every((w) => w.thickness === walls[0]!.thickness) ? walls[0]!.thickness : null;
  const heights = walls.map((w) => wallHeight(project, w));
  const sameHeight = heights.length && heights.every((h) => h === heights[0]) ? heights[0]! : null;

  return (
    <aside className="inspector" aria-label="Свойства">
      <header className="insp-head">
        <p className="eyebrow">Проект</p>
        <h1>{project.name}</h1>
        <p className="kv-line">
          <span>
            Помещений <b>{rooms.length}</b>
          </span>
          <span>
            Площадь <b>{formatMeters(total)} м²</b>
          </span>
        </p>
      </header>

      {opening ? (
        <OpeningCard key={opening.id} project={project} o={opening} />
      ) : wall ? (
        <section className="card">
          <h2>Стена</h2>
          <LengthField
            label="Длина"
            value={wallLength(project, wall)}
            format={meters}
            onCommit={(m) => st.setWallLength(wall.id, m)}
          />
          <div className="field">
            <span>При новой длине стоит</span>
            <div className="seg">
              {ends.map(([id, text]) => (
                <button key={id} type="button" aria-pressed={fixed === id} onClick={() => st.setAnchor(id)}>
                  {text}
                </button>
              ))}
            </div>
          </div>
          <LengthField
            label="Толщина"
            value={wall.thickness}
            format={cm}
            onCommit={(m) => st.setWallThickness([wall.id], m)}
          />
          <LengthField
            label={wall.height === undefined ? "Высота (до потолка)" : "Высота"}
            value={wallHeight(project, wall)}
            format={meters}
            onCommit={(m) => st.setWallHeight([wall.id], m)}
          />
          {wall.height !== undefined && (
            <button type="button" className="ghost" onClick={() => st.setWallHeight([wall.id], null)}>
              Сделать до потолка
            </button>
          )}
          <div className="field">
            <span>Толщина растёт</span>
            <div className="seg">
              {sides.map(([side, text]) => (
                <button
                  key={text}
                  type="button"
                  aria-pressed={wall.side === side}
                  onClick={() => st.setWallSide(wall.id, side)}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
          {faceFields.map(([label, f]) => (
            <ColorField
              key={label}
              label={label}
              value={ops.paintOf(wall, f.side)}
              onPick={(c) => st.paintFaces([f], c)}
            />
          ))}
          <p className="hint">
            Длина — по линии, на которой стену рисовали{room ? ": у комнаты это внутренняя сторона" : ""}. Закрашенный
            угол стоит на месте, другой едет, а соседняя стена у него переезжает параллельно.
          </p>
          <button type="button" className="danger" onClick={() => st.deleteWalls([wall.id])}>
            Удалить стену
          </button>
        </section>
      ) : walls.length > 1 ? (
        <section className="card">
          <h2>Выбрано стен: {walls.length}</h2>
          <LengthField
            label="Толщина всех"
            value={sameThickness}
            format={cm}
            onCommit={(m) => st.setWallThickness(selection, m)}
          />
          <LengthField
            label="Высота всех"
            value={sameHeight}
            format={meters}
            onCommit={(m) => st.setWallHeight(selection, m)}
          />
          {multiFaces.length > 0 && (
            <ColorField
              label="Цвет изнутри"
              value={commonPaint(project, multiFaces)}
              onPick={(c) => st.paintFaces(multiFaces, c)}
            />
          )}
          <p className="hint">
            Тяните любую из выбранных стен — переедут все. Стрелки сдвигают на 1 см, с Shift — на 10 см.
          </p>
          <button type="button" className="danger" onClick={() => st.deleteWalls(selection)}>
            Удалить выбранные
          </button>
        </section>
      ) : selectedRoom ? (
        <section className="card">
          <h2>Комната</h2>
          <TextField
            id="room-name"
            label="Название"
            value={selectedRoom.name}
            onCommit={(v) => st.renameRoom(selectedRoom.id, v)}
          />
          <p className="kv-line">
            <span>
              Площадь <b>{formatMeters(Math.abs(signedArea(roomFloor)))} м²</b>
            </span>
            <span>
              Периметр <b>{formatMeters(perimeter(roomFloor))} м</b>
            </span>
          </p>
          <ColorField
            label="Цвет стен"
            value={commonPaint(project, roomFaces)}
            onPick={(c) => st.paintFaces(roomFaces, c)}
          />
          <p className="hint">
            Площадь и периметр — по внутренним граням стен. Цвет стен — для всех стен комнаты изнутри; отдельную стену
            можно перекрасить, выбрав её.
          </p>
          <button
            type="button"
            className="ghost"
            onClick={() => st.setSelection(ops.wallsOfRoom(project, selectedRoom))}
          >
            Выбрать стены комнаты
          </button>
        </section>
      ) : null}

      <section className="card">
        <h2>Параметры</h2>
        <TextField id="project-name" label="Название проекта" value={project.name} onCommit={st.renameProject} />
        <LengthField
          label="Высота потолка"
          value={project.ceilingHeight}
          format={meters}
          onCommit={st.setCeilingHeight}
        />
        <LengthField
          label="Толщина новых стен"
          value={project.defaultThickness}
          format={cm}
          onCommit={st.setDefaultThickness}
        />
      </section>

      {!walls.length && !selectedRoom && !opening && (
        <section className="card">
          <h2>Как работать</h2>
          <ul className="help">
            <li>
              <kbd>W</kbd> — стена: клик, затем наберите длину (<kbd>3,40</kbd>, <kbd>340</kbd>, <kbd>3400 мм</kbd>) и{" "}
              <kbd>Enter</kbd>, <kbd>Tab</kbd> — угол (0° вправо, 90° вверх). Клик в начало замыкает комнату.
            </li>
            <li>
              <kbd>O</kbd> — окно, <kbd>D</kbd> — дверь: клик по стене. Вид (панорамное, балконная, проём), размеры и
              отступ от угла — в свойствах.
            </li>
            <li>
              <kbd>V</kbd> — выбор: клик по стене, <kbd>Shift</kbd> — добавить. Рамка слева направо — стены целиком,
              справа налево — всё, чего касается.
            </li>
            <li>Клик по полу — комната (двойной — сразу переименовать).</li>
            <li>
              Тяните стену или квадратик угла, чтобы перенести. <kbd>Delete</kbd> — удалить, <kbd>Ctrl+A</kbd> — всё.
            </li>
            <li>
              Колесо — масштаб, правая кнопка — сдвиг вида, <kbd>Ctrl+Z</kbd> — отменить.
            </li>
          </ul>
        </section>
      )}
    </aside>
  );
}

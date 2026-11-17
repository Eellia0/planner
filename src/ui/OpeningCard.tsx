import { useState } from "react";
import { interiorSide, roomsOfWall, wallLength } from "../core/geometry";
import { badOpenings, hasLeaf, isWindow, KIND_NAMES, sashCount } from "../core/openings";
import type { Opening, OpeningKind, Project } from "../core/types";
import { formatCm, formatMeters } from "../core/units";
import { useEditor } from "../store/editor";
import { LengthField } from "./fields";

const cm = (m: number) => `${formatCm(m)} см`;
const WINDOW_KINDS: [OpeningKind, string][] = [
  ["window", "обычное"],
  ["panorama", "панорамное"],
];
const DOOR_KINDS: [OpeningKind, string][] = [
  ["door", "дверь"],
  ["balcony", "балконная"],
  ["passage", "проём"],
];

/** Свойства окна или двери: вид, размеры, расстояние от угла, у двери — петли и куда открывается. */
export function OpeningCard({ project, o }: { project: Project; o: Opening }) {
  const st = useEditor.getState();
  const [pick, setPick] = useState(0); // отступ от первого (левого или верхнего) угла или от второго
  const wall = project.walls[o.wall];
  if (!wall) return null;
  const length = wallLength(project, wall);

  // концы стены по положению на плане: у пологой — левый и правый, у крутой — верхний и нижний
  const a = project.nodes[wall.a]!;
  const b = project.nodes[wall.b]!;
  const flat = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const aFirst = flat ? a.x <= b.x : a.y <= b.y;
  const [first, second] = flat
    ? [
        ["левого", "слева"],
        ["правого", "справа"],
      ]
    : [
        ["верхнего", "сверху"],
        ["нижнего", "снизу"],
      ];
  const name = { a: aFirst ? first! : second!, b: aFirst ? second! : first! };
  const order: ("a" | "b")[] = aFirst ? ["a", "b"] : ["b", "a"]; // кнопки — в том порядке, как концы видны на плане
  const from = order[pick]!;

  const fromValue = from === "a" ? o.offset : length - o.offset - o.width;
  const rooms = roomsOfWall(project, wall);
  const swings: [1 | -1, string][] =
    rooms.length === 1
      ? [
          [interiorSide(project, rooms[0]!, wall), "внутрь"],
          [-interiorSide(project, rooms[0]!, wall) as 1 | -1, "наружу"],
        ]
      : rooms.length === 2
        ? rooms.map((r) => [interiorSide(project, r, wall), `в «${r.name}»`])
        : [
            [1, "в одну сторону"],
            [-1, "в другую"],
          ];
  const kinds = isWindow(o.kind) ? WINDOW_KINDS : DOOR_KINDS;
  const n = sashCount(o);
  const bad = badOpenings(project).has(o.id);

  return (
    <section className="card">
      <h2>{KIND_NAMES[o.kind]}</h2>
      <div className="field">
        <span>Вид</span>
        <div className="seg">
          {kinds.map(([k, text]) => (
            <button key={k} type="button" aria-pressed={o.kind === k} onClick={() => st.setOpeningKind(o.id, k)}>
              {text}
            </button>
          ))}
        </div>
      </div>
      <LengthField label="Ширина" value={o.width} format={cm} onCommit={(m) => st.updateOpening(o.id, { width: m })} />
      {isWindow(o.kind) && (
        <p className="kv-line">
          <span>
            Створок <b>{n}</b>
            {n > 1 && (
              <>
                {" "}
                по <b>{formatMeters(o.width / n)} м</b>
              </>
            )}
          </span>
        </p>
      )}
      <LengthField
        label="Высота"
        value={o.height}
        format={cm}
        onCommit={(m) => st.updateOpening(o.id, { height: m })}
      />
      {isWindow(o.kind) && (
        <LengthField
          label="Низ от пола (подоконник)"
          value={o.sill}
          format={cm}
          onCommit={(m) => st.updateOpening(o.id, { sill: m })}
        />
      )}
      <div className="field">
        <span>Отступ от угла</span>
        <div className="seg">
          {order.map((end, i) => (
            <button key={end} type="button" aria-pressed={from === end} onClick={() => setPick(i)}>
              от {name[end][0]}
            </button>
          ))}
        </div>
      </div>
      <LengthField
        label={`От ${name[from][0]} угла до края`}
        value={fromValue}
        format={cm}
        onCommit={(m) => st.updateOpening(o.id, { offset: from === "a" ? m : length - o.width - m })}
      />
      {hasLeaf(o.kind) && (
        <>
          <div className="field">
            <span>Петли</span>
            <div className="seg">
              {order.map((end) => (
                <button
                  key={end}
                  type="button"
                  aria-pressed={o.hinge === end}
                  onClick={() => st.updateOpening(o.id, { hinge: end })}
                >
                  {name[end][1]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Открывается</span>
            <div className="seg">
              {swings.map(([side, text]) => (
                <button
                  key={text}
                  type="button"
                  aria-pressed={o.swing === side}
                  onClick={() => st.updateOpening(o.id, { swing: side })}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {bad && <p className="hint bad">Не помещается в стену или заходит на другой проём.</p>}
      <p className="hint">
        На плане тяните проём вдоль стены, а квадратики по краям — чтобы поменять ширину.
        {isWindow(o.kind) ? " Окно шире 90 см само делится на створки." : ""}
      </p>
      <button type="button" className="danger" onClick={() => st.deleteOpening(o.id)}>
        Удалить
      </button>
    </section>
  );
}

import { FLAT, normalizeRotation } from "../core/items";
import type { Item } from "../core/types";
import { formatCm } from "../core/units";
import { catalogItem } from "../furniture/catalog";
import type { PlanPart } from "../furniture/parts";

// Предмет на плане рисуется в своих осях: translate в центр, rotate по повороту, сдвиг на полразмера —
// дальше x идёт по ширине от левого края, y — по глубине от спинки к переду (как x и z у деталей каталога).

type Shape = Pick<Item, "type" | "width" | "depth" | "height">;

export const itemTransform = (it: Item) =>
  `translate(${it.x} ${it.y}) rotate(${it.rotation}) translate(${-it.width / 2} ${-it.depth / 2})`;

/** Значок сверху: детали каталога; у своей модели — галочка у переда, чтобы было видно, куда она смотрит. */
function planDetails(it: Shape): PlanPart[] {
  const c = catalogItem(it.type);
  if (c) return c.plan?.({ w: it.width, d: it.depth, h: it.height }) ?? [];
  const k = Math.min(it.width, it.depth) * 0.14;
  const x = it.width / 2;
  return [
    {
      kind: "path",
      points: [
        [x - k, it.depth - 2 * k],
        [x, it.depth - k],
        [x + k, it.depth - 2 * k],
      ],
    },
  ];
}

function PartShape({ p }: { p: PlanPart }) {
  switch (p.kind) {
    case "rect":
      return (
        <rect
          x={Math.min(p.x0, p.x1)}
          y={Math.min(p.z0, p.z1)}
          width={Math.abs(p.x1 - p.x0)}
          height={Math.abs(p.z1 - p.z0)}
          rx={p.r}
        />
      );
    case "circle":
      return <circle cx={p.x} cy={p.z} r={p.r} />;
    case "line":
      return <line x1={p.x0} y1={p.z0} x2={p.x1} y2={p.z1} />;
    case "path":
      return <polyline points={p.points.map(([x, z]) => `${x},${z}`).join(" ")} />;
  }
}

/** Контур и значок; id — для клика по предмету. */
function Body({ it, id }: { it: Shape; id?: string }) {
  const w = it.width;
  const d = it.depth;
  return (
    <>
      {catalogItem(it.type)?.round ? (
        <ellipse data-item={id} className="item-body" cx={w / 2} cy={d / 2} rx={w / 2} ry={d / 2} />
      ) : (
        <rect data-item={id} className="item-body" width={w} height={d} />
      )}
      <g className="item-detail">
        {planDetails(it).map((p, i) => (
          <PartShape key={i} p={p} />
        ))}
      </g>
    </>
  );
}

const NAME_PX = 11;
const SIZE_PX = 9.5;

/** Подпись: название (или его первое слово) и размер — вдоль той стороны, где помещаются, и не вверх ногами. */
function Label({ it, px }: { it: Item; px: number }) {
  const w = it.width;
  const d = it.depth;
  const size =
    catalogItem(it.type)?.round && Math.abs(w - d) < 0.005 ? `Ø${formatCm(w)}` : `${formatCm(w)}×${formatCm(d)}`;
  const fits = (text: string, font: number, along: number) => text.length * font * 0.58 + 6 <= along / px;
  const words = [it.name, it.name.split(/\s+/)[0] ?? ""];
  for (const [along, across, turn] of [
    [w, d, 0],
    [d, w, 90],
  ] as const) {
    if (across / px < NAME_PX + 4) continue;
    const name = words.find((t) => t && fits(t, NAME_PX, along));
    if (!name) continue;
    const two = across / px >= NAME_PX + SIZE_PX + 8 && fits(size, SIZE_PX, along);
    const screen = normalizeRotation(it.rotation + turn);
    const flip = screen > 90 && screen <= 270 ? 180 : 0;
    return (
      <g transform={`rotate(${turn + flip} ${w / 2} ${d / 2})`}>
        <text
          className="item-name"
          x={w / 2}
          y={d / 2 - (two ? SIZE_PX * px * 0.6 : 0)}
          fontSize={NAME_PX * px}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {name}
        </text>
        {two && (
          <text
            className="item-size"
            x={w / 2}
            y={d / 2 + NAME_PX * px * 0.65}
            fontSize={SIZE_PX * px}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {size}
          </text>
        )}
      </g>
    );
  }
  return null;
}

/** Предмет на плане. Ковёр — пунктиром, висящее выше метра (шкаф над столешницей, кондиционер) — штрихом. */
export function ItemShape({
  it,
  px,
  selected,
  bad,
  className,
}: {
  it: Item;
  px: number;
  selected?: boolean;
  bad?: boolean;
  className?: string;
}) {
  const cls = [
    "item",
    it.height < FLAT && "flat",
    it.elevation >= 1 && "high",
    selected && "selected",
    bad && "bad",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <g className={cls} transform={itemTransform(it)}>
      <Body it={it} id={it.id || undefined} />
      <Label it={it} px={px} />
    </g>
  );
}

/** Ручки выбранного: квадратики на серединах сторон меняют размер, кружок перед передом — поворот. */
export function ItemHandles({ it, px }: { it: Item; px: number }) {
  const w = it.width;
  const d = it.depth;
  const s = 9 * px;
  const arm = 24 * px;
  const edges: [string, number, number][] = [
    ["u:-1", 0, d / 2],
    ["u:1", w, d / 2],
    ["v:-1", w / 2, 0],
    ["v:1", w / 2, d],
  ];
  return (
    <g className="item-handles" transform={itemTransform(it)}>
      <rect className="item-frame" width={w} height={d} />
      <line className="item-rot-line" x1={w / 2} y1={d} x2={w / 2} y2={d + arm} />
      <circle data-item-rot="1" className="handle rot" cx={w / 2} cy={d + arm} r={5 * px} />
      {edges.map(([k, x, y]) => (
        <rect
          key={k}
          data-item-edge={k}
          className="handle"
          x={x - s / 2}
          y={y - s / 2}
          width={s}
          height={s}
          rx={2 * px}
        />
      ))}
    </g>
  );
}

/** Значок для каталога: вид сверху в квадратике. */
export function ItemIcon({ it }: { it: Shape }) {
  const m = Math.max(it.width, it.depth) * 0.08;
  return (
    <svg className="item-icon" viewBox={`${-m} ${-m} ${it.width + 2 * m} ${it.depth + 2 * m}`} aria-hidden="true">
      <Body it={it} />
    </svg>
  );
}

import { add, mul, norm, sub, wallOffsets } from '../core/geometry';
import { hasLeaf, isWindow, sashCount } from '../core/openings';
import type { Opening, Project } from '../core/types';

/**
 * Проём на плане в своих координатах: x — вдоль стены от края проёма (0…ширина), y — поперёк, по нормали «влево» от a→b.
 * Стена в проёме закрыта белым, у окна — рама со стеклом и створками, у двери — полотно и дуга открывания.
 */
export function OpeningShape({ project, o, px, className, selected }: {
  project: Project; o: Opening; px: number; className?: string; selected?: boolean;
}) {
  const wall = project.walls[o.wall];
  if (!wall) return null;
  const a = project.nodes[wall.a]!, b = project.nodes[wall.b]!;
  const d = norm(sub(b, a));
  const at = add(a, mul(d, o.offset));
  const deg = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  const [r, l] = wallOffsets(wall);
  const W = o.width, m = (r + l) / 2;

  let symbol: React.ReactNode = null;
  if (isWindow(o.kind)) {
    const g = Math.min(0.035, wall.thickness / 4);
    const n = sashCount(o);
    symbol = (
      <>
        <rect className="op-glass" x={0} y={m - g} width={W} height={2 * g} />
        {Array.from({ length: n - 1 }, (_, i) => (
          <line key={i} className="op-line" x1={((i + 1) * W) / n} y1={m - g} x2={((i + 1) * W) / n} y2={m + g} />
        ))}
      </>
    );
  } else if (hasLeaf(o.kind)) {
    // полотно открыто на 90° от петель в сторону открывания, дуга — путь его края
    const sx = o.hinge === 'a' ? 1 : -1;
    const xh = o.hinge === 'a' ? 0 : W, yf = o.swing === 1 ? l : r;
    const leafEnd = { x: xh, y: yf + o.swing * W }, closed = { x: xh + sx * W, y: yf };
    const sweep = sx * o.swing === 1 ? 0 : 1;
    symbol = (
      <>
        <path className="op-arc" d={`M ${leafEnd.x} ${leafEnd.y} A ${W} ${W} 0 0 ${sweep} ${closed.x} ${closed.y}`} />
        {o.kind === 'balcony'
          ? <rect className="op-leaf glazed" x={Math.min(xh, xh + sx * 0.04)} y={Math.min(yf, leafEnd.y)} width={0.04} height={W} />
          : <line className="op-leaf" x1={xh} y1={yf} x2={leafEnd.x} y2={leafEnd.y} />}
      </>
    );
  }

  return (
    <g className={`opening ${className ?? ''}${selected ? ' selected' : ''}`} transform={`translate(${at.x} ${at.y}) rotate(${deg})`}>
      <rect className="op-gap" x={0} y={r} width={W} height={l - r} />
      <line className="op-line" x1={0} y1={r} x2={0} y2={l} />
      <line className="op-line" x1={W} y1={r} x2={W} y2={l} />
      {symbol}
      {/* место для клика и перетаскивания: весь проём по толщине стены, с запасом в пару пикселей */}
      <rect className="op-hit" data-opening={o.id} x={0} y={r - 3 * px} width={W} height={l - r + 6 * px} />
      {selected && [0, W].map((x, i) => (
        <rect key={i} className="op-end" data-op-end={i} data-opening={o.id} x={x - 4 * px} y={m - 7 * px} width={8 * px} height={14 * px} rx={2 * px} />
      ))}
    </g>
  );
}

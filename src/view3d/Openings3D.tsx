import { add, interiorSide, mul, norm, perp, roomsOfWall, sub, wallOffsets } from "../core/geometry";
import { sashCount } from "../core/openings";
import type { Opening, Project } from "../core/types";

// Окна и двери в 3D — простые коробки, как мебель в kvartira. Модель строится в своих координатах:
// x — вдоль стены от узла a к b, y — вверх от пола, z — поперёк стены по нормали «влево» от a→b.

const FRAME = "#F6F6F3";
const LEAF = "#D9CCB7";
const FT = 0.06; // ширина профиля рамы
const FD = 0.07; // глубина рамы

type Box = [x: number, y: number, z: number, w: number, h: number, d: number];

function Boxes({ boxes, color, roughness = 0.6 }: { boxes: Box[]; color: string; roughness?: number }) {
  return (
    <>
      {boxes.map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} roughness={roughness} />
        </mesh>
      ))}
    </>
  );
}

function Glass({ x, y, z, w, h }: { x: number; y: number; z: number; w: number; h: number }) {
  return (
    <mesh position={[x, y, z]}>
      <boxGeometry args={[w, h, 0.012]} />
      <meshStandardMaterial color="#BFD9E6" transparent opacity={0.28} roughness={0.05} depthWrite={false} />
    </mesh>
  );
}

/** Рама с перемычками между створками и стеклом: прямоугольник шириной w, высотой h с низом в y0. */
function Frame({ w, h, y0, z, sashes }: { w: number; h: number; y0: number; z: number; sashes: number }) {
  const boxes: Box[] = [
    [-w / 2 + FT / 2, y0 + h / 2, z, FT, h, FD],
    [w / 2 - FT / 2, y0 + h / 2, z, FT, h, FD],
    [0, y0 + h - FT / 2, z, w, FT, FD],
    [0, y0 + FT / 2, z, w, FT, FD],
  ];
  for (let i = 1; i < sashes; i++) boxes.push([-w / 2 + (i * w) / sashes, y0 + h / 2, z, FT * 0.8, h - 2 * FT, FD]);
  return (
    <>
      <Boxes boxes={boxes} color={FRAME} />
      <Glass x={0} y={y0 + h / 2} z={z} w={w - 2 * FT} h={h - 2 * FT} />
    </>
  );
}

export function OpeningModel({ project, o }: { project: Project; o: Opening }) {
  const wall = project.walls[o.wall];
  if (!wall) return null;
  const a = project.nodes[wall.a]!;
  const b = project.nodes[wall.b]!;
  const d = norm(sub(b, a));
  const n = perp(d);
  const [r, l] = wallOffsets(wall);
  const t = wall.thickness;
  const c = add(add(a, mul(d, o.offset + o.width / 2)), mul(n, (r + l) / 2));
  const rooms = roomsOfWall(project, wall);
  const inside = rooms.length === 1 ? interiorSide(project, rooms[0]!, wall) : 1; // подоконник — в комнату
  const W = o.width;
  const H = o.height;
  const y0 = o.sill;

  let body: React.ReactNode = null;
  if (o.kind === "window" || o.kind === "panorama") {
    // рама — в наружной трети стены, как у настоящих окон; подоконник — от рамы до внутренней грани и на 5 см дальше,
    // поэтому в толстой стене он сам глубже
    const zf = (-inside * t) / 6;
    const zFrom = zf + (inside * FD) / 2;
    const zTo = inside * (t / 2 + 0.05);
    body = (
      <>
        <Frame w={W} h={H} y0={y0} z={zf} sashes={sashCount(o)} />
        {o.kind === "window" && (
          <Boxes
            boxes={[[0, y0 - 0.015, (zFrom + zTo) / 2, W + 0.08, 0.03, Math.abs(zTo - zFrom)]]}
            color={FRAME}
            roughness={0.4}
          />
        )}
      </>
    );
  } else if (o.kind === "door" || o.kind === "balcony") {
    // коробка по толщине стены и закрытое полотно у той грани, куда дверь открывается
    const ct = 0.04;
    const lw = W - 2 * ct;
    const lh = H - ct - 0.01;
    const lz = o.swing * (t / 2 - 0.03);
    const hx = o.hinge === "a" ? lw / 2 - 0.09 : -lw / 2 + 0.09; // ручка — у края без петель
    body = (
      <>
        <Boxes
          boxes={[
            [-W / 2 + ct / 2, H / 2, 0, ct, H, t + 0.02],
            [W / 2 - ct / 2, H / 2, 0, ct, H, t + 0.02],
            [0, H - ct / 2, 0, W, ct, t + 0.02],
          ]}
          color={FRAME}
        />
        {o.kind === "door" ? (
          <Boxes boxes={[[0, 0.005 + lh / 2, lz, lw, lh, 0.04]]} color={LEAF} roughness={0.7} />
        ) : (
          // балконная: остеклённое полотно с глухой нижней частью
          <>
            <Frame w={lw} h={lh - 0.45} y0={0.45 + 0.005} z={lz} sashes={1} />
            <Boxes boxes={[[0, 0.005 + 0.225, lz, lw, 0.45, FD]]} color={FRAME} />
          </>
        )}
        <Boxes boxes={[[hx, 1.0, lz + o.swing * 0.045, 0.12, 0.025, 0.03]]} color="#8C8F91" roughness={0.3} />
      </>
    );
  }
  return (
    <group position={[c.x, 0, c.y]} rotation={[0, -Math.atan2(d.y, d.x), 0]}>
      {body}
    </group>
  );
}

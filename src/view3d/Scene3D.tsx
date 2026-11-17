import { Bounds, Edges, Grid, OrbitControls, useBounds } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { dot, norm, perp, roomInnerPolygon, sub, wallBlocksView, wallOutline } from "../core/geometry";
import { openingsOfWall, wallHeight, wallPieces } from "../core/openings";
import { type Id, type Point, type Project, WALL_COLOR, type Wall } from "../core/types";
import { useEditor, useShownProject } from "../store/editor";
import { useThemeColor } from "../ui/theme";
import { OpeningModel } from "./Openings3D";

// План (x вправо, y вниз) → 3D: x → x, y → z, высота → y.
// Контур строится в плоскости XY с точками (x, −y) и поворачивается на −90° вокруг X: (x, −y, h) → (x, h, y).
function shapeOf(poly: Point[]): THREE.Shape {
  const s = new THREE.Shape();
  poly.forEach((p, i) => (i ? s.lineTo(p.x, -p.y) : s.moveTo(p.x, -p.y)));
  s.closePath();
  return s;
}

/**
 * Цвета граней стены через цвета вершин: треугольник, повёрнутый в сторону нормали стены, — левая грань,
 * в обратную — правая, остальное (торцы, верх, откосы проёмов) — цвет по умолчанию.
 */
function paintGeometry(g: THREE.BufferGeometry, project: Project, w: Wall) {
  const n = perp(norm(sub(project.nodes[w.b]!, project.nodes[w.a]!)));
  const base = new THREE.Color(WALL_COLOR);
  const left = new THREE.Color(w.paintLeft ?? WALL_COLOR);
  const right = new THREE.Color(w.paintRight ?? WALL_COLOR);
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const tri = new THREE.Triangle();
  const normal = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    tri.setFromAttributeAndIndices(pos, i, i + 1, i + 2).getNormal(normal);
    const d = dot({ x: normal.x, y: normal.z }, n); // в 3D план (x, y) — это (x, z)
    const c = d > 0.99 ? left : d < -0.99 ? right : base;
    for (let k = 0; k < 3; k++) c.toArray(colors, (i + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Стена одной сеткой из кусков вокруг проёмов: каждый кусок — свой контур, поднятый на h0 и вытянутый до h1. */
function wallGeometry(project: Project, w: Wall): THREE.BufferGeometry {
  const parts = wallPieces(project, w).map((p) => {
    let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shapeOf(p.poly), {
      depth: p.h1 - p.h0,
      bevelEnabled: false,
    });
    if (g.index) g = g.toNonIndexed(); // у каждого треугольника свои вершины — свой цвет
    g.rotateX(-Math.PI / 2);
    g.translate(0, p.h0, 0);
    return g;
  });
  const g = parts.length === 1 ? parts[0]! : mergeGeometries(parts)!;
  paintGeometry(g, project, w);
  return g;
}

/** Целый контур стены без вырезов — для обводки выбранной: у кусков на стыках получались бы лишние линии. */
function outlineGeometry(project: Project, w: Wall): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shapeOf(wallOutline(project, w)), {
    depth: wallHeight(project, w),
    bevelEnabled: false,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}

function useWallGeometries(project: Project, selected: Set<Id>) {
  const key = [...selected].sort().join(" ");
  const walls = useMemo(
    () => Object.values(project.walls).map((w) => ({ id: w.id, g: wallGeometry(project, w) })),
    [project],
  );
  const edges = useMemo(
    () =>
      new Map(
        [...selected].filter((id) => project.walls[id]).map((id) => [id, outlineGeometry(project, project.walls[id]!)]),
      ),
    // выбор сравниваем по составу (key), а не по ссылке на Set: он создаётся заново при каждой отрисовке
    [project, key],
  );
  return { walls, edges };
}

function useFloorGeometries(project: Project) {
  return useMemo(
    () =>
      Object.values(project.rooms).map((r) => {
        const g = new THREE.ShapeGeometry(shapeOf(roomInnerPolygon(project, r)));
        g.rotateX(-Math.PI / 2);
        return { id: r.id, g };
      }),
    [project],
  );
}

/** Вписать всё построенное в окно, когда меняется число стен (а не при каждой правке). */
function FitOnChange({ count }: { count: number }) {
  const api = useBounds();
  useEffect(() => {
    if (count) api.refresh().clip().fit();
  }, [count, api]);
  return null;
}

const GHOST_OPACITY = 0.1;

/**
 * Спрятать или показать всё, что в группе стены (сама стена, её окна и двери). Исходная прозрачность
 * материала (стекло) запоминается при первом разе и возвращается.
 */
function setGhost(group: THREE.Object3D, ghost: boolean) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE.Material;
    const base = (m.userData.base ??= { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite });
    mesh.userData.castShadow ??= mesh.castShadow;
    mesh.castShadow = ghost ? false : mesh.userData.castShadow; // тень спрятанной стены затемняла бы комнату
    m.transparent = ghost || base.transparent;
    m.opacity = ghost ? Math.min(base.opacity, GHOST_OPACITY) : base.opacity;
    m.depthWrite = ghost ? false : base.depthWrite; // иначе прозрачная стена закрывает то, что за ней
    m.needsUpdate = true;
  });
}

/** Стены с их проёмами. Каждый кадр прячет те, что стоят между камерой и точкой, куда она смотрит (как в kvartira). */
function Walls({ project, selected, ghostOn }: { project: Project; selected: Set<Id>; ghostOn: boolean }) {
  const { walls, edges } = useWallGeometries(project, selected);
  const groups = useRef(new Map<Id, THREE.Group>());
  const state = useRef(new Map<Id, boolean>());
  const shown = useRef(project);

  useFrame(({ camera, controls }) => {
    // проект поменялся — в группах могут быть новые материалы: применяем заново ко всем
    if (shown.current !== project) {
      shown.current = project;
      state.current.clear();
    }
    const target = (controls as unknown as { target?: THREE.Vector3 } | null)?.target;
    if (!target) return;
    const eye = { x: camera.position.x, y: camera.position.z };
    const aim = { x: target.x, y: target.z };
    for (const [id, group] of groups.current) {
      const w = project.walls[id];
      const ghost = ghostOn && !!w && wallBlocksView(project, w, eye, aim);
      if (state.current.get(id) === ghost) continue;
      state.current.set(id, ghost);
      setGhost(group, ghost);
    }
  });

  return (
    <>
      {walls.map((w) => (
        <group
          key={w.id}
          ref={(g) => {
            if (g) groups.current.set(w.id, g);
            else groups.current.delete(w.id);
          }}
        >
          <mesh geometry={w.g} castShadow receiveShadow>
            <meshStandardMaterial vertexColors roughness={0.9} />
            {/* выбранная стена — контур по рёбрам: подкраска смешивалась бы с цветом стены */}
            {edges.has(w.id) && <Edges geometry={edges.get(w.id)} color="#2D6A62" lineWidth={2.5} threshold={20} />}
          </mesh>
          {openingsOfWall(project, w.id).map((o) => (
            <OpeningModel key={o.id} project={project} o={o} />
          ))}
        </group>
      ))}
    </>
  );
}

/** ghost — прятать стены, которые закрывают вид (переключатель в углу окна 3D). */
export function Scene3D({ ghost }: { ghost: boolean }) {
  const project = useShownProject();
  const selection = useEditor((s) => s.selection);
  const selected = new Set(selection);
  const bg = useThemeColor("--stage", "#DCE2DF");
  const wallCount = Object.keys(project.walls).length;
  const floors = useFloorGeometries(project);

  return (
    <Canvas shadows camera={{ position: [6, 7, 9], fov: 40 }}>
      <color attach="background" args={[bg]} />
      <hemisphereLight args={["#F3F6FF", "#B49E80", 0.9]} />
      {/* ровный свет: стены, повёрнутые от солнца, иначе почти чёрные сквозь прозрачные */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[-4, 8, 6]} intensity={2} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-12, 12, 12, -12, 0.5, 40]} />
      </directionalLight>
      <Grid
        args={[40, 40]}
        cellSize={0.1}
        sectionSize={1}
        cellColor="#C3CBC7"
        sectionColor="#8E9A95"
        fadeDistance={40}
        infiniteGrid
        position={[0, -0.002, 0]}
      />
      <Bounds margin={1.2}>
        <FitOnChange count={wallCount} />
        <group>
          {floors.map((f) => (
            <mesh key={f.id} geometry={f.g} receiveShadow position={[0, 0.001, 0]}>
              <meshStandardMaterial color="#E9DFD0" roughness={0.8} />
            </mesh>
          ))}
          <Walls project={project} selected={selected} ghostOn={ghost} />
        </group>
      </Bounds>
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.03} />
    </Canvas>
  );
}

import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, Grid, OrbitControls, useBounds } from '@react-three/drei';
import * as THREE from 'three';
import { roomPolygon, wallOutline } from '../core/geometry';
import type { Point, Project } from '../core/types';
import { useEditor, useShownProject } from '../store/editor';
import { useThemeColor } from '../ui/theme';

// План (x вправо, y вниз) → 3D: x → x, y → z, высота → y.
// Контур строится в плоскости XY с точками (x, −y) и поворачивается на −90° вокруг X: (x, −y, h) → (x, h, y).
function shapeOf(poly: Point[]): THREE.Shape {
  const s = new THREE.Shape();
  poly.forEach((p, i) => (i ? s.lineTo(p.x, -p.y) : s.moveTo(p.x, -p.y)));
  s.closePath();
  return s;
}

function useWallGeometries(project: Project) {
  return useMemo(() => Object.values(project.walls).map(w => {
    const g = new THREE.ExtrudeGeometry(shapeOf(wallOutline(project, w)), { depth: project.ceilingHeight, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return { id: w.id, g };
  }), [project]);
}

function useFloorGeometries(project: Project) {
  return useMemo(() => Object.values(project.rooms).map(r => {
    const g = new THREE.ShapeGeometry(shapeOf(roomPolygon(project, r)));
    g.rotateX(-Math.PI / 2);
    return { id: r.id, g };
  }), [project]);
}

/** Вписать всё построенное в окно, когда меняется число стен (а не при каждой правке). */
function FitOnChange({ count }: { count: number }) {
  const api = useBounds();
  useEffect(() => { if (count) api.refresh().clip().fit(); }, [count, api]);
  return null;
}

export function Scene3D() {
  const project = useShownProject();
  const selection = useEditor(s => s.selection);
  const selected = new Set(selection);
  const bg = useThemeColor('--stage', '#DCE2DF');
  const walls = useWallGeometries(project);
  const floors = useFloorGeometries(project);

  return (
    <Canvas shadows camera={{ position: [6, 7, 9], fov: 40 }}>
      <color attach="background" args={[bg]} />
      <hemisphereLight args={['#F3F6FF', '#B49E80', 0.9]} />
      <directionalLight position={[-4, 8, 6]} intensity={2} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-12, 12, 12, -12, 0.5, 40]} />
      </directionalLight>
      <Grid args={[40, 40]} cellSize={0.1} sectionSize={1} cellColor="#C3CBC7" sectionColor="#8E9A95" fadeDistance={40} infiniteGrid position={[0, -0.002, 0]} />
      <Bounds margin={1.2}>
        <FitOnChange count={walls.length} />
        <group>
          {floors.map(f => (
            <mesh key={f.id} geometry={f.g} receiveShadow position={[0, 0.001, 0]}>
              <meshStandardMaterial color="#E9DFD0" roughness={0.8} />
            </mesh>
          ))}
          {walls.map(w => (
            <mesh key={w.id} geometry={w.g} castShadow receiveShadow>
              <meshStandardMaterial color={selected.has(w.id) ? '#7FB5AB' : '#F2F1EE'} roughness={0.9} />
            </mesh>
          ))}
        </group>
      </Bounds>
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.03} />
    </Canvas>
  );
}

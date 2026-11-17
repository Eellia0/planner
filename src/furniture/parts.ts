// Детали мебели каталога — простые тела в своих осях предмета, без three.js: из них строится 3D (view3d/Furniture3D.tsx)
// и значок на плане (plan2d/ItemShape.tsx). Оси: x — по ширине (0 — левый край, если смотреть на перед),
// z — от спинки (0) к переду, y — вверх от низа предмета. Всё в метрах, как в kvartira (lbox, lcyl).

export interface Mat {
  color: string;
  rough?: number;
  metal?: number;
  opacity?: number;
  /** Видно с обеих сторон (абажур, штора). */
  double?: boolean;
  /** Гранёный вид (листва). */
  flat?: boolean;
}

export type Part =
  /** Коробка; r — скругление рёбер, tilt — наклон вокруг оси x (отрицательный — верх назад: подушки, спинки). */
  | {
      kind: "box";
      x0: number;
      x1: number;
      z0: number;
      z1: number;
      y0: number;
      y1: number;
      mat: Mat;
      r?: number;
      tilt?: number;
    }
  /** Цилиндр стоя: радиус низа r, верха r2; rz — другой радиус по глубине (эллипс); open — без крышек (абажур). */
  | {
      kind: "cyl";
      x: number;
      z: number;
      y0: number;
      y1: number;
      r: number;
      r2?: number;
      rz?: number;
      open?: boolean;
      mat: Mat;
    }
  /** Диск лицом вперёд, от z до z + depth: зеркало, дверца стиральной машины. */
  | { kind: "disc"; x: number; y: number; z: number; r: number; depth: number; mat: Mat }
  /** Прут от точки a до b, точки — [x, y, z]. */
  | { kind: "rod"; a: [number, number, number]; b: [number, number, number]; r: number; mat: Mat }
  /** Шар листвы. */
  | { kind: "ball"; x: number; y: number; z: number; r: number; mat: Mat }
  /** Волнистое полотно шторы вдоль x на глубине z. */
  | { kind: "wave"; x0: number; x1: number; z: number; y0: number; y1: number; amp: number; waves: number; mat: Mat };

/** Значок на плане — в тех же осях (x, z), вид сверху. */
export type PlanPart =
  | { kind: "rect"; x0: number; x1: number; z0: number; z1: number; r?: number }
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "line"; x0: number; z0: number; x1: number; z1: number }
  | { kind: "path"; points: [number, number][] };

export interface Size {
  w: number;
  d: number;
  h: number;
}

export const mat = (color: string, rough = 0.8, metal = 0, extra: Partial<Mat> = {}): Mat => ({
  color,
  rough,
  metal,
  ...extra,
});

/** Материалы — как в kvartira (без текстур: дуб и ткани ровным цветом). */
export const M = {
  oak: mat("#C9A57C", 0.55),
  white: mat("#F2F1EE", 0.55),
  black: mat("#1D1F21", 0.45, 0.35),
  metal: mat("#C3C7CA", 0.3, 0.6),
  steel: mat("#CDD2D6", 0.3, 0.6),
  mattress: mat("#F3F1EC", 0.9),
  duvet: mat("#F6F4F0", 0.95),
  throw: mat("#C39A4A", 0.95),
  sage: mat("#8FA79F", 0.95),
  slats: mat("#D8BC92", 0.7),
  seat: mat("#3A3E42", 0.85),
  porcelain: mat("#F7F7F5", 0.15),
  ceramic: mat("#ECE8E0", 0.35),
  glassBlack: mat("#0E0F10", 0.08, 0.2),
  glass: mat("#CFE3EE", 0.05, 0, { opacity: 0.25 }),
  plinth: mat("#2B2D2F", 0.6),
  felt: mat("#4A4F52", 1),
  counter: mat("#E6E2DA", 0.3),
  body: mat("#EFEDE8", 0.5),
  groove: mat("#2B241D", 0.8),
  leaf: mat("#5D7F55", 0.8, 0, { flat: true }),
  mirror: mat("#C9D3D8", 0.08, 0.35),
  water: mat("#9CC7D8", 0.05, 0, { opacity: 0.6 }),
  food: mat("#7A4E2D", 0.95),
  screen: mat("#0B0D0F", 0.12, 0.3),
};
export const BOOKS = ["#3D5A80", "#C9A04E", "#8C4A3B", "#E7E1D6", "#5E7A73", "#2B2D30"];
export const CLOTH = ["#2F3B4C", "#E8E4DC", "#7C8B7A", "#B9A58A", "#1F2224", "#9B5D49", "#D7D0C4"];

// ---------- помощники в том же порядке, что в kvartira: x, затем z, затем высота ----------
export const box = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  m: Mat,
  o: { r?: number; tilt?: number } = {},
): Part => ({ kind: "box", x0, x1, z0, z1, y0, y1, mat: m, ...o });
export const cyl = (
  x: number,
  z: number,
  y0: number,
  y1: number,
  r: number,
  m: Mat,
  o: { r2?: number; rz?: number; open?: boolean } = {},
): Part => ({ kind: "cyl", x, z, y0, y1, r, mat: m, ...o });
export const rod = (a: [number, number, number], b: [number, number, number], r: number, m: Mat): Part => ({
  kind: "rod",
  a,
  b,
  r,
  mat: m,
});
export const ball = (x: number, y: number, z: number, r: number, m: Mat): Part => ({
  kind: "ball",
  x,
  y,
  z,
  r,
  mat: m,
});
export const disc = (x: number, y: number, z: number, r: number, depth: number, m: Mat): Part => ({
  kind: "disc",
  x,
  y,
  z,
  r,
  depth,
  mat: m,
});

/** Четыре ножки по углам: высота h, отступ от краёв inset. */
export function legs(w: number, d: number, h: number, m: Mat, inset = 0.04, r = 0.015): Part[] {
  return [
    [inset, inset],
    [w - inset, inset],
    [inset, d - inset],
    [w - inset, d - inset],
  ].map(([x, z]) => cyl(x!, z!, 0, h, r, m, { r2: r * 1.3 }));
}

/** Детали, нарисованные для одного размера, — под другой: каждая ось растягивается отдельно. */
export function scaleParts(parts: Part[], kx: number, ky: number, kz: number): Part[] {
  const k = Math.min(kx, ky, kz);
  const kr = Math.min(kx, kz);
  return parts.map((p) => {
    switch (p.kind) {
      case "box":
        return {
          ...p,
          x0: p.x0 * kx,
          x1: p.x1 * kx,
          z0: p.z0 * kz,
          z1: p.z1 * kz,
          y0: p.y0 * ky,
          y1: p.y1 * ky,
          r: p.r && p.r * k,
        };
      case "cyl":
        return {
          ...p,
          x: p.x * kx,
          z: p.z * kz,
          y0: p.y0 * ky,
          y1: p.y1 * ky,
          r: p.r * kx,
          r2: p.r2 && p.r2 * kx,
          rz: (p.rz ?? p.r) * kz,
        };
      case "disc":
        return { ...p, x: p.x * kx, y: p.y * ky, z: p.z * kz, r: p.r * Math.min(kx, ky), depth: p.depth * kz };
      case "rod":
        return {
          ...p,
          a: [p.a[0] * kx, p.a[1] * ky, p.a[2] * kz],
          b: [p.b[0] * kx, p.b[1] * ky, p.b[2] * kz],
          r: p.r * kr,
        };
      case "ball":
        return { ...p, x: p.x * kx, y: p.y * ky, z: p.z * kz, r: p.r * k };
      case "wave":
        return { ...p, x0: p.x0 * kx, x1: p.x1 * kx, z: p.z * kz, y0: p.y0 * ky, y1: p.y1 * ky, amp: p.amp * kz };
    }
  });
}

/** Предмет, нарисованный для одного размера [ширина, глубина, высота]: при другом размере растягивается целиком. */
export const fixed = (base: [number, number, number], build: (c: string) => Part[]) => (s: Size, c: string) =>
  scaleParts(build(c), s.w / base[0], s.h / base[2], s.d / base[1]);

/** Повторяемые «случайные» числа: книги и одежда каждый раз одни и те же. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Цвет темнее (k < 0) или светлее (k > 0): k — доля пути к чёрному или белому. */
export function tone(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k));
  return (
    "#" +
    ch
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

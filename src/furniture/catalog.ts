// Каталог мебели: своя, строится кодом из простых тел (parts.ts) — без чужих моделей, их можно продавать вместе с приложением.
// Основа перенесена из kvartira.html (кровать, шкаф-купе, столешница, кресло, комод, место собаки, кухня, санузел, прихожая),
// размеры по умолчанию — оттуда же. Каждый предмет строится под свой размер: ножки не толстеют, створок становится больше.
import type { Item } from "../core/types";
import {
  BOOKS,
  ball,
  box,
  CLOTH,
  cyl,
  disc,
  fixed,
  legs,
  M,
  mat,
  type Part,
  type PlanPart,
  rng,
  rod,
  type Size,
  tone,
} from "./parts";

export type Group = "bedroom" | "living" | "work" | "kitchen" | "bath" | "hall" | "misc";
export const GROUPS: [Group, string][] = [
  ["bedroom", "Спальня"],
  ["living", "Гостиная"],
  ["work", "Кабинет"],
  ["kitchen", "Кухня"],
  ["bath", "Ванная"],
  ["hall", "Прихожая"],
  ["misc", "Разное"],
];

export interface CatalogItem {
  type: string;
  name: string;
  group: Group;
  /** Размер по умолчанию: ширина, глубина, высота. */
  size: [number, number, number];
  /** Низ от пола у настенного. */
  elevation?: number;
  /** Высота до потолка проекта (шкаф-купе, штора). */
  ceiling?: boolean;
  /** Круглый на плане (наложения и значок — эллипсом). */
  round?: boolean;
  /** Не разворачивать спинкой к стене при постановке (ковёр, стул, кресло на колёсах). */
  free?: boolean;
  /** Основной цвет; его можно поменять в свойствах. */
  color: string;
  build: (s: Size, c: string) => Part[];
  plan?: (s: Size) => PlanPart[];
}

// ---------- спальня ----------

function bed({ w, d, h }: Size, c: string): Part[] {
  const fab = mat(c, 1);
  const top = Math.max(h, 0.62);
  const p: Part[] = [
    box(0.05, w - 0.05, 0.12, d - 0.05, 0, 0.03, M.black),
    box(0, 0.07, 0.08, d, 0.03, 0.36, fab, { r: 0.025 }),
    box(w - 0.07, w, 0.08, d, 0.03, 0.36, fab, { r: 0.025 }),
    box(0, w, d - 0.07, d, 0.03, 0.36, fab, { r: 0.025 }),
    box(0, w, 0, 0.08, 0.03, 0.32, fab, { r: 0.02 }),
    box(0.075, w - 0.075, 0.12, d - 0.075, 0.3, 0.33, M.slats),
    box(0.08, w - 0.08, 0.13, d - 0.08, 0.33, 0.56, M.mattress, { r: 0.05 }),
    // одеяло свисает по бокам, плед в ногах
    box(-0.02, w + 0.02, 0.68, d - 0.04, 0.545, 0.6, M.duvet, { r: 0.03 }),
    box(-0.035, -0.012, 0.68, d - 0.04, 0.37, 0.59, M.duvet, { r: 0.008 }),
    box(w + 0.012, w + 0.035, 0.68, d - 0.04, 0.37, 0.59, M.duvet, { r: 0.008 }),
    box(-0.02, w + 0.02, d - 0.042, d - 0.018, 0.37, 0.59, M.duvet, { r: 0.008 }),
    box(-0.04, w + 0.04, d - 0.5, d - 0.1, 0.598, 0.625, M.throw, { r: 0.01 }),
  ];
  // изголовье — мягкие панели примерно по 34 см
  const n = Math.max(1, Math.round(w / 0.344));
  const pw = w / n;
  for (let i = 0; i < n; i++) p.push(box(i * pw + 0.004, (i + 1) * pw - 0.004, 0, 0.1, 0.3, top, fab, { r: 0.045 }));
  for (const [x0, x1, small] of pillows(w)) {
    p.push(box(x0, x1, 0.24, 0.4, 0.56, 1.0, M.duvet, { r: 0.05, tilt: -0.3 }));
    p.push(box(small[0], small[1], 0.41, 0.54, 0.56, 0.9, x0 < w / 2 ? M.sage : M.throw, { r: 0.05, tilt: -0.24 }));
  }
  return p;
}
/** Подушки: на широкой кровати две пары, на узкой — одна. [от, до, маленькая подушка]. */
function pillows(w: number): [number, number, [number, number]][] {
  if (w < 1.3) return [[0.12, w - 0.12, [0.25, w - 0.25]]];
  return [
    [0.12, w / 2 - 0.06, [0.32, w / 2 - 0.09]],
    [w / 2 + 0.06, w - 0.12, [w / 2 + 0.09, w - 0.32]],
  ];
}
const bedPlan = ({ w, d }: Size): PlanPart[] => [
  { kind: "rect", x0: 0, x1: w, z0: 0, z1: 0.1 },
  ...pillows(w).map(([x0, x1]): PlanPart => ({ kind: "rect", x0, x1, z0: 0.16, z1: 0.48, r: 0.05 })),
  { kind: "line", x0: 0, z0: 0.68, x1: w, z1: 0.68 },
  { kind: "line", x0: 0, z0: d - 0.5, x1: w, z1: d - 0.5 },
];

function wardrobe({ w, d, h }: Size, c: string): Part[] {
  // двери-купе: при 2,4 м и шире — три, как в kvartira; уже — по одной на метр
  const n = Math.max(1, Math.round(w / 0.96));
  const sw = w / n;
  const doors = mat(c, 0.1, 0.35);
  const p: Part[] = [
    box(0, 0.018, 0, d - 0.08, 0, h, M.white),
    box(w - 0.018, w, 0, d - 0.08, 0, h, M.white),
    box(0, w, 0, d - 0.08, h - 0.02, h, M.white),
    box(0, w, 0.01, d - 0.08, 0, 0.07, M.white),
    box(0, w, d - 0.08, d, h - 0.04, h - 0.02, M.black),
    box(0, w, d - 0.08, d, 0.06, 0.075, M.black),
  ];
  for (let i = 0; i < n; i++) {
    const x0 = i * sw + (i === 0 ? 0.02 : -0.015);
    const x1 = (i + 1) * sw + (i === n - 1 ? -0.02 : 0.015);
    const [z0, z1] = i % 2 === 0 ? [d - 0.075, d - 0.05] : [d - 0.045, d - 0.02];
    p.push(box(x0, x1, z0, z1, 0.075, h - 0.04, doors));
    p.push(box(x0, x0 + 0.02, z0 - 0.005, d - 0.01, 0.075, h - 0.04, M.black));
    p.push(box(x1 - 0.02, x1, z0 - 0.005, d - 0.01, 0.075, h - 0.04, M.black));
  }
  return p;
}
const wardrobePlan = ({ w, d }: Size): PlanPart[] => {
  const n = Math.max(1, Math.round(w / 0.96));
  const sw = w / n;
  return Array.from({ length: n }, (_, i): PlanPart => {
    const z = i % 2 === 0 ? d - 0.07 : d - 0.035;
    return { kind: "line", x0: i * sw + 0.02, z0: z, x1: (i + 1) * sw - 0.02, z1: z };
  });
};

function nightstand({ w, d, h }: Size, c: string): Part[] {
  return [
    box(0, w, 0, d - 0.003, 0, h, mat(c, 0.55), { r: 0.008 }),
    box(0.02, w - 0.02, d - 0.004, d, h * 0.475, h * 0.5, M.groove),
  ];
}

function floorNightstand({ w, d, h }: Size, c: string): Part[] {
  const mid = 0.1 + (h - 0.1) / 2;
  return [
    ...legs(w, d, 0.1, M.black, 0.04, 0.012),
    box(0, w, 0, d - 0.01, 0.1, h, mat(c, 0.55), { r: 0.008 }),
    box(0.02, w - 0.02, d - 0.012, d - 0.008, mid - 0.003, mid + 0.003, M.groove),
    box(w / 2 - 0.05, w / 2 + 0.05, d - 0.01, d, h - 0.06, h - 0.048, M.black),
    box(w / 2 - 0.05, w / 2 + 0.05, d - 0.01, d, mid - 0.06, mid - 0.048, M.black),
  ];
}

function dresser({ w, d, h }: Size, c: string): Part[] {
  const p: Part[] = [
    box(0, w, 0, d - 0.03, 0.1, h, M.oak, { r: 0.01 }),
    ...legs(w, d - 0.03, 0.1, M.black, 0.05, 0.014),
  ];
  // фасады ящиков: колонки примерно по 54 см, три ряда
  const cols = Math.max(1, Math.round(w / 0.54));
  const cw = (w - 0.06) / cols;
  const rh = (h - 0.14) / 3;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < 3; j++) {
      const x0 = 0.03 + i * cw + 0.005;
      const x1 = 0.03 + (i + 1) * cw - 0.005;
      const y0 = 0.12 + j * rh + 0.005;
      const y1 = 0.12 + (j + 1) * rh - 0.005;
      p.push(box(x0, x1, d - 0.03, d - 0.012, y0, y1, mat(c, 0.5), { r: 0.004 }));
      p.push(box((x0 + x1) / 2 - 0.07, (x0 + x1) / 2 + 0.07, d - 0.012, d, y1 - 0.045, y1 - 0.033, M.black));
    }
  }
  return p;
}

function rug({ w, d, h }: Size, c: string): Part[] {
  const b = Math.min(0.08, w * 0.05, d * 0.05);
  return [box(0, w, 0, d, 0, h, mat(c, 1)), box(b, w - b, b, d - b, h, h + 0.001, mat(tone(c, -0.12), 1))];
}
function roundRug({ w, d, h }: Size, c: string): Part[] {
  return [
    cyl(w / 2, d / 2, 0, h, w / 2, mat(c, 1), { rz: d / 2 }),
    cyl(w / 2, d / 2, h, h + 0.001, w / 2 - 0.08, mat(tone(c, -0.12), 1), { rz: d / 2 - 0.08 }),
  ];
}

function curtain({ w, d, h }: Size, c: string): Part[] {
  return [
    box(0, w, d / 2 - 0.02, d / 2 + 0.02, h - 0.03, h, M.white),
    {
      kind: "wave",
      x0: 0.02,
      x1: w - 0.02,
      z: d / 2,
      y0: 0.015,
      y1: h - 0.04,
      amp: Math.min(d / 2 - 0.01, 0.045),
      waves: Math.max(2, Math.round(w / 0.21)),
      mat: mat(c, 1, 0, { double: true, opacity: 0.93 }),
    },
  ];
}
const curtainPlan = ({ w, d }: Size): PlanPart[] => {
  const n = Math.max(2, Math.round(w / 0.21)) * 2;
  const a = Math.min(d / 2 - 0.01, 0.045);
  return [
    {
      kind: "path",
      points: Array.from({ length: n + 1 }, (_, i): [number, number] => [
        0.02 + ((w - 0.04) * i) / n,
        d / 2 + (i % 2 ? a : -a),
      ]),
    },
  ];
};

function sconce({ w, d, h }: Size, c: string): Part[] {
  const x = w / 2;
  const z = d - w / 2;
  return [
    box(x - 0.05, x + 0.05, 0, 0.015, h - 0.1, h, M.black),
    rod([x, h - 0.04, 0.01], [x, h - 0.04, z], 0.008, M.black),
    cyl(x, z, 0, h, w / 2, mat(c, 0.95, 0, { double: true }), { r2: w * 0.375, open: true }),
  ];
}

// ---------- гостиная ----------

function sofa({ w, d, h }: Size, c: string): Part[] {
  const fab = mat(c, 1);
  const arm = Math.min(0.18, w * 0.2);
  const back = Math.min(0.22, d * 0.25);
  const seat = Math.min(0.45, h * 0.53);
  const p: Part[] = [
    ...legs(w, d, 0.08, M.black, 0.06, 0.02),
    box(0, w, 0.02, d, 0.08, seat - 0.1, fab, { r: 0.03 }),
    box(0, arm, 0, d, 0.08, Math.min(h, seat + 0.2), fab, { r: 0.05 }),
    box(w - arm, w, 0, d, 0.08, Math.min(h, seat + 0.2), fab, { r: 0.05 }),
    box(arm, w - arm, 0, back, 0.08, h, fab, { r: 0.05 }),
  ];
  // подушки сиденья и спинки примерно по 65 см
  const inner = w - 2 * arm;
  const n = Math.max(1, Math.round(inner / 0.65));
  const cw = inner / n;
  for (let i = 0; i < n; i++) {
    const x0 = arm + i * cw + 0.005;
    const x1 = arm + (i + 1) * cw - 0.005;
    p.push(box(x0, x1, back, d - 0.02, seat - 0.1, seat + 0.03, fab, { r: 0.05 }));
    p.push(box(x0, x1, back - 0.02, back + 0.16, seat, h - 0.04, fab, { r: 0.06, tilt: -0.12 }));
  }
  return p;
}
const sofaPlan = ({ w, d }: Size): PlanPart[] => {
  const arm = Math.min(0.18, w * 0.2);
  const back = Math.min(0.22, d * 0.25);
  const inner = w - 2 * arm;
  const n = Math.max(1, Math.round(inner / 0.65));
  return [
    { kind: "rect", x0: 0, x1: arm, z0: 0, z1: d, r: 0.04 },
    { kind: "rect", x0: w - arm, x1: w, z0: 0, z1: d, r: 0.04 },
    { kind: "line", x0: arm, z0: back, x1: w - arm, z1: back },
    ...Array.from(
      { length: n - 1 },
      (_, i): PlanPart => ({
        kind: "line",
        x0: arm + ((i + 1) * inner) / n,
        z0: back,
        x1: arm + ((i + 1) * inner) / n,
        z1: d,
      }),
    ),
  ];
};

function coffeeTable({ w, d, h }: Size, c: string): Part[] {
  const wood = mat(c, 0.55);
  return [
    box(0, w, 0, d, h - 0.03, h, wood, { r: 0.01 }),
    ...legs(w, d, h - 0.03, M.black, 0.05, 0.018),
    box(0.06, w - 0.06, 0.06, d - 0.06, 0.12, 0.14, wood),
  ];
}

function tvStand({ w, d, h }: Size, c: string): Part[] {
  const n = Math.max(1, Math.round(w / 0.6));
  const p: Part[] = [
    ...legs(w, d, 0.1, M.black, 0.05, 0.014),
    box(0, w, 0, d - 0.004, 0.1, h, mat(c, 0.55), { r: 0.006 }),
  ];
  for (let i = 1; i < n; i++)
    p.push(box((i * w) / n - 0.002, (i * w) / n + 0.002, d - 0.005, d, 0.12, h - 0.02, M.groove));
  return p;
}

function tv({ w, d, h }: Size, c: string): Part[] {
  return [
    box(0, w, 0.01, d - 0.002, 0, h, mat(c, 0.4, 0.2), { r: 0.006 }),
    box(0.01, w - 0.01, d - 0.002, d, 0.01, h - 0.01, M.screen),
  ];
}

function bookshelf({ w, d, h }: Size, c: string): Part[] {
  const wood = mat(c, 0.55);
  const t = 0.02;
  const p: Part[] = [
    box(0, t, 0, d, 0, h, wood),
    box(w - t, w, 0, d, 0, h, wood),
    box(t, w - t, 0, d, h - t, h, wood),
    box(t, w - t, 0, d, 0, 0.06, wood),
    box(t, w - t, 0, 0.01, 0.06, h - t, wood),
  ];
  const shelves = Math.max(1, Math.round((h - 0.08) / 0.36));
  const step = (h - 0.06 - t) / shelves;
  const rnd = rng(7);
  for (let i = 0; i < shelves; i++) {
    const y = 0.06 + i * step;
    if (i > 0) p.push(box(t, w - t, 0.01, d, y - 0.018, y, wood));
    // книги: разной толщины и высоты, кое-где промежуток
    for (let x = t + 0.02; x < w - t - 0.06; ) {
      if (rnd() < 0.1) {
        x += 0.06;
        continue;
      }
      const bt = 0.02 + rnd() * 0.03;
      const bh = Math.min(step - 0.05, 0.17 + rnd() * 0.1);
      p.push(
        box(
          x,
          x + bt,
          0.02,
          Math.min(d - 0.02, 0.19 + rnd() * 0.05),
          y,
          y + bh,
          mat(BOOKS[Math.floor(rnd() * BOOKS.length)]!, 0.8),
        ),
      );
      x += bt + 0.003;
    }
  }
  return p;
}

function wallShelf({ w, d, h }: Size, c: string): Part[] {
  const p: Part[] = [box(0, w, 0, d, 0, 0.025, mat(c, 0.55), { r: 0.004 })];
  const rnd = rng(3);
  for (let x = 0.05, i = 0; x < w * 0.6 && i < 9; i++) {
    const bt = 0.025 + rnd() * 0.03;
    const bh = Math.min(h - 0.03, 0.17 + rnd() * 0.08);
    p.push(box(x, x + bt, 0.03, Math.min(d - 0.01, 0.19), 0.025, 0.025 + bh, mat(BOOKS[i % BOOKS.length]!, 0.8)));
    x += bt + 0.003;
  }
  p.push(cyl(w - 0.2, d / 2, 0.025, 0.12, 0.05, mat("#B87A5A", 0.85), { r2: 0.06 }));
  p.push(ball(w - 0.2, Math.min(h, 0.2), d / 2, 0.08, M.leaf));
  return p;
}

function floorLamp({ w, d, h }: Size, c: string): Part[] {
  const x = w / 2;
  const z = d / 2;
  return [
    cyl(x, z, 0, 0.025, w * 0.38, M.black, { rz: d * 0.38 }),
    cyl(x, z, 0.025, h - 0.3, 0.012, M.black),
    cyl(x, z, h - 0.32, h, w / 2, mat(c, 0.95, 0, { double: true }), { r2: w * 0.38, rz: d / 2, open: true }),
  ];
}

function plant({ w, d, h }: Size, c: string): Part[] {
  const x = w / 2;
  const z = d / 2;
  const pot = Math.min(0.35, h * 0.32);
  const top = h - pot;
  return [
    cyl(x, z, 0, pot, w * 0.3, mat(c, 0.85), { r2: w * 0.36, rz: d * 0.3 }),
    ball(x, pot + top * 0.55, z, Math.min(w, top) * 0.45, M.leaf),
    ball(x - w * 0.18, pot + top * 0.32, z + d * 0.08, Math.min(w, top) * 0.3, M.leaf),
    ball(x + w * 0.2, pot + top * 0.4, z - d * 0.1, Math.min(w, top) * 0.28, M.leaf),
    ball(x + 0.02, pot + top * 0.82, z + 0.03, Math.min(w, top) * 0.28, M.leaf),
  ];
}

// ---------- кабинет ----------

function desk({ w, d, h }: Size, c: string): Part[] {
  const p: Part[] = [box(0, w, 0, d, h - 0.025, h, mat(c, 0.55), { r: 0.006 })];
  // рамы-ножки по краям, у длинной столешницы — и посередине
  const xs = [0.06, w - 0.11, ...(w > 2.2 ? [w / 2 - 0.025] : [])];
  for (const x of xs) {
    p.push(box(x, x + 0.05, 0.06, 0.11, 0, h - 0.025, M.black));
    p.push(box(x, x + 0.05, d - 0.11, d - 0.06, 0, h - 0.025, M.black));
    p.push(box(x, x + 0.05, 0.06, d - 0.06, h - 0.07, h - 0.025, M.black));
    p.push(box(x - 0.01, x + 0.06, 0.04, d - 0.04, 0, 0.03, M.black));
  }
  return p;
}

const officeChair = fixed([0.6, 0.6, 1.3], (c) => {
  const x = 0.3;
  const z = 0.3;
  const back = mat(c, 0.95);
  const p: Part[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const sx = Math.sin(a) * 0.27;
    const sz = Math.cos(a) * 0.27;
    p.push(rod([x, 0.07, z], [x + sx, 0.055, z + sz], 0.018, M.black), ball(x + sx, 0.025, z + sz, 0.025, M.black));
  }
  p.push(
    cyl(x, z, 0.07, 0.42, 0.03, M.black),
    box(x - 0.25, x + 0.25, z - 0.22, z + 0.26, 0.42, 0.5, M.seat, { r: 0.03 }),
    box(x - 0.23, x + 0.23, z - 0.3, z - 0.24, 0.58, 1.16, back, { r: 0.025, tilt: -0.12 }),
    box(x - 0.15, x + 0.15, z - 0.34, z - 0.28, 1.17, 1.3, back, { r: 0.025, tilt: -0.2 }),
  );
  for (const s of [-1, 1]) {
    p.push(box(x + s * 0.24 - 0.015, x + s * 0.24 + 0.015, z - 0.035, z - 0.005, 0.5, 0.7, M.black));
    p.push(box(x + s * 0.24 - 0.035, x + s * 0.24 + 0.035, z - 0.1, z + 0.14, 0.7, 0.73, M.black, { r: 0.012 }));
  }
  return p;
});

function pedestal({ w, d, h }: Size, c: string): Part[] {
  return [
    box(0, w, 0, d - 0.004, 0.01, h, mat(c, 0.55), { r: 0.006 }),
    ...[0.35, 0.68].map((k) => box(0.02, w - 0.02, d - 0.005, d, h * k, h * k + 0.006, M.groove)),
    ...legs(w, d, 0.01, M.black, 0.04, 0.02),
  ];
}

// ---------- кухня ----------

/** Нижний модуль: цоколь, корпус, столешница; fronts — фасады между y0 и y1. */
function kitchenBody(w: number, d: number, h: number): Part[] {
  return [
    box(0, w, 0.05, d - 0.07, 0, 0.1, M.plinth),
    box(0, w, 0, d - 0.04, 0.1, h - 0.04, M.body),
    box(0, w, 0, d, h - 0.04, h, M.counter),
  ];
}
function doors(w: number, d: number, y0: number, y1: number, c: string, handleTop = true): Part[] {
  const n = Math.max(1, Math.round(w / 0.6));
  const dw = w / n;
  const p: Part[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = i * dw;
    const x1 = (i + 1) * dw;
    const hy = handleTop ? y1 - 0.06 : y0 + 0.04;
    p.push(box(x0 + 0.003, x1 - 0.003, d - 0.04, d - 0.02, y0 + 0.003, y1 - 0.003, mat(c, 0.6)));
    p.push(box(x0 + 0.03, Math.min(x0 + 0.22, x1 - 0.03), d - 0.02, d - 0.005, hy, hy + 0.012, M.black));
  }
  return p;
}
function kitchenBase({ w, d, h }: Size, c: string): Part[] {
  return [...kitchenBody(w, d, h), ...doors(w, d, 0.1, h - 0.04, c)];
}
function kitchenDrawers({ w, d, h }: Size, c: string): Part[] {
  const rh = (h - 0.14) / 3;
  return [...kitchenBody(w, d, h), ...[0, 1, 2].flatMap((j) => doors(w, d, 0.1 + j * rh, 0.1 + (j + 1) * rh, c))];
}
function kitchenSink({ w, d, h }: Size, c: string): Part[] {
  const x = w / 2;
  return [
    ...kitchenBase({ w, d, h }, c),
    box(0.08, w - 0.08, 0.08, d - 0.1, h - 0.002, h + 0.002, M.steel),
    box(0.11, w - 0.11, 0.11, d - 0.13, h + 0.002, h + 0.003, M.felt),
    rod([x, h, 0.05], [x, h + 0.32, 0.05], 0.014, M.steel),
    rod([x, h + 0.32, 0.05], [x, h + 0.32, 0.24], 0.012, M.steel),
  ];
}
const sinkPlan = ({ w, d }: Size): PlanPart[] => [
  { kind: "rect", x0: 0.08, x1: w - 0.08, z0: 0.08, z1: d - 0.1, r: 0.04 },
];
function kitchenStove({ w, d, h }: Size, c: string): Part[] {
  const front = mat(c, 0.6);
  const r = Math.min(w, d) * 0.13;
  return [
    ...kitchenBody(w, d, h),
    box(0.003, w - 0.003, d - 0.04, d - 0.02, 0.103, 0.18, front),
    box(0.003, w - 0.003, d - 0.04, d - 0.02, 0.18, h - 0.12, M.glassBlack),
    box(0.003, w - 0.003, d - 0.04, d - 0.02, h - 0.12, h - 0.043, front),
    box(0.08, w - 0.08, d - 0.02, d - 0.005, h - 0.16, h - 0.145, M.metal),
    box(0.04, w - 0.04, 0.06, d - 0.08, h, h + 0.005, M.glassBlack),
    ...[
      [0.27, 0.3],
      [0.73, 0.3],
      [0.27, 0.62],
      [0.73, 0.62],
    ].map(([kx, kz]) => cyl(w * kx!, d * kz!, h + 0.005, h + 0.006, r, M.felt)),
  ];
}
const stovePlan = ({ w, d }: Size): PlanPart[] =>
  [
    [0.27, 0.3],
    [0.73, 0.3],
    [0.27, 0.62],
    [0.73, 0.62],
  ].map(([kx, kz]): PlanPart => ({ kind: "circle", x: w * kx!, z: d * kz!, r: Math.min(w, d) * 0.13 }));
function kitchenWall({ w, d, h }: Size, c: string): Part[] {
  const n = Math.max(1, Math.round(w / 0.6));
  const dw = w / n;
  return [
    box(0, w, 0, d - 0.02, 0, h, M.body),
    ...Array.from({ length: n }, (_, i) =>
      box(i * dw + 0.003, (i + 1) * dw - 0.003, d - 0.02, d, 0.003, h - 0.003, mat(c, 0.5)),
    ),
  ];
}
function fridge({ w, d, h }: Size, c: string): Part[] {
  const split = h * 0.62;
  return [
    box(0, w, 0, d - 0.03, 0, h, mat(c, 0.4), { r: 0.01 }),
    box(0.003, w - 0.003, d - 0.03, d - 0.01, 0.003, split - 0.003, mat(c, 0.35), { r: 0.006 }),
    box(0.003, w - 0.003, d - 0.03, d - 0.01, split + 0.003, h - 0.003, mat(c, 0.35), { r: 0.006 }),
    box(w - 0.06, w - 0.04, d - 0.01, d, split - 0.45, split - 0.1, M.metal),
    box(w - 0.06, w - 0.04, d - 0.01, d, split + 0.08, split + 0.3, M.metal),
  ];
}
function diningTable({ w, d, h }: Size, c: string): Part[] {
  const x = w / 2;
  const z = d / 2;
  return [
    box(0, w, 0, d, h - 0.03, h, mat(c, 0.55), { r: 0.01 }),
    cyl(x, z, 0.02, h - 0.03, 0.035, M.black),
    cyl(x, z, 0, 0.02, Math.min(w, d) * 0.41, M.black),
  ];
}
function table4({ w, d, h }: Size, c: string): Part[] {
  const wood = mat(c, 0.55);
  return [
    box(0, w, 0, d, h - 0.03, h, wood, { r: 0.008 }),
    box(0.06, w - 0.06, 0.06, d - 0.06, h - 0.1, h - 0.03, wood),
    ...legs(w, d, h - 0.03, wood, 0.06, 0.025),
  ];
}
function roundTable({ w, d, h }: Size, c: string): Part[] {
  const x = w / 2;
  const z = d / 2;
  return [
    cyl(x, z, h - 0.03, h, w / 2, mat(c, 0.55), { rz: d / 2 }),
    cyl(x, z, 0.02, h - 0.03, 0.025, M.black),
    cyl(x, z, 0, 0.02, w * 0.36, M.black, { rz: d * 0.36 }),
  ];
}
const chair = fixed([0.42, 0.42, 0.86], (c) => {
  const wood = mat(c, 0.55);
  const r = 0.004;
  const p: Part[] = [box(0, 0.42, 0, 0.42, 0.435, 0.465, wood, { r })];
  for (const [x, z] of [
    [0.015, 0.015],
    [0.375, 0.015],
    [0.015, 0.375],
    [0.375, 0.375],
  ])
    p.push(box(x!, x! + 0.03, z!, z! + 0.03, 0, 0.435, wood, { r }));
  for (const x of [0.015, 0.375]) p.push(box(x, x + 0.03, 0, 0.03, 0.465, 0.77, wood, { r }));
  p.push(box(0, 0.42, 0, 0.025, 0.66, 0.86, wood, { r }));
  return p;
});
const chairPlan = ({ w }: Size): PlanPart[] => [{ kind: "line", x0: 0, z0: 0.025, x1: w, z1: 0.025 }];
function bench({ w, d, h }: Size, c: string): Part[] {
  const n = Math.max(1, Math.round(w / 0.46));
  const cw = (w - 0.04) / n;
  return [
    box(0, w, 0, d, 0, 0.4, M.oak, { r: 0.01 }),
    box(0.02, w - 0.02, 0.02, d - 0.02, 0.4, 0.47, mat(c, 0.95), { r: 0.03 }),
    ...Array.from({ length: n }, (_, i) =>
      box(0.02 + i * cw + 0.01, 0.02 + (i + 1) * cw - 0.01, 0.01, 0.15, 0.47, h, M.sage, { r: 0.05 }),
    ),
  ];
}

// ---------- ванная ----------

function bathtub({ w, d, h }: Size, c: string): Part[] {
  // чаша: четыре борта по 8 см и дно на 40 см ниже края
  const t = 0.08;
  const shell = mat(c, 0.15);
  const bottom = Math.max(0.04, h - 0.4);
  return [
    box(0, w, 0, t, 0, h, shell, { r: 0.02 }),
    box(0, w, d - t, d, 0, h, shell, { r: 0.02 }),
    box(0, t, t, d - t, 0, h, shell, { r: 0.02 }),
    box(w - t, w, t, d - t, 0, h, shell, { r: 0.02 }),
    box(t, w - t, t, d - t, 0, bottom, mat("#DCE4E6", 0.2)),
  ];
}
const bathPlan = ({ w, d }: Size): PlanPart[] => [
  { kind: "rect", x0: 0.08, x1: w - 0.08, z0: 0.08, z1: d - 0.08, r: 0.2 },
];
function shower({ w, d, h }: Size, c: string): Part[] {
  return [
    box(0, w, 0, d, 0, 0.06, mat(c, 0.15), { r: 0.01 }),
    box(0.01, w, d - 0.01, d, 0.06, h, M.glass),
    box(w - 0.01, w, 0, d - 0.01, 0.06, h, M.glass),
    box(w - 0.015, w, d - 0.015, d, 0.06, h, M.steel),
    rod([0.06, h - 0.1, 0.03], [0.06, h - 0.1, 0.3], 0.01, M.steel),
    cyl(0.06, 0.3, h - 0.12, h - 0.1, 0.1, M.steel),
  ];
}
const showerPlan = ({ w, d }: Size): PlanPart[] => [
  { kind: "line", x0: 0, z0: 0, x1: w, z1: d },
  { kind: "line", x0: w, z0: 0, x1: 0, z1: d },
];
const toilet = fixed([0.7, 0.72, 1.07], (c) => [
  box(0, 0.7, 0, 0.2, 0, 1.05, M.white),
  box(0, 0.7, 0, 0.22, 1.05, 1.07, M.white),
  box(0.26, 0.44, 0.2, 0.206, 0.86, 0.98, M.porcelain),
  box(0.17, 0.53, 0.2, 0.72, 0.3, 0.42, mat(c, 0.15), { r: 0.08 }),
  box(0.18, 0.52, 0.22, 0.7, 0.42, 0.44, mat(c, 0.15), { r: 0.015 }),
]);
const toiletPlan = ({ w, d }: Size): PlanPart[] => [
  { kind: "line", x0: 0, z0: d * 0.28, x1: w, z1: d * 0.28 },
  { kind: "rect", x0: w * 0.24, x1: w * 0.76, z0: d * 0.3, z1: d, r: w * 0.2 },
];
function vanity({ w, d, h }: Size, c: string): Part[] {
  const r = Math.min(0.2, d * 0.42, w * 0.3);
  return [
    box(0, w, 0, d - 0.02, 0.15, h - 0.03, mat(c, 0.5)),
    box(0.005, w - 0.005, d - 0.02, d - 0.005, 0.155, h - 0.035, mat(c, 0.5)),
    box(0, w, 0, d, h - 0.03, h, M.oak),
    cyl(w / 2, d * 0.52, h, h + 0.13, r, M.porcelain, { r2: r + 0.01 }),
    cyl(w / 2, d * 0.52, h + 0.12, h + 0.13, r - 0.03, M.ceramic),
    rod([w / 2, h + 0.28, 0], [w / 2, h + 0.28, 0.16], 0.012, M.steel),
  ];
}
const vanityPlan = ({ w, d }: Size): PlanPart[] => [
  { kind: "circle", x: w / 2, z: d * 0.52, r: Math.min(0.2, d * 0.42, w * 0.3) },
];
function washer({ w, d, h }: Size, c: string): Part[] {
  const r = Math.min(w, h) * 0.27;
  const y = h * 0.45;
  return [
    box(0, w, 0, d - 0.01, 0, h, mat(c, 0.15), { r: 0.02 }),
    box(0.03, w - 0.03, d - 0.01, d - 0.006, h - 0.1, h - 0.03, mat("#E3E4E2", 0.4)),
    disc(w / 2, y, d - 0.01, r * 1.18, 0.004, mat("#D0D3D5", 0.3, 0.5)),
    disc(w / 2, y, d - 0.01, r, 0.01, M.glassBlack),
  ];
}
function mirror({ w, d, h }: Size, c: string): Part[] {
  return [
    box(0, w, 0, d - 0.004, 0, h, mat(c, 0.45, 0.35)),
    box(0.02, w - 0.02, d - 0.006, d, 0.02, h - 0.02, M.mirror),
  ];
}
function roundMirror({ w, d, h }: Size, c: string): Part[] {
  const r = Math.min(w, h) / 2;
  return [
    disc(w / 2, h / 2, 0, r, d - 0.006, mat(c, 0.45, 0.35)),
    disc(w / 2, h / 2, d - 0.008, r * 0.96, 0.008, M.mirror),
  ];
}

// ---------- прихожая ----------

const hallBench = fixed([0.88, 0.35, 2.08], (c) => [
  box(0, 0.88, 0, 0.35, 0, 0.06, M.plinth),
  box(0, 0.88, 0, 0.35, 0.2, 0.23, M.oak),
  box(0, 0.88, 0, 0.35, 0.42, 0.45, M.oak),
  box(0, 0.03, 0, 0.35, 0, 0.45, M.oak),
  box(0.85, 0.88, 0, 0.35, 0, 0.45, M.oak),
  box(0.04, 0.84, 0.02, 0.33, 0.45, 0.5, mat(c, 0.95), { r: 0.02 }),
  ...[
    [0.08, 4],
    [0.3, 0],
    [0.53, 5],
  ].map(([x, k]) => box(x!, x! + 0.18, 0.05, 0.31, 0.06, 0.16, mat(CLOTH[k!]!, 1), { r: 0.02 })),
  box(0, 0.88, 0, 0.02, 1.55, 1.75, M.oak),
  ...[0.13, 0.33, 0.53, 0.73].map((x) => rod([x, 1.65, 0.02], [x, 1.68, 0.09], 0.009, M.black)),
  box(0.08, 0.31, 0.03, 0.24, 0.95, 1.63, mat(CLOTH[0]!, 1), { r: 0.03 }),
  box(0.36, 0.56, 0.03, 0.22, 1.05, 1.63, mat(CLOTH[3]!, 1), { r: 0.03 }),
  box(0, 0.88, 0, 0.3, 1.9, 1.92, M.oak),
  box(0.08, 0.38, 0.04, 0.28, 1.92, 2.08, mat("#9AA0A3", 0.9), { r: 0.02 }),
]);
function cabinet({ w, d, h }: Size, c: string): Part[] {
  const n = Math.max(1, Math.round(w / 0.47));
  const dw = w / n;
  const p: Part[] = [box(0, w, 0, d - 0.003, 0, h, mat(c, 0.5), { r: 0.005 })];
  for (let i = 1; i < n; i++) p.push(box(i * dw - 0.002, i * dw + 0.002, d - 0.004, d, 0.05, h - 0.05, M.groove));
  // ручки у стыка пары створок
  for (let i = 0; i < n; i++) {
    const x = i % 2 === 0 ? (i + 1) * dw - 0.05 : i * dw + 0.03;
    p.push(box(x, x + 0.02, d - 0.003, d, h * 0.35, h * 0.5, M.black));
  }
  return p;
}

// ---------- разное ----------

const dogStation = fixed([0.9, 0.75, 0.3], (c) => [
  box(0, 0.9, 0, 0.75, 0, 0.006, mat(c, 0.9)),
  box(0.04, 0.88, 0.02, 0.42, 0.006, 0.3, M.oak, { r: 0.01 }),
  box(0.08, 0.84, 0.42, 0.423, 0.15, 0.155, M.groove),
  cyl(0.3, 0.22, 0.26, 0.312, 0.1, M.steel, { r2: 0.13 }),
  cyl(0.3, 0.22, 0.29, 0.3, 0.115, M.water),
  cyl(0.64, 0.22, 0.26, 0.312, 0.1, M.steel, { r2: 0.13 }),
  cyl(0.64, 0.22, 0.292, 0.302, 0.11, M.food),
]);
const dogPlan = ({ w, d }: Size): PlanPart[] => [
  { kind: "rect", x0: w * 0.044, x1: w * 0.978, z0: d * 0.027, z1: d * 0.56 },
  { kind: "circle", x: w * 0.333, z: d * 0.293, r: Math.min(w, d) * 0.15 },
  { kind: "circle", x: w * 0.711, z: d * 0.293, r: Math.min(w, d) * 0.15 },
];
const robot = fixed([0.34, 0.49, 0.12], (c) => [
  box(0.03, 0.31, 0, 0.13, 0, 0.12, M.black, { r: 0.02 }),
  cyl(0.17, 0.32, 0, 0.09, 0.17, mat(c, 0.55)),
  cyl(0.17, 0.32, 0.09, 0.1, 0.05, M.black),
]);
const robotPlan = ({ w, d }: Size): PlanPart[] => [
  { kind: "rect", x0: w * 0.09, x1: w * 0.91, z0: 0, z1: d * 0.27 },
  { kind: "circle", x: w / 2, z: d * 0.65, r: Math.min(w / 2, d * 0.35) },
];
function airConditioner({ w, d, h }: Size, c: string): Part[] {
  return [
    box(0, w, 0, d, 0, h, mat(c, 0.35), { r: 0.03 }),
    box(0.03, w - 0.03, d - 0.06, d + 0.001, 0.015, 0.05, mat("#DADBD8", 0.5)),
  ];
}
function radiator({ w, d, h }: Size, c: string): Part[] {
  const m = mat(c, 0.35);
  const n = Math.max(1, Math.round(w / 0.081));
  const sw = w / n;
  return [
    ...Array.from({ length: n }, (_, i) => box(i * sw + 0.006, (i + 1) * sw - 0.006, 0, d, 0, h, m, { r: 0.012 })),
    rod([0, 0.04, d / 2], [w, 0.04, d / 2], 0.012, m),
    rod([0, h - 0.04, d / 2], [w, h - 0.04, d / 2], 0.012, m),
  ];
}

export const CATALOG: CatalogItem[] = [
  // спальня
  {
    type: "bed",
    name: "Кровать двуспальная",
    group: "bedroom",
    size: [1.72, 2.12, 1.18],
    color: "#D6CFC3",
    build: bed,
    plan: bedPlan,
  },
  {
    type: "bed-single",
    name: "Кровать односпальная",
    group: "bedroom",
    size: [0.98, 2.08, 0.9],
    color: "#B9A58A",
    build: bed,
    plan: bedPlan,
  },
  {
    type: "nightstand",
    name: "Тумба подвесная",
    group: "bedroom",
    size: [0.4, 0.4, 0.2],
    elevation: 0.36,
    color: "#C9A57C",
    build: nightstand,
  },
  {
    type: "nightstand-floor",
    name: "Тумба прикроватная",
    group: "bedroom",
    size: [0.45, 0.4, 0.5],
    color: "#C9A57C",
    build: floorNightstand,
  },
  {
    type: "wardrobe",
    name: "Шкаф-купе",
    group: "bedroom",
    size: [2.88, 0.6, 2.7],
    ceiling: true,
    color: "#C9D3D8",
    build: wardrobe,
    plan: wardrobePlan,
  },
  { type: "dresser", name: "Комод", group: "bedroom", size: [1.08, 0.43, 0.82], color: "#F4F2EE", build: dresser },
  { type: "rug", name: "Ковёр", group: "bedroom", size: [2.4, 2.05, 0.012], free: true, color: "#C9B8A0", build: rug },
  {
    type: "rug-round",
    name: "Ковёр круглый",
    group: "bedroom",
    size: [1.6, 1.6, 0.012],
    free: true,
    round: true,
    color: "#A2AC96",
    build: roundRug,
  },
  {
    type: "curtain",
    name: "Штора на треке",
    group: "bedroom",
    size: [3.4, 0.12, 2.7],
    ceiling: true,
    color: "#E3D8C7",
    build: curtain,
    plan: curtainPlan,
  },
  {
    type: "sconce",
    name: "Бра",
    group: "bedroom",
    size: [0.2, 0.32, 0.16],
    elevation: 1.24,
    color: "#EFE6D6",
    build: sconce,
  },
  // гостиная
  {
    type: "sofa",
    name: "Диван",
    group: "living",
    size: [2.2, 0.95, 0.85],
    color: "#7C8B7A",
    build: sofa,
    plan: sofaPlan,
  },
  {
    type: "armchair",
    name: "Кресло мягкое",
    group: "living",
    size: [0.85, 0.85, 0.82],
    color: "#B9A58A",
    build: sofa,
    plan: sofaPlan,
  },
  {
    type: "coffee-table",
    name: "Столик журнальный",
    group: "living",
    size: [1.0, 0.6, 0.42],
    free: true,
    color: "#C9A57C",
    build: coffeeTable,
  },
  { type: "tv-stand", name: "ТВ-тумба", group: "living", size: [1.8, 0.4, 0.5], color: "#C9A57C", build: tvStand },
  {
    type: "tv",
    name: "Телевизор на стене",
    group: "living",
    size: [1.23, 0.06, 0.71],
    elevation: 0.95,
    color: "#151618",
    build: tv,
  },
  {
    type: "bookshelf",
    name: "Стеллаж с книгами",
    group: "living",
    size: [0.8, 0.32, 2.0],
    color: "#F2F1EE",
    build: bookshelf,
  },
  {
    type: "wall-shelf",
    name: "Полка настенная",
    group: "living",
    size: [0.8, 0.22, 0.3],
    elevation: 1.5,
    color: "#C9A57C",
    build: wallShelf,
  },
  {
    type: "floor-lamp",
    name: "Торшер",
    group: "living",
    size: [0.4, 0.4, 1.6],
    round: true,
    free: true,
    color: "#EFE6D6",
    build: floorLamp,
  },
  {
    type: "plant",
    name: "Растение в кашпо",
    group: "living",
    size: [0.45, 0.45, 1.1],
    round: true,
    free: true,
    color: "#B87A5A",
    build: plant,
  },
  // кабинет
  { type: "desk", name: "Стол письменный", group: "work", size: [1.4, 0.7, 0.75], color: "#C9A57C", build: desk },
  {
    type: "desk-long",
    name: "Столешница на двоих",
    group: "work",
    size: [3.35, 0.7, 0.75],
    color: "#C9A57C",
    build: desk,
  },
  {
    type: "office-chair",
    name: "Кресло рабочее",
    group: "work",
    size: [0.6, 0.6, 1.3],
    round: true,
    free: true,
    color: "#2C3033",
    build: officeChair,
  },
  {
    type: "pedestal",
    name: "Тумба с ящиками",
    group: "work",
    size: [0.4, 0.6, 0.72],
    color: "#F2F1EE",
    build: pedestal,
  },
  // кухня
  {
    type: "kitchen-base",
    name: "Нижний модуль",
    group: "kitchen",
    size: [0.6, 0.6, 0.9],
    color: "#5F7A73",
    build: kitchenBase,
  },
  {
    type: "kitchen-drawers",
    name: "Модуль с ящиками",
    group: "kitchen",
    size: [0.6, 0.6, 0.9],
    color: "#5F7A73",
    build: kitchenDrawers,
  },
  {
    type: "kitchen-sink",
    name: "Модуль с мойкой",
    group: "kitchen",
    size: [0.8, 0.6, 0.9],
    color: "#5F7A73",
    build: kitchenSink,
    plan: sinkPlan,
  },
  {
    type: "kitchen-stove",
    name: "Плита с духовкой",
    group: "kitchen",
    size: [0.6, 0.6, 0.9],
    color: "#5F7A73",
    build: kitchenStove,
    plan: stovePlan,
  },
  {
    type: "kitchen-wall",
    name: "Шкаф навесной",
    group: "kitchen",
    size: [0.6, 0.33, 0.8],
    elevation: 1.5,
    color: "#EFEDE8",
    build: kitchenWall,
  },
  { type: "fridge", name: "Холодильник", group: "kitchen", size: [0.6, 0.65, 2.0], color: "#E4E6E7", build: fridge },
  {
    type: "dining-table",
    name: "Стол на одной ножке",
    group: "kitchen",
    size: [0.9, 0.58, 0.75],
    free: true,
    color: "#C9A57C",
    build: diningTable,
  },
  {
    type: "table",
    name: "Стол обеденный",
    group: "kitchen",
    size: [1.4, 0.8, 0.75],
    free: true,
    color: "#C9A57C",
    build: table4,
  },
  {
    type: "round-table",
    name: "Столик круглый",
    group: "kitchen",
    size: [0.56, 0.56, 0.73],
    round: true,
    free: true,
    color: "#C9A57C",
    build: roundTable,
  },
  {
    type: "chair",
    name: "Стул",
    group: "kitchen",
    size: [0.42, 0.42, 0.86],
    free: true,
    color: "#C9A57C",
    build: chair,
    plan: chairPlan,
  },
  { type: "bench", name: "Банкетка", group: "kitchen", size: [1.4, 0.5, 0.86], color: "#C39A4A", build: bench },
  // ванная
  {
    type: "bathtub",
    name: "Ванна",
    group: "bath",
    size: [1.7, 0.7, 0.58],
    color: "#F7F7F5",
    build: bathtub,
    plan: bathPlan,
  },
  {
    type: "shower",
    name: "Душевой уголок",
    group: "bath",
    size: [0.9, 0.9, 2.0],
    color: "#F7F7F5",
    build: shower,
    plan: showerPlan,
  },
  {
    type: "toilet",
    name: "Унитаз подвесной",
    group: "bath",
    size: [0.7, 0.72, 1.07],
    color: "#F7F7F5",
    build: toilet,
    plan: toiletPlan,
  },
  {
    type: "vanity",
    name: "Тумба с раковиной",
    group: "bath",
    size: [0.8, 0.46, 0.85],
    color: "#EFEDE8",
    build: vanity,
    plan: vanityPlan,
  },
  { type: "washer", name: "Стиральная машина", group: "bath", size: [0.6, 0.6, 0.85], color: "#F7F7F5", build: washer },
  {
    type: "mirror",
    name: "Зеркало в рост",
    group: "bath",
    size: [0.5, 0.02, 1.65],
    elevation: 0.35,
    color: "#1D1F21",
    build: mirror,
  },
  // прихожая
  {
    type: "hall-bench",
    name: "Скамья с вешалкой",
    group: "hall",
    size: [0.88, 0.35, 2.08],
    color: "#8FA79F",
    build: hallBench,
  },
  { type: "cabinet", name: "Шкаф распашной", group: "hall", size: [0.94, 0.45, 2.6], color: "#EFEDE8", build: cabinet },
  {
    type: "doormat",
    name: "Коврик у двери",
    group: "hall",
    size: [0.75, 0.45, 0.01],
    free: true,
    color: "#5A5650",
    build: rug,
  },
  {
    type: "mirror-round",
    name: "Зеркало круглое",
    group: "hall",
    size: [0.7, 0.03, 0.7],
    elevation: 1.15,
    color: "#1D1F21",
    build: roundMirror,
  },
  // разное
  {
    type: "dog-station",
    name: "Место для собаки",
    group: "misc",
    size: [0.9, 0.75, 0.3],
    color: "#B77A5C",
    build: dogStation,
    plan: dogPlan,
  },
  {
    type: "robot",
    name: "Робот-пылесос с базой",
    group: "misc",
    size: [0.34, 0.49, 0.12],
    color: "#F2F1EE",
    build: robot,
    plan: robotPlan,
  },
  {
    type: "ac",
    name: "Кондиционер",
    group: "misc",
    size: [0.85, 0.21, 0.29],
    elevation: 2.35,
    color: "#F7F7F5",
    build: airConditioner,
  },
  {
    type: "radiator",
    name: "Батарея",
    group: "misc",
    size: [1.46, 0.08, 0.54],
    elevation: 0.12,
    color: "#F4F4F2",
    build: radiator,
  },
];

const BY_TYPE = new Map(CATALOG.map((c) => [c.type, c]));
export const catalogItem = (type: string): CatalogItem | undefined => BY_TYPE.get(type);
export const isRound = (it: Item): boolean => !!catalogItem(it.type)?.round;
/** Прижимать ли спинкой к стене при постановке: не у ковров, стульев и того, что стоит посреди комнаты. */
export const againstWall = (it: Pick<Item, "type" | "height">): boolean =>
  !catalogItem(it.type)?.free && it.height >= 0.03;
/** Детали предмета каталога под его размер и цвет; у своей модели и неизвестного вида — пусто. */
export function itemParts(it: Pick<Item, "type" | "width" | "depth" | "height" | "color">): Part[] {
  const c = catalogItem(it.type);
  return c ? c.build({ w: it.width, d: it.depth, h: it.height }, it.color ?? c.color) : [];
}

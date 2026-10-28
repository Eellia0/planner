// Единицы. Внутри приложения все длины хранятся в метрах.
// Ввод пользователя разбирается так:
//   «1060 мм» → 1.06    «106 см» → 1.06    «1,06 м» → 1.06
//   без единиц: целое число — сантиметры («106» → 1.06), дробное — метры («6,55» → 6.55)

const UNIT_TO_M: Record<string, number> = { мм: 0.001, mm: 0.001, см: 0.01, cm: 0.01, м: 1, m: 1 };

/** Разбирает строку с длиной. Возвращает метры или null, если разобрать не удалось. */
export function parseLength(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d+(?:[.,]\d+)?)(мм|mm|см|cm|м|m)?$/.exec(s);
  if (!m) return null;
  const raw = m[1]!;
  const value = Number(raw.replace(',', '.'));
  const unit = m[2];
  if (unit) return round(value * UNIT_TO_M[unit]!);
  const isInteger = !/[.,]/.test(raw);
  return round(isInteger ? value / 100 : value);
}

/** Округление до миллиметра: точнее в квартире не померить. */
export function round(meters: number): number {
  return Math.round(meters * 1000) / 1000;
}

/** Стены и проходы — в метрах: «6,55». */
export function formatMeters(meters: number): string {
  return meters.toFixed(2).replace('.', ',');
}

/** Мебель — в сантиметрах: «172». Миллиметры показываются, только если они есть: «82,5». */
export function formatCm(meters: number): string {
  const cm = Math.round(meters * 1000) / 10;
  return Number.isInteger(cm) ? String(cm) : cm.toFixed(1).replace('.', ',');
}

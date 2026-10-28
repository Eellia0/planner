import { describe, expect, it } from 'vitest';
import { formatCm, formatMeters, parseLength } from './units';

describe('parseLength', () => {
  it('понимает одну длину в любой записи', () => {
    for (const s of ['106', '106 см', '1,06 м', '1.06м', '1060 мм', '1060mm', ' 1,06 ']) {
      expect(parseLength(s)).toBe(1.06);
    }
  });
  it('дробное число без единиц — метры, целое — сантиметры', () => {
    expect(parseLength('6,55')).toBe(6.55);
    expect(parseLength('340')).toBe(3.4);
  });
  it('мусор не разбирает', () => {
    for (const s of ['', 'abc', '1,0,6', '-5', '5 км']) expect(parseLength(s)).toBeNull();
  });
});

describe('форматирование', () => {
  it('стены в метрах, мебель в сантиметрах', () => {
    expect(formatMeters(6.55)).toBe('6,55');
    expect(formatCm(1.72)).toBe('172');
    expect(formatCm(0.825)).toBe('82,5');
  });
});

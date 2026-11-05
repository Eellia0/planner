import { describe, expect, it } from 'vitest';
import { formatAngle, formatCm, formatMeters, parseAngle, parseLength } from './units';

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

describe('parseAngle', () => {
  it('градусы с запятой, знаком и значком', () => {
    expect(parseAngle('30')).toBe(30);
    expect(parseAngle('22,5')).toBe(22.5);
    expect(parseAngle('-45')).toBe(-45);
    expect(parseAngle(' 135 ° ')).toBe(135);
  });
  it('мусор не разбирает', () => {
    for (const s of ['', 'abc', '30 см', '1,2,3']) expect(parseAngle(s)).toBeNull();
  });
  it('подпись угла', () => {
    expect(formatAngle(90)).toBe('90°');
    expect(formatAngle(22.5)).toBe('22,5°');
  });
});

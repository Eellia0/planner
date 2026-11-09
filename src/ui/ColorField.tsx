import { useEffect, useRef, useState } from 'react';
import { usedPaints } from '../core/ops';
import { WALL_COLOR } from '../core/types';
import { useEditor } from '../store/editor';

/** Базовые цвета стен: нейтральные и стены из палитр kvartira (Шалфей, Олива, Хвоя, Эвкалипт). */
export const BASE_COLORS: [string, string][] = [
  ['#FFFFFF', 'белый'],
  ['#EEEBE4', 'тёплый белый'],
  ['#E8E1D5', 'топлёное молоко'],
  ['#D3C2AB', 'тёплый песок'],
  ['#CFAF9A', 'пыльная глина'],
  ['#B87355', 'терракота'],
  ['#C5BF9E', 'светлая олива'],
  ['#767A56', 'олива'],
  ['#B3BDAA', 'светлый шалфей'],
  ['#A2AC96', 'шалфей'],
  ['#5E7972', 'эвкалипт'],
  ['#34493F', 'хвоя'],
  ['#B7C7CF', 'серо-голубой'],
  ['#2F3E55', 'тёмно-синий'],
  ['#CFCFCB', 'светло-серый'],
  ['#4A4F52', 'графит'],
];
const nameOf = (c: string) => BASE_COLORS.find(([hex]) => hex === c.toUpperCase())?.[1] ?? c.toUpperCase();

function Swatch({ color, current, onPick }: { color: string; current: string | null; onPick: (c: string) => void }) {
  return (
    <button type="button" className="swatch" style={{ background: color }} title={nameOf(color)} aria-label={nameOf(color)}
      aria-pressed={current?.toUpperCase() === color.toUpperCase()} onClick={() => onPick(color)} />
  );
}

/**
 * Цвет граней: кнопка с образцом открывает меню — базовые, уже использованные в проекте, свой цвет, сброс.
 * value: цвет; undefined — не окрашено (цвет по умолчанию); null — у выбранных граней разные цвета.
 */
export function ColorField({ label, value, onPick }: { label: string; value: string | undefined | null; onPick: (c: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const used = useEditor(s => usedPaints(s.project).join(' '));
  const root = useRef<HTMLDivElement>(null);
  const custom = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  // свой цвет: применяем, когда окно выбора закрыли («change»), а не на каждое движение — иначе десятки шагов отмены
  useEffect(() => {
    const input = custom.current;
    if (!input) return;
    const onChange = () => { onPick(input.value.toUpperCase()); setOpen(false); };
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, [open, onPick]);

  const pick = (c: string | null) => { onPick(c); setOpen(false); };
  const shown = value ?? WALL_COLOR;
  const text = value === null ? 'разные' : value === undefined ? 'без цвета' : nameOf(value);

  return (
    <div className="field color-field" ref={root}>
      <span>{label}</span>
      <button type="button" className="color-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <i className={`chip-color${value === null ? ' mixed' : ''}`} style={value === null ? undefined : { background: shown }} />
        <span>{text}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5z" /></svg>
      </button>
      {open && (
        <div className="color-pop" role="dialog" aria-label={label}>
          <p className="color-title">Базовые</p>
          <div className="swatches">
            {BASE_COLORS.map(([c]) => <Swatch key={c} color={c} current={value ?? null} onPick={pick} />)}
          </div>
          {used && (
            <>
              <p className="color-title">Уже в проекте</p>
              <div className="swatches">
                {used.split(' ').map(c => <Swatch key={c} color={c} current={value ?? null} onPick={pick} />)}
              </div>
            </>
          )}
          <div className="color-actions">
            <label className="ghost color-custom">
              <input ref={custom} type="color" defaultValue={value ?? '#A2AC96'} />
              Свой цвет…
            </label>
            <button type="button" className="ghost" onClick={() => pick(null)} disabled={value === undefined}>Без цвета</button>
          </div>
        </div>
      )}
    </div>
  );
}

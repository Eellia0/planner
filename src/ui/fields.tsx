// Поля панели свойств: длина с разбором «340», «3,40», «3400 мм» и текст.
import { useEffect, useState } from "react";
import { parseLength } from "../core/units";

/** Поле длины: принимает «340», «3,40», «3400 мм»; применяет по Enter или при уходе из поля. */
export function LengthField({
  label,
  value,
  format,
  onCommit,
}: {
  label: string;
  value: number | null;
  format: (m: number) => string;
  onCommit: (m: number) => void;
}) {
  const shown = value === null ? "" : format(value);
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(shown);
    setBad(false);
  }, [shown]);
  const commit = () => {
    if (text === shown) return;
    const m = parseLength(text);
    if (m === null || m <= 0) {
      setBad(true);
      return;
    }
    setBad(false);
    onCommit(m);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={text}
        placeholder={value === null ? "разные" : undefined}
        aria-invalid={bad}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setText(shown);
        }}
      />
    </label>
  );
}

/** Текстовое поле (название): применяет по Enter или при уходе из поля, пустое не принимает. */
export function TextField({
  id,
  label,
  value,
  onCommit,
}: {
  id?: string;
  label: string;
  value: string;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  const commit = () => {
    if (!text.trim()) setText(value);
    else if (text !== value) onCommit(text);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        id={id}
        className="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setText(value);
        }}
      />
    </label>
  );
}

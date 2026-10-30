import { useEffect, useState, type ReactNode } from 'react';

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-neutral-800 px-4 py-3">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{title}</h2>
        {right}
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/** Numeric input that keeps the user's draft text while typing and commits valid numbers. */
export function NumberField({
  label,
  value,
  onChange,
  step = 0.01,
  min,
  max,
  unit,
  precision = 3,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  precision?: number;
}) {
  const fmt = (v: number) => String(Math.round(v * 10 ** precision) / 10 ** precision);
  const [draft, setDraft] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(fmt(value));
  }, [value, focused]);

  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
      <span className="w-4 shrink-0 text-neutral-500">{label}</span>
      <input
        type="number"
        className="w-full min-w-0 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 font-mono text-neutral-100 outline-none focus:border-sky-500"
        value={draft}
        step={step}
        min={min}
        max={max}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
        }}
      />
      {unit && <span className="shrink-0 text-neutral-500">{unit}</span>}
    </label>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  unit,
  precision = 2,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  precision?: number;
}) {
  return (
    <label className="block text-xs">
      <div className="mb-0.5 flex justify-between text-neutral-400">
        <span>{label}</span>
        <span className="font-mono text-neutral-200">
          {value.toFixed(precision)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-sky-500"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

export function Toggle({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => onChange(!checked)}
      className={`rounded px-2 py-1 text-xs transition-colors ${
        checked ? 'bg-sky-600/30 text-sky-200 ring-1 ring-sky-500/60' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
      }`}
    >
      {label}
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  title,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  title?: string;
  disabled?: boolean;
}) {
  const styles = {
    default: 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700',
    primary: 'bg-sky-600 text-white hover:bg-sky-500',
    danger: 'bg-red-900/60 text-red-200 hover:bg-red-800',
  }[variant];
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Readout({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-neutral-500">{label}</span>
      <span className={`font-mono ${warn ? 'text-amber-300' : 'text-neutral-200'}`}>{value}</span>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

export type SelectOption = { value: string; label: string };

type SelectFieldProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
};

export function SelectField({ value, options, onChange, ariaLabel, className = '' }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className={`kl-select-root ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="kl-select-trigger"
      >
        <span className="truncate">{selected?.label ?? 'Selecione'}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className={`kl-select-chevron ${open ? 'is-open' : ''}`} fill="none">
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="listbox" aria-label={ariaLabel} className="kl-select-menu">
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => { onChange(option.value); setOpen(false); }}
              className={`kl-select-option ${option.value === value ? 'is-selected' : ''}`}
            >
              <span>{option.label}</span>
              {option.value === value && <span aria-hidden="true" className="kl-select-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

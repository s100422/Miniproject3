"use client";

import { useEffect, useRef, useState } from "react";

export type SelectOption = { value: string; label: string };

/** 네이티브 select는 팝업 모양을 CSS로 못 바꿔서, 트리거+목록을 직접 그리는 커스텀 드롭다운. */
export function Select({
  id,
  value,
  onChange,
  options,
  placeholder = "선택",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-full border border-outline-variant bg-surface px-4 py-2.5 text-body-md font-body-md transition-shadow focus:border-primary focus:ring-1 focus:ring-secondary focus:outline-none"
      >
        <span className={selected ? "" : "text-on-surface-variant"}>
          {selected?.label ?? placeholder}
        </span>
        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
          expand_more
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-2 max-h-64 w-full min-w-max overflow-y-auto rounded-2xl border border-outline-variant bg-surface-container-lowest p-1 shadow-[0_4px_12px_rgba(0,8,31,0.15)]"
        >
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-body-md font-body-md transition-colors hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined w-4 shrink-0 text-[16px] text-primary">
                  {o.value === value ? "check" : ""}
                </span>
                <span
                  className={o.value === value ? "font-bold text-primary" : ""}
                >
                  {o.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

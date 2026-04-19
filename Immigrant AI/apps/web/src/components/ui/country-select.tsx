"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { WORLD_COUNTRIES } from "@/data/world-countries";

type CountrySelectProps = {
  label: string;
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  error?: string;
};

export function CountrySelect({ label, value, onChange, placeholder = "Search countries…", error }: CountrySelectProps) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => WORLD_COUNTRIES.find((c) => c.name.toLowerCase() === value.toLowerCase()),
    [value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return WORLD_COUNTRIES;
    return WORLD_COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="block space-y-1.5" ref={rootRef}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">{label}</label>
      <div className="relative">
        <button
          type="button"
          id={inputId}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex h-[46px] w-full items-center justify-between rounded-xl border bg-white px-4 text-left text-base outline-none transition-all duration-200 focus:border-accent focus:ring-4 focus:ring-accent/10",
            error ? "border-red" : "border-line",
            selected ? "text-ink" : "text-muted/60"
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                <span className="text-lg leading-none">{selected.flag}</span>
                <span>{selected.name}</span>
              </>
            ) : (
              <span>{placeholder}</span>
            )}
          </span>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-muted">
            <path d="M5 7l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open ? (
          <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-line bg-white shadow-xl">
            <div className="border-b border-line p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
              />
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted">No match</li>
              ) : (
                filtered.map((c) => (
                  <li key={c.code}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(c.name);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-accent/5",
                        selected?.code === c.code ? "bg-accent/10 text-accent" : "text-ink"
                      )}
                    >
                      <span className="text-lg leading-none">{c.flag}</span>
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted">{c.code}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red">{error}</p> : null}
    </div>
  );
}

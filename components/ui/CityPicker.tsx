"use client";

import { useEffect, useRef, useState } from "react";
import { RUSSIAN_CITIES } from "@/lib/data/russian-cities";

interface CityPickerProps {
  value: string;
  onChange: (city: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Выбор города — только из списка городов России (lib/data/russian-cities.ts),
 * свободный ввод произвольного текста не сохраняется. Печатаешь — список
 * фильтруется живьём; если не выбрать город из выпадающего списка, при
 * потере фокуса поле откатывается к последнему реально выбранному значению.
 */
export function CityPicker({ value, onChange, placeholder = "Город", className = "", autoFocus }: CityPickerProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value); // отменяем недописанный/невыбранный ввод
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  const filtered = query.trim()
    ? RUSSIAN_CITIES.filter((c) => c.toLowerCase().startsWith(query.trim().toLowerCase())).slice(0, 50)
    : RUSSIAN_CITIES;

  function selectCity(city: string) {
    onChange(city);
    setQuery(city);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
      />
      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-card bg-white shadow-card-lg">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-400">Такого города нет в списке</p>
          ) : (
            filtered.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => selectCity(city)}
                className="block w-full px-4 py-2.5 text-left text-sm text-ink-900 hover:bg-lavender-50"
              >
                {city}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

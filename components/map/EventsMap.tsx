"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createMap, type LngLat, type MapLibreMap, type MapLibreMarker } from "@/lib/maps/load-maplibre";
import { searchAddress } from "@/lib/maps/forward-geocode";
import { ADDRESS_ZOOM, groupLocations } from "@/lib/maps/event-addresses";
import { CATEGORY_ICON } from "@/lib/data/category-icons";

export interface MapEventItem {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  latitude: number;
  longitude: number;
  placeName: string | null;
  address: string | null;
  seatsLeft: number;
  category: { slug: string; name: string; emoji: string | null } | null;
  isBusiness?: boolean;
  /** Тип события города (concert, theatre…) — для фильтра категорий на карте заведений. */
  kind?: string | null;
  /** Начало/конец встречи в UTC и пояс города — для метки «сейчас / через 1 ч / 20:30 / завтра». */
  startsAt?: string;
  endsAt?: string;
  utcOffset?: number;
  organizer?: { name: string; avatarUrl: string | null } | null;
  /** Фото в метке: обложка у заведений, аватар у людей (с сервера). */
  markerPhoto?: string | null;
  /** Анонимная встреча, организатор и точное место скрыты — точка показывает только район. */
  organizerHidden?: boolean;
}

export interface EventsMapHandle {
  /** Приближает карту так, чтобы в кадре поместились все переданные точки. */
  fitBounds: (points: [number, number][]) => void;
  /** Показывает «я здесь» (геолокация Telegram/браузера) и переезжает туда. */
  locate: () => Promise<boolean>;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface EventsMapProps {
  events: MapEventItem[];
  onSelect: (events: MapEventItem[]) => void;
  /**
   * Город из фильтра — карта переезжает туда, даже если в этом городе
   * пока нет ни одной встречи (раньше в таком случае карта оставалась на
   * запасном центре — Тюмени — независимо от выбранного города).
   */
  city?: string;
}

const DEFAULT_CENTER: [number, number] = [65.534328, 57.152985]; // Тюмень, запасной центр
// Пиксельный радиус группировки — ориентир из задания на кластеризацию
// (не радиус географического поиска, а расстояние на экране в CSS-пикселях).
// Метка с подписью времени ~80px высотой и до ~90px шириной — радиус больше неё,
// иначе соседние метки налезают друг на друга.
const CLUSTER_RADIUS = 72;
/** Координаты центра города через геокодер — с фолбэком на Тюмень, если геокодирование не удалось. */
async function geocodeCityCenter(city: string): Promise<[number, number]> {
  const suggestions = await searchAddress(city);
  const first = suggestions[0];
  return first ? [first.longitude, first.latitude] : DEFAULT_CENTER;
}

// Новые SVG-маркеры (viewBox 256×288, "кончик" пина на y≈269/288). Соответствие
// slug категории (см. supabase/migrations/0003_categories.sql) маркерам МЕСТО.
// Метки карты — новые 3D-иконки категорий в фирменной градиентной капле.
const PIN_SLUGS = new Set(["training", "cinema", "coffee", "breakfast", "dinner", "walk", "active", "party", "custom"]);
const pinSrc = (slug: string) => `/brand/markers/v2/pin-${slug}.png`;
const FALLBACK_MARKER = pinSrc("custom");

/** Метка-капля встречи (для мини-карты встречи и выбора места). */
export function markerIconFor(event: Pick<MapEventItem, "isBusiness" | "category">): string {
  if (event.isBusiness) return pinSrc("business");
  const slug = event.category?.slug ?? "";
  return PIN_SLUGS.has(slug) ? pinSrc(slug) : FALLBACK_MARKER;
}

/** 3D-иконка категории без капли — внутрь метки и для карточек списка. */
export function categoryIcon3d(event: Pick<MapEventItem, "isBusiness" | "category">): string {
  if (event.isBusiness) return CATEGORY_ICON.business ?? "";
  return CATEGORY_ICON[event.category?.slug ?? ""] ?? CATEGORY_ICON.custom ?? "";
}

/**
 * Круглый счётчик встреч — из пакета MESTO_MAP_CLUSTERS (cluster.css/.js):
 * белый круг, тёмная жирная цифра, фиолетово-оранжевая градиентная рамка,
 * мягкая тень. 52px обычно, 60px для трёх символов ("99+"). Инлайновые
 * стили вместо отдельного .css-класса — тот же подход, что уже
 * используется для остальных маркеров карты (el.style.cssText).
 */
function createClusterButton(count: number, onClick: () => void): HTMLButtonElement {
  const label = count > 99 ? "99+" : String(count);
  const isThreeChars = label.length >= 3;
  const size = isThreeChars ? 50 : 42;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-label", `Показать встречи: ${count}`);
  button.style.cssText = `
    box-sizing:border-box;width:${size + 4}px;height:${size + 4}px;border:3px solid #fff;
    border-radius:50%;
    background:#17141F;
    color:#fff;font:600 ${isThreeChars ? 16 : 17}px/1 var(--font-inter),var(--font-onest),Arial,sans-serif;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 10px 22px -10px rgba(23,20,31,0.55);cursor:pointer;padding:0;
    
  `.replace(/\s+/g, " ");
  button.classList.add("mkpop");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/**
 * Подпись над булавкой, как у Invitor: «сейчас», «через 40 мин», «через 2 ч»,
 * «20:30» (сегодня), «завтра 19:00», «5 окт». «Сегодня/завтра» — по времени
 * города встречи, а не телефона.
 */
export function eventTimeLabel(event: MapEventItem, now: Date = new Date()): { text: string; live: boolean } {
  if (!event.startsAt) return { text: event.eventTime.slice(0, 5), live: false };
  const start = new Date(event.startsAt).getTime();
  const end = event.endsAt ? new Date(event.endsAt).getTime() : start + 2 * 3600_000;
  const t = now.getTime();
  if (t >= start && t < end) return { text: "сейчас", live: true };
  const diffMin = Math.round((start - t) / 60_000);
  if (diffMin > 0 && diffMin < 60) return { text: `через ${Math.max(5, Math.round(diffMin / 5) * 5)} мин`, live: false };
  if (diffMin >= 60 && diffMin < 180) return { text: `через ${Math.round(diffMin / 60)} ч`, live: false };

  const offsetMs = (event.utcOffset ?? 5) * 3600_000;
  const dayOf = (ms: number) => Math.floor((ms + offsetMs) / 86_400_000);
  const days = dayOf(start) - dayOf(t);
  const hhmm = event.eventTime.slice(0, 5);
  if (days <= 0) return { text: hhmm, live: false };
  if (days === 1) return { text: `завтра ${hhmm}`, live: false };
  const local = new Date(start + offsetMs);
  return { text: `${local.getUTCDate()} ${MONTHS_SHORT[local.getUTCMonth()]}`, live: false };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

const PIN = 52; // диаметр белой «капли»
const PHOTO = 44; // фото внутри неё

/**
 * Маркер встречи в стиле Invitor: белая капля-булавка, внутри круглое фото
 * организатора (нет фото — первая буква имени на фирменном градиенте или
 * значок категории), сверху белая «пилюля» со временем. Бизнес-события —
 * с оранжево-фиолетовой обводкой, заполненные — приглушённые.
 */
export function buildEventMarkerElement(event: MapEventItem, onClick: () => void): { el: HTMLElement; offsetY: number } {
  const label = eventTimeLabel(event);
  const isFull = event.seatsLeft <= 0;
  const avatar = event.markerPhoto !== undefined ? event.markerPhoto : event.organizer?.avatarUrl;

  const ring = event.isBusiness
    ? "background:linear-gradient(#fff,#fff) padding-box,linear-gradient(#17141F,#17141F) border-box;border:3px solid transparent;"
    : "background:#fff;border:0;";
  const photoInner = avatar
    ? `<img src="${escapeHtml(avatar)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.replaceWith(Object.assign(document.createElement('img'),{src:'${categoryIcon3d(event)}',style:'width:100%;height:100%;object-fit:contain;padding:5px;box-sizing:border-box;background:#F4F2F8'}))" />`
    : `<img src="${categoryIcon3d(event)}" alt="" style="width:100%;height:100%;object-fit:contain;padding:5px;box-sizing:border-box;display:block;" />`;
  // У метки с фото организатора — значок категории в уголке.
  const badge = avatar && !event.isBusiness
    ? `<div style="position:absolute;right:-6px;bottom:-4px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 3px 8px -2px rgba(60,30,140,.45);display:flex;align-items:center;justify-content:center;"><img src="${categoryIcon3d(event)}" alt="" style="width:19px;height:19px;object-fit:contain;" /></div>`
    : "";

  const pillBg = label.live ? "#ff3b5c" : "#fff";
  const pillColor = label.live ? "#fff" : "#16121f";
  const pillText = isFull ? "мест нет" : label.text;

  const el = document.createElement("div");
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `${event.title}, ${pillText}`);
  el.style.cssText = `display:flex;flex-direction:column;align-items:center;cursor:pointer;${isFull ? "opacity:0.6;filter:grayscale(0.7);" : ""}`;
  el.innerHTML = `
    <div style="margin-bottom:4px;padding:3px 8px;border-radius:999px;background:${pillBg};color:${pillColor};
      font:600 11px/1.2 var(--font-inter),var(--font-onest),Arial,sans-serif;white-space:nowrap;
      box-shadow:0 6px 14px -6px rgba(60,30,140,0.5);">${label.live && !isFull ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#fff;margin-right:4px;vertical-align:1px"></span>' : ""}${escapeHtml(pillText)}</div>
    <div style="position:relative;width:${PIN}px;height:${PIN}px;">
      <div style="position:absolute;inset:0;box-sizing:border-box;${ring}border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        box-shadow:0 10px 18px -8px rgba(60,30,140,0.55);"></div>
      <div style="position:absolute;left:${(PIN - PHOTO) / 2}px;top:${(PIN - PHOTO) / 2}px;width:${PHOTO}px;height:${PHOTO}px;border-radius:50%;overflow:hidden;background:#F4F2F8;">
        ${photoInner}
      </div>
      ${badge}
    </div>`;
  // Появление метки «пружинкой», как у пинов прототипа (анимируем содержимое —
  // transform самого элемента занят позиционированием maplibre).
  Array.from(el.children).forEach((c) => c.classList.add("mkpop"));
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  // Кончик капли (повёрнутый на 45° угол) выступает ниже квадрата на ~0.2 диаметра.
  return { el, offsetY: -Math.round(PIN * 0.2) };
}

/** Each drop pivots at its actual tip; the map marker stays on the saved coordinate. */
function buildAddressMarker(items: MapEventItem[], select: (events: MapEventItem[]) => void) {
  const visible = items.length > 3 ? items.slice(0, 2) : items;
  const el = document.createElement("div");
  el.className = "address-pins";
  const slot = visible.length === 3 ? 48 : 60;
  el.style.width = `${visible.length * slot}px`;
  if (items.length > visible.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "address-more";
    more.textContent = `+${items.length - visible.length}`;
    more.setAttribute("aria-label", `Все события по адресу: ${items.length}`);
    more.onclick = e => { e.stopPropagation(); select(items); };
    el.append(more);
  }
  const row = document.createElement("div");
  row.className = "address-heads";
  visible.forEach((event, i) => {
    const { el: pin } = buildEventMarkerElement(event, () => select([event]));
    const label = pin.firstElementChild!;
    const drop = pin.lastElementChild as HTMLElement;
    const angle = (i - (visible.length - 1) / 2) * (visible.length === 2 ? 88 : 60);
    const tip = PIN * (Math.sqrt(2) - 1) / 2;
    drop.classList.remove("mkpop");
    Object.assign(drop.style, { position: "absolute", bottom: tip+"px", left: "50%", pointerEvents: "none",
      transformOrigin: `50% calc(100% + ${tip}px)`, transform: `translateX(-50%) rotate(${angle}deg)` });
    const image = drop.querySelector("img");
    if (image) image.style.transform = `rotate(${-angle}deg)`;
    const hit = document.createElement("button");
    hit.type = "button";
    hit.className = "address-hit";
    hit.setAttribute("aria-label", event.title);
    hit.append(label);
    hit.onclick = e => { e.stopPropagation(); select([event]); };
    row.append(drop, hit);
  });
  el.append(row);
  return { el, offsetY: 0 };
}

export const EventsMap = forwardRef<EventsMapHandle, EventsMapProps>(function EventsMap(
  { events, onSelect, city },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<{ Marker: new (o: { element: HTMLElement; anchor?: string }) => MapLibreMarker } | null>(null);
  const meMarkerRef = useRef<MapLibreMarker | null>(null);

  useImperativeHandle(ref, () => ({
    zoomIn() {
      mapRef.current?.zoomIn();
    },
    zoomOut() {
      mapRef.current?.zoomOut();
    },
    fitBounds(points) {
      const map = mapRef.current;
      if (!map || points.length === 0) return;
      if (points.length === 1) {
        const only = points.find(() => true);
        if (only) map.flyTo({ center: only, zoom: 16 });
        return;
      }
      const lngs = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 60, maxZoom: 18 }
      );
    },
    locate() {
      return new Promise<boolean>((resolve) => {
        const map = mapRef.current;
        if (!map || !navigator.geolocation) return resolve(false);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const point: LngLat = [pos.coords.longitude, pos.coords.latitude];
            meMarkerRef.current?.remove();
            const lib = libRef.current;
            if (lib) {
              // Точка «я здесь» как в прототипе (.me-dot): фиолетовая с расходящейся волной.
              const dot = document.createElement("div");
              dot.className = "me-dot";
              dot.style.position = "absolute";
              meMarkerRef.current = new lib.Marker({ element: dot, anchor: "center" }).setLngLat(point).addTo(map);
            }
            map.flyTo({ center: point, zoom: 15 });
            resolve(true);
          },
          () => resolve(false),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      });
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    const container = containerRef.current;
    if (!container) return;

    async function setup() {
      const center: LngLat =
        events.length > 0
          ? [
              events.reduce((sum, e) => sum + e.longitude, 0) / events.length,
              events.reduce((sum, e) => sum + e.latitude, 0) / events.length,
            ]
          : city
            ? await geocodeCityCenter(city)
            : DEFAULT_CENTER;
      if (cancelled || !container) return;

      const created = await createMap(container, { center, zoom: 12, style: "positron" });
      if (cancelled) {
        created.map.remove();
        return;
      }
      const { maplibregl } = created;
      libRef.current = maplibregl;
      map = created.map;
      mapRef.current = map;
      const activeMap = map;

      if (events.length === 0) return;

      const locations = groupLocations(events, city);
      const locationsById = new Map(locations.flatMap(location => location.items.map(event => [event.id, location] as const)));
      const eventsById = new Map(events.map(event => [event.id, event]));
      const geojson = {
        type: "FeatureCollection",
        features: locations.flatMap(location => location.items.map(event => ({
          type: "Feature",
          properties: { id: event.id },
          geometry: { type: "Point", coordinates: [location.lng, location.lat] },
        }))),
      };

      // HTML-маркеры (наши 3D-пины и кружки-счётчики) поверх кластеров,
      // которые считает сама карта. Ключ — id встречи или id кластера.
      const markers = new Map<string, MapLibreMarker>();

      function syncMarkers() {
        const seen = new Set<string>();
        for (const feature of activeMap.querySourceFeatures("events")) {
          const props = feature.properties ?? {};
          const coords = feature.geometry.coordinates as LngLat;
          if (props.cluster) {
            const clusterId = Number(props.cluster_id);
            const key = `c${clusterId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (markers.has(key)) continue;
            const count = Number(props.point_count);
            const button = createClusterButton(count, () => {
              const source = activeMap.getSource("events") as {
                getClusterLeaves: (id: number, limit: number, offset: number) => Promise<Array<{ properties: { id: string } }>>;
              };
              source
                .getClusterLeaves(clusterId, Infinity, 0)
                .then((leaves) => {
                  const list = leaves.map((l) => eventsById.get(l.properties.id)).filter((e): e is MapEventItem => !!e);
                  if (cancelled || !list.length) return;
                  onSelectRef.current(list);
                  const first = locationsById.get(list[0]!.id);
                  if (!first) return;
                  const oneAddress = list.every(e => locationsById.get(e.id) === first);
                  activeMap.flyTo({ center: oneAddress ? [first.lng, first.lat] : coords, zoom: oneAddress ? ADDRESS_ZOOM : Math.min(ADDRESS_ZOOM, activeMap.getZoom() + 2) });
                })
                .catch(() => {});
            });
            const marker = new maplibregl.Marker({ element: button, anchor: "center" }).setLngLat(coords).addTo(activeMap);
            markers.set(key, marker);
          } else {
            const id = String(props.id);
            const location = locationsById.get(id);
            if (!location) continue;
            const key = "address:" + location.id;
            if (seen.has(key)) continue;
            seen.add(key);
            if (markers.has(key)) continue;
            const single = location.items[0]!;
            const { el, offsetY } = location.items.length === 1
              ? buildEventMarkerElement(single, () => onSelectRef.current([single]))
              : buildAddressMarker(location.items, items => onSelectRef.current(items));
            const marker = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, offsetY] })
              .setLngLat([location.lng, location.lat]).addTo(activeMap);
            markers.set(key, marker);
          }
        }
        for (const [key, marker] of markers) {
          if (!seen.has(key)) {
            marker.remove();
            markers.delete(key);
          }
        }
      }

      activeMap.on("load", () => {
        if (cancelled) return;
        activeMap.addSource("events", {
          type: "geojson",
          data: geojson,
          cluster: true,
          // По умолчанию источник считает тайлы только до 18-го масштаба — выше
          // кластеры не пересчитываются и метки слипаются. Считаем до 22-го.
          maxzoom: 22,
          clusterRadius: CLUSTER_RADIUS,
          clusterMaxZoom: ADDRESS_ZOOM - 1,
        });
        // Невидимый слой — без него карта не отдаёт точки источника
        // (querySourceFeatures), а рисуем мы их сами HTML-маркерами.
        activeMap.addLayer({
          id: "events-hidden",
          type: "circle",
          source: "events",
          paint: { "circle-radius": 1, "circle-opacity": 0 },
        });
        activeMap.on("data", (e: unknown) => {
          const ev = e as { sourceId?: string; isSourceLoaded?: boolean };
          if (ev.sourceId === "events" && ev.isSourceLoaded) syncMarkers();
        });
        activeMap.on("moveend", syncMarkers);
      });
    }

    setup().catch((err) => console.error("EventsMap: не удалось загрузить карту", err));

    return () => {
      cancelled = true;
      mapRef.current = null;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, city]);

  return <div ref={containerRef} className="h-full w-full" />;
});

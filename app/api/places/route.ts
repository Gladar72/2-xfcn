import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/places?category=cinema&q=пр&city=Тюмень
 *
 * Подсказки мест для шага «Где?» мастера создания встречи:
 * 1) Поиск по организациям Яндекса (кинотеатры для «Кино», кофейни для
 *    «Кофе» и т.д.) — если задан ключ YANDEX_PLACES_API_KEY
 *    («API Поиска по организациям» в кабинете разработчика Яндекса).
 * 2) Места, где в этом городе уже проходили встречи этой категории, —
 *    работает всегда, без ключа. Чем чаще место выбирали, тем выше.
 * Ответ: { items: [{ name, address, latitude, longitude, source }] }.
 */
const QUERY_BY_CATEGORY: Record<string, string> = {
  cinema: "кинотеатр",
  coffee: "кофейня",
  breakfast: "завтраки кафе",
  dinner: "ресторан",
  walk: "парк",
  training: "фитнес",
  active: "активный отдых",
  party: "бар",
};
const QUERY_BY_TRAINING: Record<string, string> = {
  running: "стадион",
  padel: "падел",
  gym: "фитнес-клуб",
  hyrox: "фитнес-клуб",
  football: "футбольное поле",
  cycling: "велодорожка",
  yoga: "йога студия",
};

interface Place {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  source: "yandex" | "history";
}

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const category = sp.get("category") ?? "";
  const trainingType = sp.get("type") ?? "";
  const q = (sp.get("q") ?? "").trim();
  const admin = createAdminClient();

  let city = sp.get("city") ?? "";
  if (!city) {
    const { data: me } = await admin.from("users").select("city").eq("id", currentUser.userId).maybeSingle();
    city = (me?.city as string | undefined) ?? "Тюмень";
  }

  const [yandex, history] = await Promise.all([
    searchYandex(q || QUERY_BY_TRAINING[trainingType] || QUERY_BY_CATEGORY[category] || "", city),
    searchHistory(admin, category, city, q),
  ]);

  // Склеиваем без повторов (по названию), яндекс первым.
  const seen = new Set<string>();
  const items = [...yandex, ...history].filter((p) => {
    const k = p.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return NextResponse.json({ items: items.slice(0, 8) });
}

async function searchYandex(text: string, city: string): Promise<Place[]> {
  const key = process.env.YANDEX_PLACES_API_KEY;
  if (!key || !text) return [];
  try {
    const url = `https://search-maps.yandex.ru/v1/?apikey=${key}&text=${encodeURIComponent(`${text}, ${city}`)}&type=biz&lang=ru_RU&results=8`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: { geometry?: { coordinates?: [number, number] }; properties?: { name?: string; CompanyMetaData?: { address?: string } } }[];
    };
    return (data.features ?? [])
      .map((f) => {
        const c = f.geometry?.coordinates;
        const name = f.properties?.name;
        if (!c || !name) return null;
        return {
          name,
          address: f.properties?.CompanyMetaData?.address ?? "",
          longitude: c[0],
          latitude: c[1],
          source: "yandex" as const,
        };
      })
      .filter((p): p is Place => !!p);
  } catch {
    return [];
  }
}

async function searchHistory(admin: ReturnType<typeof createAdminClient>, category: string, city: string, q: string): Promise<Place[]> {
  let query = admin
    .from("events")
    .select("place_name, address, latitude, longitude, categories!inner(slug)")
    .eq("city", city)
    .not("place_name", "is", null)
    .not("latitude", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (category) query = query.eq("categories.slug", category);
  if (q.length >= 2) query = query.ilike("place_name", `%${q}%`);
  const { data } = await query;

  const counts = new Map<string, { p: Place; n: number }>();
  for (const r of data ?? []) {
    const name = ((r.place_name as string | null) ?? "").trim();
    if (!name || r.latitude == null || r.longitude == null) continue;
    const k = name.toLowerCase();
    const cur = counts.get(k);
    if (cur) cur.n++;
    else
      counts.set(k, {
        p: {
          name,
          address: ((r.address as string | null) ?? "").replace(/^Россия,\s*/, ""),
          latitude: r.latitude as number,
          longitude: r.longitude as number,
          source: "history",
        },
        n: 1,
      });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).map((x) => x.p);
}

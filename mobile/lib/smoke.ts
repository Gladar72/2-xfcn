// Тестовая сборка для снимков экранов на эмуляторе (EXPO_PUBLIC_UI_SMOKE=1, не для магазина):
// вместо сервера — готовые данные, как в прототипе. Так видно весь дизайн без входа.
import { API_URL } from "./config";

export const UI_SMOKE = process.env.EXPO_PUBLIC_UI_SMOKE === "1";

const C = (n: string) => `${API_URL}/brand/covers/${n}.webp`;
const day = (d: number) => {
  const t = new Date(Date.now() + d * 864e5);
  return t.toISOString().slice(0, 10);
};
const org = (id: string, name: string, age: number, avatar: string | null, gender = "male") => ({
  id,
  name,
  age,
  gender,
  avatarUrl: avatar,
  ratingAvg: 4.9,
  completedMeetingsCount: 23,
});
const cat = (slug: string, name: string) => ({ slug, name, emoji: null });

const base = {
  description: null,
  city: "Тюмень",
  address: null,
  eventEndTime: null,
  costType: "each_self",
  isBusiness: false,
  isHighlighted: false,
  isMine: false,
  myApplicationStatus: null,
  trainingType: null,
};

export const SMOKE_EVENTS = [
  { ...base, id: "e1", title: "Пробежка на рассвете", category: cat("training", "Тренировка"), trainingType: cat("running", "Бег"), placeName: "Набережная Туры", eventDate: day(1), eventTime: "08:00:00", seatsTotal: 9, seatsTaken: 2, photoUrl: C("run01"), organizer: org("u1", "Олег", 31, C("run05")), isBoosted: true, distanceM: 1400 },
  { ...base, id: "e2", title: "Кино вечером", category: cat("cinema", "Кино"), placeName: "Киномакс", eventDate: day(0), eventTime: "21:00:00", seatsTotal: 1, seatsTaken: 0, photoUrl: C("cin02"), organizer: org("u2", "Аня", 26, null, "female"), isAnonymous: true, organizerHidden: true },
  { ...base, id: "e3", title: "Кофе и разговоры", category: cat("coffee", "Кофе"), placeName: "Кофемания", eventDate: day(1), eventTime: "19:00:00", seatsTotal: 3, seatsTaken: 1, photoUrl: C("cof03"), organizer: org("u3", "Даша", 27, C("cof05"), "female") },
  { ...base, id: "e4", title: "Ужин в новом месте", category: cat("dinner", "Ужин"), placeName: "Ola Ola", eventDate: day(2), eventTime: "20:00:00", seatsTotal: 5, seatsTaken: 3, photoUrl: C("din04"), organizer: org("u4", "Макс", 29, C("din02")) },
  { ...base, id: "e5", title: "Hyrox для новичков", category: cat("training", "Тренировка"), trainingType: cat("hyrox", "Hyrox"), placeName: "FORMA", eventDate: day(3), eventTime: "10:00:00", seatsTotal: 7, seatsTaken: 4, photoUrl: C("hyr03"), organizer: org("u5", "Игорь", 33, C("hyr05")) },
];

const BIZ = [
  { ...base, id: "b1", title: "Вечеринка FORMA", isBusiness: true, category: cat("party", "Вечеринка"), placeName: "FORMA lounge", eventDate: day(0), eventTime: "23:00:00", seatsTotal: 200, seatsTaken: 88, photoUrl: C("party"), organizer: org("v1", "FORMA lounge", 0, null), isLive: true, businessPricingType: "ticket", businessPricingDetails: "1 500 ₽" },
  { ...base, id: "b2", title: "Квиз «Мозгобойня»", isBusiness: true, category: cat("party", "Квиз"), placeName: "Бар «Кислород»", eventDate: day(1), eventTime: "19:30:00", seatsTotal: 60, seatsTaken: 31, photoUrl: C("bar"), organizer: org("v2", "Кислород", 0, null), businessPricingType: "ticket", businessPricingDetails: "400 ₽" },
];

const PEOPLE = [
  { id: "p1", name: "Даша", age: 27, avatarUrl: C("cof05"), sharedInterests: ["Бег", "Кофе"], sharedCount: 2, distanceM: 900 },
  { id: "p2", name: "Олег", age: 31, avatarUrl: C("run05"), sharedInterests: ["Бег"], sharedCount: 1, distanceM: 2100 },
  { id: "p3", name: "Макс", age: 29, avatarUrl: C("din02"), sharedInterests: ["Кино", "Ужины"], sharedCount: 2, distanceM: 3400 },
];

const PROFILE = {
  id: "me",
  name: "Андрей",
  avatarUrl: C("gym05"),
  age: 32,
  city: "Тюмень",
  bio: "Бегаю по утрам, люблю кофе и новые места. Ищу компанию на выходные.",
  ratingAvg: 4.9,
  ratingCount: 18,
  completedMeetingsCount: 23,
  eventsOrganizedCount: 7,
  eventsAttendedCount: 16,
  phone: null,
  email: null,
  photos: [C("gym05"), C("run02"), C("cof07")],
  interests: [{ id: "i1", name: "Бег" }, { id: "i2", name: "Кофе" }, { id: "i3", name: "Кино" }, { id: "i4", name: "Путешествия" }],
  memberSince: "2026-10-01",
};

const DETAIL = {
  ...SMOKE_EVENTS[0],
  description: "5 км в спокойном темпе вдоль Туры, потом кофе. Новичкам — welcome, подождём всех.",
  address: "Набережная Туры, у Моста влюблённых",
  startsAt: `${day(1)}T03:00:00Z`,
  endsAt: `${day(1)}T04:30:00Z`,
  latitude: 57.1612,
  longitude: 65.5326,
  status: "published",
  hasChat: true,
  participants: [
    { id: "p1", name: "Даша", avatarUrl: C("cof05") },
    { id: "p3", name: "Макс", avatarUrl: C("din02") },
  ],
  viewerStatus: "none",
  goingCount: 3,
};

// Точки разбросаны по всей Тюмени — как живой город, а не одна кучка.
const SPOTS: [number, number][] = [
  [57.1612, 65.5326], [57.1505, 65.5602], [57.1688, 65.5011], [57.1413, 65.5244], [57.1297, 65.5689],
  [57.1801, 65.5482], [57.1466, 65.4783], [57.1577, 65.6013], [57.1219, 65.5157], [57.1742, 65.5865],
  [57.1372, 65.5953], [57.1885, 65.5192],
];
const MAP = SPOTS.map(([lat, lon], i) => {
  const e = SMOKE_EVENTS[i % SMOKE_EVENTS.length]!;
  return {
    id: i < SMOKE_EVENTS.length ? e.id : `${e.id}-${i}`,
    title: e.title,
    latitude: lat,
    longitude: lon,
    startsAt: `${e.eventDate}T${e.eventTime.slice(0, 5)}:00+05:00`,
    endsAt: `${e.eventDate}T23:00:00+05:00`,
    seatsLeft: e.seatsTotal - e.seatsTaken,
    isBusiness: false,
    placeName: e.placeName,
    organizer: { name: e.organizer.name, avatarUrl: e.organizer.avatarUrl },
    markerPhoto: [C("run01"), C("cin02"), C("cof03"), C("din04"), C("hyr03"), C("party"), C("bar"), C("walk"), C("active"), C("cof05"), C("run05"), C("din02")][i],
    category: e.category,
  };
});

const now = Date.now();
const CHATS = [
  { conversationId: "c1", eventId: "e1", eventTitle: "Пробежка на рассвете", eventStatus: "upcoming", eventPhotoUrl: C("run01"), otherUser: null, otherMembersCount: 3, unreadCount: 2, lastMessage: { content: "Встречаемся у моста в 7:55 👋", createdAt: new Date(now - 6e5).toISOString(), isMine: false, senderName: "Олег" } },
  { conversationId: "c3", eventId: "e3", eventTitle: "Кофе и разговоры", eventStatus: "upcoming", eventPhotoUrl: C("cof03"), otherUser: null, otherMembersCount: 2, unreadCount: 0, lastMessage: { content: "Я заняла столик у окна", createdAt: new Date(now - 36e5).toISOString(), isMine: false, senderName: "Даша" } },
  { conversationId: "c4", eventId: "e4", eventTitle: "Ужин в новом месте", eventStatus: "upcoming", eventPhotoUrl: C("din04"), otherUser: null, otherMembersCount: 4, unreadCount: 0, lastMessage: { content: "Столик на 20:00 забронировал", createdAt: new Date(now - 864e5).toISOString(), isMine: true, senderName: null } },
  { conversationId: "c2", eventId: null, eventTitle: null, eventStatus: null, eventPhotoUrl: null, otherUser: { id: "p1", name: "Даша", avatarUrl: C("cof05") }, otherMembersCount: 1, unreadCount: 0, lastMessage: { content: "А после — кофе?", createdAt: new Date(now - 72e5).toISOString(), isMine: false, senderName: "Даша" } },
];

/** Ответ «сервера» для тестовой сборки. */
export function smokeApi(path: string): unknown {
  const p = path.split("?")[0] ?? "";
  if (p === "/api/me/profile" || p === "/api/me") return PROFILE;
  if (p === "/api/categories")
    return {
      categories: [cat("coffee", "Кофе"), cat("training", "Тренировка"), cat("cinema", "Кино"), cat("breakfast", "Завтрак"), cat("dinner", "Ужин"), cat("walk", "Прогулка"), cat("active", "Активный отдых"), cat("party", "Вечеринка")],
      trainingTypes: [cat("running", "Бег"), cat("gym", "Зал"), cat("yoga", "Йога"), cat("cycling", "Велосипед"), cat("football", "Футбол"), cat("padel", "Падел"), cat("hyrox", "Hyrox")],
    };
  if (p.startsWith("/api/users/")) {
    const x = PEOPLE.find((u) => p.endsWith(u.id)) ?? PEOPLE[0]!;
    return { id: x.id, name: x.name, age: x.age, gender: "female", avatarUrl: x.avatarUrl, photos: [x.avatarUrl, C("cof07"), C("run02")], canMessage: true, bio: "Люблю утренние пробежки и хороший кофе. Ищу компанию на выходные.", ratingAvg: 4.9, completedMeetingsCount: 12, distanceKm: 0.9, interests: ["Бег", "Кофе", "Кино", "Путешествия"], commonInterests: x.sharedInterests };
  }
  if (p === "/api/people") return { items: PEOPLE, meHasLocation: true };
  if (p === "/api/events/map") return { items: MAP, city: "Тюмень" };
  if (p === "/api/events") return { items: path.includes("business=true") ? BIZ : SMOKE_EVENTS };
  if (p.startsWith("/api/events/")) return DETAIL;
  if (p === "/api/city-events") return { items: [] };
  if (p === "/api/conversations") return { items: CHATS };
  if (p === "/api/notifications") return { items: [] };
  if (p === "/api/subscriptions") return { active: true, plan: "start", periodEnd: `${day(30)}T00:00:00Z`, currentPeriodEnd: day(30) };
  if (p === "/api/me/pending-applications") return { count: 0, latest: null };
  return { items: [] };
}

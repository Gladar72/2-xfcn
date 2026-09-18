import { z } from "zod";

export const createEventSchema = z.object({
  // Для обычной встречи — обязательна. Для "Для бизнеса" (isBusiness=true)
  // категорий из готового списка нет вообще — не требуем её на схеме,
  // сервер сам подставит служебную категорию для таких событий.
  categorySlug: z.string().optional().default(""),
  trainingTypeSlug: z.string().optional(),

  placeName: z.string().trim().min(2, "Укажи место").max(120),
  address: z.string().trim().max(200).optional().default(""),
  latitude: z.number().optional(),
  longitude: z.number().optional(),

  eventDate: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Некорректная дата"),
  eventTime: z.string().regex(/^\d{2}:\d{2}$/, "Некорректное время"),
  eventEndTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Некорректное время")
    .optional(),

  // Верхняя граница здесь — просто защита от абсурдных значений (опечатка
  // в лишний ноль и т.п.). Настоящий потолок по тарифу (обычный groupMax
  // или расширенный businessGroupMax для "Для бизнеса") проверяется ОТДЕЛЬНО
  // в самом обработчике — см. maxGroupSize() в lib/subscriptions/limits.ts.
  seatsTotal: z.number().int().min(1, "Минимум 1 участник").max(2000, "Слишком много участников"),

  costType: z.enum(["each_pays", "organizer_treats", "free", "negotiable"]).default("each_pays"),

  title: z.string().trim().min(3, "Слишком коротко").max(100),
  description: z.string().trim().max(500).optional().default(""),

  // --- "Для бизнеса" (см. ТЗ пользователя) ---
  isBusiness: z.boolean().optional().default(false),
  businessPricingType: z.enum(["ticket", "free", "custom"]).optional(),
  businessPricingDetails: z.string().trim().max(300).optional(),
  // Чат — явный выбор организатора, но только когда группа маленькая
  // (<=20) — серверная проверка этого условия в обработчике, не только на схеме.
  hasChat: z.boolean().optional().default(true),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;


import { z } from "zod";

export const createEventSchema = z.object({
  categorySlug: z.string().min(1),
  trainingTypeSlug: z.string().optional(),

  placeName: z.string().trim().min(2, "Укажи место").max(120),
  address: z.string().trim().max(200).optional().default(""),
  latitude: z.number().optional(),
  longitude: z.number().optional(),

  eventDate: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Некорректная дата"),
  eventTime: z.string().regex(/^\d{2}:\d{2}$/, "Некорректное время"),

  seatsTotal: z.number().int().min(1, "Минимум 1 участник").max(30, "Максимум 30 участников"),

  title: z.string().trim().min(3, "Слишком коротко").max(100),
  description: z.string().trim().max(500).optional().default(""),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

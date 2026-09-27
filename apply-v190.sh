mkdir -p "lib/validation"
cat > "lib/validation/create-event.ts" << 'ENDOFFILE'
import { z } from "zod";
import { getCityUtcOffset } from "@/lib/data/city-timezones";

export const createEventSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    categorySlug: z.string().min(1),
    trainingTypeSlug: z.string().optional(),
    city: z.string().min(1),
    placeName: z.string().optional(),
    address: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Некорректная дата"),
    eventTime: z.string().regex(/^\d{2}:\d{2}$/, "Некорректное время"),
    eventEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    seatsTotal: z.number().int().min(2).max(100),
    costType: z.enum(["each_pays", "organizer_treats", "free", "negotiable"]).optional(),
    isBusiness: z.boolean().optional().default(false),
    hasChat: z.boolean().optional().default(true),
    businessPricingType: z.enum(["ticket", "free", "custom"]).optional(),
    businessPricingDetails: z.string().optional(),
    businessCustomTerms: z.string().optional(),
    // Одна фотография события — обязательна для "Для бизнеса" и для "Своё
    // предложение" (categorySlug="custom"), а для остальных готовых
    // категорий (кино/прогулка/тренировка и т.п.) — нет (см. явное
    // уточнение пользователя). Проверяется ниже через superRefine, а не
    // .min(1) прямо здесь, т.к. обязательность зависит от категории.
    photoBase64: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.isBusiness || data.categorySlug === "custom") && !data.photoBase64) {
      ctx.addIssue({ code: "custom", path: ["photoBase64"], message: "Фото обязательно для события" });
    }
    if (data.businessPricingType === "custom" && !data.businessCustomTerms?.trim()) {
      ctx.addIssue({ code: "custom", path: ["businessCustomTerms"], message: "Опишите условия участия" });
    }

    // Событие не может начинаться в прошлом — иначе оно тут же становится
    // "завершённым" фоновой задачей и просто не появляется в ленте, без
    // какого-либо объяснения пользователю (реальный найденный случай).
    // Дата+время указаны в местном времени города события — переводим в
    // UTC тем же способом, что и в планировщике утренних напоминаний,
    // прежде чем сравнивать с текущим моментом.
    const offsetHours = getCityUtcOffset(data.city);
    const [year, month, day] = data.eventDate.split("-").map(Number);
    const [hour, minute] = data.eventTime.split(":").map(Number);
    const eventUtcMs = Date.UTC(year, month - 1, day, hour - offsetHours, minute);
    if (eventUtcMs <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["eventTime"],
        message: "Дата и время встречи уже прошли — выберите другое время",
      });
    }
  });

export type CreateEventInput = z.infer<typeof createEventSchema>;
ENDOFFILE

import { z } from "zod";
import { getCityUtcOffset } from "@/lib/data/city-timezones";

// Все сообщения — по-русски: первое из них сервер отдаёт человеку как есть
// (см. describeValidationError), чтобы было понятно, что именно исправить.
export const createEventSchema = z
  .object({
    title: z
      .string({ invalid_type_error: "Добавь название встречи" })
      .trim()
      .min(1, "Добавь название встречи")
      .max(120, "Название слишком длинное — максимум 120 символов")
      .optional(),
    description: z.string().max(1000, "Описание слишком длинное — максимум 1000 символов").optional(),
    // Для «Для бизнеса» категорию не выбирают — сервер подставит служебную.
    categorySlug: z.string().optional().default(""),
    trainingTypeSlug: z.string().optional(),
    // Город берётся из профиля организатора на сервере (клиент его не шлёт).
    city: z.string({ required_error: "Укажи город в профиле" }).min(1, "Укажи город в профиле"),
    placeName: z.string().max(120, "Название места слишком длинное — максимум 120 символов").optional(),
    address: z.string().max(300, "Адрес слишком длинный").optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    eventDate: z
      .string({ required_error: "Выбери дату встречи" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Выбери дату встречи"),
    eventTime: z
      .string({ required_error: "Укажи время начала" })
      .regex(/^\d{2}:\d{2}$/, "Укажи время начала"),
    eventEndTime: z.string().regex(/^\d{2}:\d{2}$/, "Укажи время окончания").optional(),
    seatsTotal: z
      .number({ required_error: "Укажи, сколько нужно участников", invalid_type_error: "Укажи, сколько нужно участников" })
      .int("Количество участников — целое число")
      .min(1, "Нужен хотя бы 1 участник кроме тебя")
      .max(500, "Слишком много участников — максимум 500"),
    costType: z
      .enum(["each_pays", "organizer_treats", "free", "negotiable"], {
        errorMap: () => ({ message: "Выбери, кто платит за встречу" }),
      })
      .optional(),
    isBusiness: z.boolean().optional().default(false),
    hasChat: z.boolean().optional().default(true),
    // Анонимная встреча: организатор и точный адрес скрыты до одобрения заявки.
    isAnonymous: z.boolean().optional().default(false),
    businessPricingType: z
      .enum(["ticket", "free", "custom"], { errorMap: () => ({ message: "Выбери условия участия" }) })
      .optional(),
    businessPricingDetails: z.string().max(300, "Условия слишком длинные — максимум 300 символов").optional(),
    businessCustomTerms: z.string().optional(),
    // Одна фотография события — обязательна для "Для бизнеса" и для "Своё
    // предложение" (categorySlug="custom"), а для остальных готовых
    // категорий (кино/прогулка/тренировка и т.п.) — нет (см. явное
    // уточнение пользователя). Проверяется ниже через superRefine, а не
    // .min(1) прямо здесь, т.к. обязательность зависит от категории.
    photoBase64: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.isBusiness && !data.categorySlug) {
      ctx.addIssue({ code: "custom", path: ["categorySlug"], message: "Выбери категорию встречи" });
    }
    if (data.isBusiness && data.isAnonymous) {
      ctx.addIssue({ code: "custom", path: ["isAnonymous"], message: "Событие для бизнеса не может быть анонимным" });
    }
    if (!data.isBusiness && data.seatsTotal > 30) {
      ctx.addIssue({ code: "custom", path: ["seatsTotal"], message: "В обычной встрече — максимум 30 участников" });
    }
    if ((data.isBusiness || data.categorySlug === "custom") && !data.photoBase64) {
      ctx.addIssue({ code: "custom", path: ["photoBase64"], message: "Добавь фото — для этого типа встречи оно обязательно" });
    }
    // Мастер присылает свои условия в businessPricingDetails (отдельного
    // businessCustomTerms он не шлёт) — раньше из-за этого «Свои условия»
    // у бизнес-встречи никогда не проходили проверку.
    if (
      data.businessPricingType === "custom" &&
      !(data.businessCustomTerms ?? data.businessPricingDetails ?? "").trim()
    ) {
      ctx.addIssue({ code: "custom", path: ["businessCustomTerms"], message: "Опиши условия участия" });
    }
    if (data.businessPricingType === "ticket" && !(data.businessPricingDetails ?? "").trim()) {
      ctx.addIssue({ code: "custom", path: ["businessPricingDetails"], message: "Укажи цену билета" });
    }

    // Событие не может начинаться в прошлом — иначе оно тут же становится
    // "завершённым" фоновой задачей и просто не появляется в ленте, без
    // какого-либо объяснения пользователю (реальный найденный случай).
    // Дата+время указаны в местном времени города события — переводим в
    // UTC тем же способом, что и в планировщике утренних напоминаний,
    // прежде чем сравнивать с текущим моментом. Regex выше уже
    // гарантирует формат ДДДД-ММ-ДД / ЧЧ:ММ, поэтому после split здесь
    // ровно нужное число частей — приводим типы через Number(... ?? "").
    const offsetHours = getCityUtcOffset(data.city);
    const dateParts = data.eventDate.split("-");
    const timeParts = data.eventTime.split(":");
    const year = Number(dateParts[0]);
    const month = Number(dateParts[1]);
    const day = Number(dateParts[2]);
    const hour = Number(timeParts[0]);
    const minute = Number(timeParts[1]);
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

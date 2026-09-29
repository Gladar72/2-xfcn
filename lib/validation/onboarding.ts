import { z } from "zod";

/**
 * Проверка возраста 18+ на дату отправки формы. Дублирует check-constraint
 * в БД (users_18_plus, миграция 0002) — БД это последний рубеж, а это
 * первый, чтобы пользователь увидел понятную ошибку сразу в форме.
 */
function isAtLeast18(birthDateIso: string, now: Date = new Date()): boolean {
  const birthDate = new Date(birthDateIso);
  if (Number.isNaN(birthDate.getTime())) return false;
  const eighteenYearsAgo = new Date(now);
  eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
  return birthDate <= eighteenYearsAgo;
}

export const onboardingSchema = z.object({
  name: z
    .string({ required_error: "Напиши, как тебя зовут" })
    .trim()
    .min(2, "Имя слишком короткое — минимум 2 буквы")
    .max(60, "Имя слишком длинное — максимум 60 символов"),
  birthDate: z
    .string({ required_error: "Укажи дату рождения" })
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Укажи дату рождения")
    .refine((v) => isAtLeast18(v), "Сервис доступен только пользователям 18+"),
  gender: z.enum(["male", "female"], { errorMap: () => ({ message: "Укажите пол" }) }),
  agreedToTerms: z.literal(true, {
    errorMap: () => ({ message: "Нужно принять условия оферты и политики конфиденциальности" }),
  }),
  city: z
    .string({ required_error: "Выбери город" })
    .trim()
    .min(2, "Выбери город")
    .max(80, "Название города слишком длинное"),
  bio: z.string().trim().max(300, "Рассказ о себе — максимум 300 символов").optional().default(""),
  interestIds: z
    .array(z.string().uuid("Выбери интересы заново"))
    .max(15, "Можно выбрать не больше 15 интересов")
    .default([]),
  // Фото — base64 data URL (data:image/jpeg;base64,...), проверяем размер отдельно на бэкенде.
  photoBase64: z.string().startsWith("data:image/", "Не получилось прочитать фото — выбери его заново").optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

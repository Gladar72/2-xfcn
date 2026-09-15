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
  name: z.string().trim().min(2, "Имя слишком короткое").max(60),
  birthDate: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Некорректная дата")
    .refine((v) => isAtLeast18(v), "Сервис доступен только пользователям 18+"),
  gender: z.enum(["male", "female"], { errorMap: () => ({ message: "Укажите пол" }) }),
  city: z.string().trim().min(2, "Укажите город").max(80),
  bio: z.string().trim().max(300).optional().default(""),
  interestIds: z.array(z.string().uuid()).max(15).default([]),
  // Фото — base64 data URL (data:image/jpeg;base64,...), проверяем размер отдельно на бэкенде.
  photoBase64: z.string().startsWith("data:image/", "Ожидается изображение").optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

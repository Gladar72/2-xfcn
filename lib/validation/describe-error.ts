import type { ZodError } from "zod";

/**
 * Первая ошибка проверки формы — в виде, который можно показать человеку:
 * какое поле и что с ним не так («В событии должно быть минимум 2
 * участника»). Раньше сервер отдавал только код validation_failed, и в
 * приложении человек видел общее «Не получилось» без объяснения причины.
 */
export function describeValidationError(error: ZodError): { field: string | null; message: string } {
  const issue = error.issues[0];
  const field = issue && issue.path.length > 0 ? String(issue.path[0]) : null;
  // Сообщения в схемах — по-русски; если попалось стандартное английское
  // сообщение zod (поле забыли подписать) — общий понятный текст.
  const message =
    issue?.message && /[а-яё]/i.test(issue.message) ? issue.message : "Проверь, что все поля заполнены правильно.";
  return { field, message };
}

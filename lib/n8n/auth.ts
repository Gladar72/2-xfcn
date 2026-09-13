import { NextRequest } from "next/server";

/**
 * Эндпоинты в app/api/n8n/* вызываются НЕ пользователем, а n8n по расписанию
 * (workflow'ы 4-6 из п.27 ТЗ — напоминания, запрос отзыва, подсказка про буст).
 * Защищаем их отдельным секретом, а не пользовательской сессией.
 */
export function isValidN8nRequest(req: NextRequest): boolean {
  const expected = process.env.N8N_API_KEY;
  if (!expected) return false; // без настроенного ключа доступ закрыт по умолчанию
  return req.headers.get("x-n8n-api-key") === expected;
}

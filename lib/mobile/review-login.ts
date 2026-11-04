/**
 * Вход для проверяющих App Store / RuStore: одна служебная почта с постоянным кодом,
 * без письма. Включается, только если на сервере задан APP_REVIEW_CODE (4 цифры);
 * почта — APP_REVIEW_EMAIL (по умолчанию review@mesto-go.ru). Для всех остальных
 * адресов вход работает как обычно.
 */
export function reviewLogin(): { email: string; code: string } | null {
  const code = (process.env.APP_REVIEW_CODE ?? "").trim();
  if (!/^\d{4}$/.test(code)) return null;
  const email = (process.env.APP_REVIEW_EMAIL ?? "review@mesto-go.ru").trim().toLowerCase();
  return { email, code };
}

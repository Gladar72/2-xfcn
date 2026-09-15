/**
 * Текст уведомления по его типу — используется и на экране "Уведомления"
 * в приложении (app/api/notifications/route.ts), и при отправке того же
 * уведомления в Telegram через бота (lib/telegram/notify.ts) — чтобы
 * формулировка была одна и та же, а не расходилась в двух местах.
 */
export function buildNotificationText(type: string, eventTitle: string | undefined): string {
  const title = eventTitle ? `«${eventTitle}»` : "встречу";
  switch (type) {
    case "new_application":
      return `Новый отклик на ${title}`;
    case "application_accepted":
      return `Тебя приняли на ${title}`;
    case "event_reminder":
      return `Скоро начнётся ${title}`;
    case "review_request":
      return `Оцени, как прошла ${title}`;
    case "boost_suggestion":
      return `Мало откликов на ${title} — можно поднять её в ленте`;
    case "new_message":
      return "Новое сообщение в чате";
    default:
      return "Новое уведомление";
  }
}

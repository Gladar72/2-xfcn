/**
 * Текст уведомления по его типу — используется и на экране "Уведомления"
 * в приложении (app/api/notifications/route.ts), и при отправке того же
 * уведомления в Telegram через бота (lib/telegram/notify.ts) — чтобы
 * формулировка была одна и та же, а не расходилась в двух местах.
 */
export function buildNotificationText(type: string, eventTitle: string | undefined, fromName?: string): string {
  const who = fromName || "Кто-то";
  const title = eventTitle ? `«${eventTitle}»` : "встречу";
  switch (type) {
    case "new_application":
      return `Новый отклик на ${title}`;
    case "application_accepted":
      return `Организатор подтвердил твою заявку на ${title} 🎉 Ты в событии!`;
    case "application_rejected":
      return `Организатор не подтвердил твою заявку на ${title}. Загляни в приложение — там много других встреч.`;
    case "event_reminder":
      return `Скоро начнётся ${title}`;
    case "event_soon":
      return `Встречаемся через 2 часа — ${title}`;
    case "review_request":
      return `Оцени, как прошла ${title}`;
    case "share_nudge":
      return `Пока никто не откликнулся на ${title} — поделись в сторис или в чате`;
    case "heart":
      return `${who} поставил(а) тебе сердечко ❤️ Ответь или позови на встречу`;
    case "heart_mutual":
      return `Взаимное сердечко: ${who} 💜 Самое время позвать на встречу`;
    case "meet_hint":
      return `${who} намекает: хочет с тобой на встречу 👋`;
    case "boost_suggestion":
      return `Мало откликов на ${title} — можно поднять её в ленте`;
    case "subscription_expiring":
      return "Подписка скоро закончится — продли, чтобы не потерять доступ";
    case "subscription_expired":
      return "Подписка закончилась — продли её в разделе «Подписка»";
    case "new_message":
      return "Новое сообщение в чате";
    default:
      return "Новое уведомление";
  }
}

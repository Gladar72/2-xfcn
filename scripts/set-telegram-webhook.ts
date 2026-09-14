/**
 * Запуск: npm run bot:set-webhook
 * Требует в .env.local: TELEGRAM_BOT_TOKEN, APP_URL, (опционально) TELEGRAM_WEBHOOK_SECRET.
 *
 * Одноразовая настройка — сообщает Telegram, куда слать апдейты бота.
 * Нужно перезапускать при каждой смене APP_URL (например, после первого
 * деплоя на Vercel, когда появляется реальный домен).
 */
import "dotenv/config";
import { config } from "dotenv";

// dotenv по умолчанию читает файл .env — а у нас, как принято в Next.js,
// секреты лежат в .env.local. Догружаем его явно поверх.
config({ path: ".env.local" });

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token) throw new Error("Отсутствует TELEGRAM_BOT_TOKEN в .env.local");
  if (!appUrl) throw new Error("Отсутствует APP_URL в .env.local");

  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secretToken || undefined,
      drop_pending_updates: true,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error("❌ Не удалось установить webhook:", data.description);
    process.exit(1);
  }

  console.log("✅ Webhook установлен:", webhookUrl);
}

main();

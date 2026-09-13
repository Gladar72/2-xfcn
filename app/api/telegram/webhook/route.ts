import { webhookCallback } from "grammy";
import { getBot } from "@/lib/telegram/bot";

/**
 * POST /api/telegram/webhook
 *
 * Именно этот адрес нужно указать в BotFather / через setWebhook как webhook
 * бота (см. scripts/set-telegram-webhook.ts). Используем "std/http" —
 * адаптер grammy под стандартные Fetch API Request/Response, которые
 * использует Next.js App Router (см. https://grammy.dev/hosting/vercel и
 * актуальную документацию grammy — свериться перед изменением).
 *
 * secretToken защищает эндпоинт: Telegram присылает его в заголовке
 * X-Telegram-Bot-Api-Secret-Token, мы сверяем с TELEGRAM_WEBHOOK_SECRET.
 */
export const dynamic = "force-dynamic";

function buildHandler() {
  return webhookCallback(getBot(), "std/http", {
    secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
    onTimeout: "return",
    timeoutMilliseconds: 8000,
  });
}

export async function POST(req: Request) {
  try {
    const handler = buildHandler();
    return await handler(req);
  } catch (error) {
    console.error("Telegram webhook error:", error);
    // Всегда отвечаем 200, иначе Telegram будет повторять доставку апдейта до бесконечности.
    return new Response("ok", { status: 200 });
  }
}

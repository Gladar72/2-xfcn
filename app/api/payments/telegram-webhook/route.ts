import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/payments/telegram-webhook
 *
 * ЗАГОТОВКА — полноценная реализация на Этапе 25.
 *
 * Контракт (фиксируем сейчас, чтобы не расходиться при реализации):
 * 1. Telegram присылает Update с полем `pre_checkout_query` — на него нужно
 *    ответить `answerPreCheckoutQuery(ok: true)` в течение 10 секунд,
 *    иначе платёж отменяется.
 * 2. После реальной оплаты приходит Update с `message.successful_payment`.
 *    Именно ЭТОТ момент — источник истины (см. п.25 ТЗ: "не доверять
 *    client-side подтверждению оплаты").
 * 3. В `successful_payment.invoice_payload` лежит JSON вида
 *    { userId, plan } — тот же payload, что мы передали в
 *    createStarsInvoiceLink (см. lib/telegram/bot-api.ts).
 * 4. По этому payload нужно: записать payments, создать/продлить
 *    subscriptions (status='active', period = now()..now()+30 days),
 *    обнулить/создать subscription_usage на новый период.
 * 5. Этот route должен быть указан как webhook бота (или обрабатываться
 *    внутри общего app/api/telegram/webhook — решить на Этапе 25 в
 *    зависимости от того, как настроен основной webhook бота).
 *
 * Обязательно свериться с актуальной документацией Telegram Bot API
 * перед реализацией: https://core.telegram.org/bots/payments
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json({ error: "not_implemented_yet" }, { status: 501 });
}

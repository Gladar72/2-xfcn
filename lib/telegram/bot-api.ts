/**
 * Минимальный клиент Telegram Bot API — только то, что нужно проекту.
 *
 * ВАЖНО: перед использованием в реальном проекте свериться с актуальной
 * документацией https://core.telegram.org/bots/api — в частности метод
 * createInvoiceLink и формат оплаты через Telegram Stars (currency "XTR")
 * могут получить изменения, которых нет в этом файле.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Отсутствует TELEGRAM_BOT_TOKEN в переменных окружения");
  return token;
}

export interface CreateStarsInvoiceParams {
  title: string;
  description: string;
  /** Произвольная строка — придёт обратно в successful_payment webhook, используем как ссылку на план+пользователя. */
  payload: string;
  /** Сумма в Telegram Stars (целое число, БЕЗ умножения на 100 — в отличие от обычных валют). */
  amountStars: number;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

/**
 * Создаёт ссылку на оплату через Telegram Stars для конкретного плана.
 * provider_token оставляем пустой строкой — так требует Bot API для XTR.
 */
export async function createStarsInvoiceLink(params: CreateStarsInvoiceParams): Promise<string> {
  const token = getBotToken();

  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/createInvoiceLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: params.title,
      description: params.description,
      payload: params.payload,
      provider_token: "",
      currency: "XTR",
      prices: [{ label: params.title, amount: params.amountStars }],
    }),
  });

  const data: TelegramApiResponse<string> = await res.json();
  if (!data.ok || !data.result) {
    throw new Error(`Telegram createInvoiceLink failed: ${data.description ?? "unknown error"}`);
  }
  return data.result;
}

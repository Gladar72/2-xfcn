/**
 * Минимальный клиент для API ЮKassa (https://yookassa.ru/developers/api).
 *
 * Ключи — YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY — берутся из личного
 * кабинета ЮKassa (yookassa.ru → Настройки → API). ВАЖНО: секретный ключ
 * должен оставаться только на сервере (без префикса NEXT_PUBLIC_) — тот же
 * урок, что уже был с ключом Геокодера в этом проекте.
 */

interface CreatePaymentParams {
  userId: string;
  plan: string;
  amountRub: number;
  description: string;
  returnUrl: string;
}

export interface YooKassaPayment {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  metadata: Record<string, string>;
  confirmation?: { confirmation_url?: string };
}

function authHeader(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new Error("Отсутствуют YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY в переменных окружения");
  }
  return "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64");
}

/**
 * Создаёт платёж в ЮKassa и возвращает ссылку для редиректа пользователя
 * на страницу оплаты (карта, СБП и другие способы, включённые в кабинете
 * ЮKassa). Idempotence-Key — обязательный для ЮKassa заголовок, защищает
 * от повторного списания при случайном повторе запроса (например, если
 * ответ потерялся по сети и клиент отправил запрос ещё раз).
 */
export async function createYooKassaPayment(params: CreatePaymentParams): Promise<YooKassaPayment> {
  const idempotenceKey = crypto.randomUUID();

  const res = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: params.amountRub.toFixed(2), currency: "RUB" },
      confirmation: { type: "redirect", return_url: params.returnUrl },
      capture: true,
      description: params.description,
      metadata: { userId: params.userId, plan: params.plan },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ЮKassa: не удалось создать платёж (${res.status}): ${body.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Запрашивает АКТУАЛЬНЫЙ статус платежа напрямую у ЮKassa. Используется в
 * обработчике вебхука вместо доверия телу входящего запроса — тело
 * вебхука в теории можно подделать (отправить фейковый POST на наш
 * публичный эндпоинт), а прямой запрос к API с нашим секретным ключом
 * подделать нельзя.
 */
export async function getYooKassaPayment(paymentId: string): Promise<YooKassaPayment> {
  const res = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ЮKassa: не удалось получить статус платежа ${paymentId} (${res.status}): ${body.slice(0, 300)}`);
  }

  return res.json();
}

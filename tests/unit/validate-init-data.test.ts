import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { validateTelegramInitData } from "@/lib/telegram/validate-init-data";

const BOT_TOKEN = "123456:TEST-fake-bot-token-for-unit-tests";

/**
 * Собирает валидную initData-строку по тому же алгоритму, что и сама
 * проверка — так тест не зависит от реальных данных Telegram и может
 * прогоняться в CI без сети.
 */
function buildSignedInitData(
  fields: Record<string, string>,
  botToken: string = BOT_TOKEN
): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

function baseFields(authDateSeconds: number) {
  return {
    auth_date: String(authDateSeconds),
    user: JSON.stringify({ id: 42, first_name: "Андрей", username: "andrey" }),
    query_id: "AAG1abc",
  };
}

describe("validateTelegramInitData", () => {
  it("принимает корректно подписанные данные", () => {
    const now = new Date();
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const initData = buildSignedInitData(baseFields(nowSeconds));

    const result = validateTelegramInitData(initData, BOT_TOKEN, now);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.user.id).toBe(42);
      expect(result.data.user.username).toBe("andrey");
    }
  });

  it("отклоняет данные с неверной подписью (подделанный hash)", () => {
    const now = new Date();
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const initData = buildSignedInitData(baseFields(nowSeconds));
    const tampered = initData.replace(/hash=[a-f0-9]+/, "hash=" + "0".repeat(64));

    const result = validateTelegramInitData(tampered, BOT_TOKEN, now);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_signature");
  });

  it("отклоняет данные, подписанные другим (неверным) токеном бота", () => {
    const now = new Date();
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const initData = buildSignedInitData(baseFields(nowSeconds), "999:another-bot-token");

    const result = validateTelegramInitData(initData, BOT_TOKEN, now);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_signature");
  });

  it("отклоняет просроченную initData (auth_date старше 24 часов)", () => {
    const now = new Date();
    const oldSeconds = Math.floor(now.getTime() / 1000) - 25 * 60 * 60;
    const initData = buildSignedInitData(baseFields(oldSeconds));

    const result = validateTelegramInitData(initData, BOT_TOKEN, now);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("отклоняет данные без поля hash", () => {
    const params = new URLSearchParams(baseFields(Math.floor(Date.now() / 1000)));
    const result = validateTelegramInitData(params.toString(), BOT_TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_hash");
  });

  it("отклоняет данные без поля user", () => {
    const now = new Date();
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const fields = { auth_date: String(nowSeconds), query_id: "AAG1abc" };
    const initData = buildSignedInitData(fields);

    const result = validateTelegramInitData(initData, BOT_TOKEN, now);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_user");
  });
});

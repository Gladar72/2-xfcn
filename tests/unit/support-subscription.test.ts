import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupportAiReply } from "@/lib/telegram/support-ai";

beforeEach(() => { vi.stubEnv("YANDEX_GPT_API_KEY", ""); vi.stubEnv("OPENAI_API_KEY", ""); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("subscription support", () => {
  it.each(["Как отключить подписку?", "Подписку не получается отменить", "Привет, как отключить автоплатёж?"])("explains manual renewal: %s", async (message) => {
    const result = await getSupportAiReply(message);
    expect(result.reply).toContain("Автопродления и ежемесячных списаний нет");
    expect(result.reply).toContain("«Бесплатно» — информационная карточка");
    expect(result.needsHuman).toBe(true);
  });

  it.each(["Списали деньги за подписку, хочу отменить и вернуть оплату", "Как отменить подписку в App Store?"])("escalates individual billing cases: %s", async (message) => {
    const result = await getSupportAiReply(message);
    expect(result.reply).toContain("Передал вопрос по оплате команде");
    expect(result.reply).not.toContain("списаний нет");
    expect(result.needsHuman).toBe(true);
  });

  it("corrects earlier misleading instructions on a follow-up", async () => {
    const result = await getSupportAiReply("Вы издеваетесь? Бесплатно не выбирается", [{ message: "Как отключить подписку?", bot_reply: "Открой раздел Подписка" }]);
    expect(result.reply).toContain("Извини за неверную подсказку");
    expect(result.reply).toContain("информационная карточка");
  });

  it("remembers that a billing follow-up concerned App Store", async () => {
    const result = await getSupportAiReply("Где эта подписка?", [{ message: "Как отменить подписку в App Store?", bot_reply: null }]);
    expect(result.reply).toContain("Передал вопрос по оплате команде");
    expect(result.reply).not.toContain("списаний нет");
  });

  it("keeps event cancellation separate from subscription cancellation", async () => {
    const result = await getSupportAiReply("Как отменить встречу?");
    expect(result.reply).toContain("Отменить свою встречу можно на странице");
    expect(result.reply).not.toContain("30 дней");
  });
});

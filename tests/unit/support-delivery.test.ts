import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sendMessage: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/telegram/bot", () => ({ getBot: () => ({ api: { sendMessage: mocks.sendMessage } }) }));
vi.mock("@/lib/notify/user", () => ({ notifyUser: mocks.notifyUser }));
import { deliverAdminReply } from "@/lib/support/tickets";

type Admin = Parameters<typeof deliverAdminReply>[0];
function db(ticket: Record<string, unknown> | null, saveError = false) {
  const writes: Record<string, unknown>[] = [];
  const admin = { from: vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ticket }) }) }),
    update: (value: Record<string, unknown>) => { writes.push(value); return { eq: async () => ({ error: saveError ? { message: "failed" } : null }) }; },
  })) };
  return { admin: admin as unknown as Admin, writes };
}
beforeEach(() => { vi.resetAllMocks(); mocks.notifyUser.mockResolvedValue(undefined); mocks.sendMessage.mockResolvedValue({ message_id: 123 }); });

describe("support replies from the MESTO bot", () => {
  it("confirms delivery only after Telegram accepts the message", async () => {
    const { admin, writes } = db({ telegram_id: 42, user_id: "user", admin_reply: null });
    expect(await deliverAdminReply(admin, "ticket", "Ответ")).toBe("delivered");
    expect(mocks.sendMessage).toHaveBeenCalledWith(42, "💬 Ответ поддержки МЕСТО:\n\nОтвет");
    expect(writes.at(-1)?.admin_telegram_message_id).toBe(123);
    expect(mocks.notifyUser.mock.calls[0]![2].telegramText).toBeUndefined();
  });
  it("reports saved, not delivered, when Telegram rejects a reply available in the app", async () => {
    mocks.sendMessage.mockRejectedValue(new Error("blocked"));
    const { admin, writes } = db({ telegram_id: 42, user_id: "user", admin_reply: null });
    expect(await deliverAdminReply(admin, "ticket", "Ответ")).toBe("saved");
    expect(writes).toHaveLength(1);
  });
  it("reports an error when neither Telegram nor the app can deliver", async () => {
    mocks.sendMessage.mockRejectedValue(new Error("network"));
    const { admin } = db({ telegram_id: 42, user_id: null, admin_reply: null });
    await expect(deliverAdminReply(admin, "ticket", "Ответ")).rejects.toThrow("not delivered");
  });
  it("does not repeat an acknowledged reply", async () => {
    const { admin, writes } = db({ telegram_id: 42, admin_reply: "Ответ", admin_telegram_message_id: 123 });
    expect(await deliverAdminReply(admin, "ticket", "Ответ")).toBe("delivered");
    expect(mocks.sendMessage).not.toHaveBeenCalled(); expect(writes).toHaveLength(0);
  });
  it("retries an unacknowledged reply without duplicating its saved text", async () => {
    const { admin, writes } = db({ telegram_id: 42, admin_reply: "Ответ", admin_telegram_message_id: null });
    expect(await deliverAdminReply(admin, "ticket", "Ответ")).toBe("delivered");
    expect(writes[0]!.admin_reply).toBe("Ответ");
  });
  it("does not send if saving failed or the ticket does not exist", async () => {
    await expect(deliverAdminReply(db({ telegram_id: 42 }, true).admin, "ticket", "Ответ")).rejects.toThrow("save");
    expect(await deliverAdminReply(db(null).admin, "missing", "Ответ")).toBe("missing");
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});

// Hosted checkout on the dedicated test shop. Never uses subscription credentials.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { reconcileTicket, type TicketOrder } from "../../lib/payments/ticket-checkout";

async function run() {
  const runId = process.env.GITHUB_RUN_ID;
  if (!runId || !process.env.TICKET_TEST_SECRET_KEY?.startsWith("test_") || process.env.TICKET_TEST_SHOP_ID !== "1466532")
    throw new Error("Configure the dedicated test shop before running the bank test.");
  const uuid = (label: string) => {
    const hex = createHash("sha256").update("mesto-test-" + runId + "-" + label).digest("hex");
    return [hex.slice(0,8),hex.slice(8,12),"4"+hex.slice(13,16),"8"+hex.slice(17,20),hex.slice(20,32)].join("-");
  };
  const file = "ticket-shop-state.json";
  const order: TicketOrder = existsSync(file) ? JSON.parse(readFileSync(file,"utf8")) : {
    id:uuid("order"),attempt_id:uuid("attempt"),event_id:uuid("event"),user_id:uuid("guest"),
    provider_id:null,attempted_at:process.env.RUN_CREATED_AT || new Date().toISOString(),
    state:"pending",price_kopecks:150000,buyer_email:"buyer@example.invalid",event_title:"МЕСТО · тестовая вечеринка",
  };
  // Isolated test order. This process never connects to the application's database.
  const db = {rpc: async (_: string, p: {p_payment:string;p_state:string}) => {
    order.provider_id=p.p_payment; order.state=p.p_state; writeFileSync(file,JSON.stringify(order),{mode:0o600});
    return { data:p.p_state,error:null };
  }} as unknown as Parameters<typeof reconcileTicket>[0];
  if (process.argv.includes("--wait")) {
    for (let i=0;i<60;i++) {
      const {state} = await reconcileTicket(db,order);
      if (state === "paid") { console.log("ЮKassa подтвердила тестовую оплату 1500 ₽."); return; }
      if (state !== "pending") throw new Error("ЮKassa завершила заказ со статусом " + state);
      await new Promise(resolve=>setTimeout(resolve,10000));
    }
    throw new Error("ЮKassa пока ожидает подтверждения в платёжной форме.");
  }
  const result = await reconcileTicket(db,order);
  if (result.state !== "paid" && !result.confirmationUrl) throw new Error("Нет платёжной формы.");
  writeFileSync("test-checkout.txt", result.confirmationUrl || "Тестовый заказ уже оплачен.", {mode:0o600});
  console.log("Проверен заказ тестового магазина " + process.env.TICKET_TEST_SHOP_ID + ". Статус " + result.state);
}
run().catch(() => { console.error("Проверка не завершена. Проверь ключ Test и статус подтверждения в ЮKassa."); process.exitCode=1; });

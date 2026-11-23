import { z } from "zod";
import type { createAdminClient } from "@/lib/supabase/admin";

const base = "https://testonline.atol.ru/possystem/v4";
const group = "v4-online-atol-ru_4179";
type Db = ReturnType<typeof createAdminClient>;

async function call(path: string, token?: string, body?: unknown) {
  const response = await fetch(base + "/" + path, {
    method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(12000),
    headers: { "Content-Type": "application/json", ...(token ? { Token: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (response.status === 400 && data.error?.code === 33 && [group + "/sell", group + "/sell_refund"].includes(path) && data.uuid) return data;
  if (!response.ok || data.error) throw new Error("receipt_unavailable");
  return data;
}

// The shared demo device must receive synthetic contact and supplier details only.
export async function checkTestReceipt(db: Db, orderId: string, operation: "sell" | "sell_refund" = "sell"): Promise<boolean> {
  const row = await db.from("ticket_orders").select("state,price_kopecks,receipt_uuid,receipt_number,refund_receipt_uuid,refund_receipt_number").eq("id",orderId).single();
  const refund = operation === "sell_refund";
  if (row.error || !row.data || !["paid", "review", "refund_pending", "refund_review", "refunded"].includes(row.data.state)) return false;
  if (refund && (row.data.state !== "refunded" || !row.data.receipt_number)) return false;
  const numberField = refund ? "refund_receipt_number" : "receipt_number";
  const uuidField = refund ? "refund_receipt_uuid" : "receipt_uuid";
  if (row.data[numberField]) return true;
  const password = process.env.ATOL_DEMO_PASSWORD;
  if (!password) return false;
  const token = (await call("getToken", undefined, { login: "v4-online-atol-ru", pass: password })).token;
  if (!token) throw new Error("receipt_unavailable");
  let uuid = row.data[uuidField];
  const total = row.data.price_kopecks / 100;
  if (!uuid) {
    const stamp = new Intl.DateTimeFormat("ru-RU", { timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false }).format(new Date()).replace(",","");
    const result = await call(group + "/" + operation,token,{
      external_id: (refund ? "mesto-refund-" : "mesto-ticket-") + orderId, timestamp: stamp,
      receipt: { internet: true, client: {email:"buyer@example.invalid"},
        company: {inn:"5544332219",email:"agent@example.invalid",sno:"usn_income_outcome",payment_address:"https://v4.online.atol.ru"},
        items: [{ name:"Тестовый билет МЕСТО",price:total,quantity:1,sum:total,payment_method:"full_prepayment",payment_object:"service",
          vat:{type:"none"},agent_info:{type:"another"},supplier_info:{name:"Демонстрационный организатор",inn:"7700000009",phones:["+70000000000"]} }],
        payments:[{type:1,sum:total}],total },
    });
    uuid = z.string().uuid().parse(result.uuid);
    const saved = await db.from("ticket_orders").update({[uuidField]:uuid}).eq("id",orderId);
    if (saved.error) throw new Error("receipt_save_failed");
  }
  const report = await call(group + "/report/" + z.string().uuid().parse(uuid),token);
  if (report.status === "wait") return false;
  if (report.status !== "done" || Number(report.payload?.total) !== total || !report.payload?.fiscal_document_number ||
    !report.payload?.fiscal_document_attribute) throw new Error("receipt_invalid");
  const saved = await db.from("ticket_orders").update({[numberField]:String(report.payload.fiscal_document_number)}).eq("id",orderId);
  if (saved.error) throw new Error("receipt_save_failed");
  return true;
}

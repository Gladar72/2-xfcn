import { PLAN_LIMITS, type Plan } from "./limits";

export function canPayStarsInvoice(query: {
  invoice_payload: string;
  currency: string;
  total_amount: number;
  from: { id: number };
}): boolean {
  try {
    const invoice = JSON.parse(query.invoice_payload);
    return typeof invoice?.userId === "string" && invoice.userId.length > 0
      && Object.hasOwn(PLAN_LIMITS, invoice.plan)
      && query.currency === "XTR"
      && query.total_amount === PLAN_LIMITS[invoice.plan as Plan].priceStars
      && (invoice.telegramId === undefined || invoice.telegramId === query.from.id);
  } catch {
    return false;
  }
}

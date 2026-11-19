import { expect, test } from "vitest";
import { canPayStarsInvoice } from "@/lib/subscriptions/stars-checkout";

const invoice = { userId: "profile-id", plan: "medium", telegramId: 123 };
const query = { invoice_payload: JSON.stringify(invoice), currency: "XTR", total_amount: 300, from: { id: 123 } };

test("bot invoices accept the quoted Stars amount from the selected Telegram account", () => {
  expect(canPayStarsInvoice(query)).toBe(true);
  expect(canPayStarsInvoice({ ...query, total_amount: 150 })).toBe(false);
  expect(canPayStarsInvoice({ ...query, currency: "RUB" })).toBe(false);
  expect(canPayStarsInvoice({ ...query, from: { id: 456 } })).toBe(false);
});

test("existing Mini App invoices remain payable, invalid invoices are declined", () => {
  expect(canPayStarsInvoice({ ...query, invoice_payload: JSON.stringify({ userId: invoice.userId, plan: invoice.plan }) })).toBe(true);
  for (const payload of ["{}", "bad", "null", JSON.stringify({ ...invoice, plan: "constructor" })]) {
    expect(canPayStarsInvoice({ ...query, invoice_payload: payload })).toBe(false);
  }
});

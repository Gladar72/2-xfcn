import { createHash } from "node:crypto";
import { eventTiming, type EventTimingInput } from "@/lib/events/timing";
import { ticketPurchaseConditions } from "./ticket-purchase-conditions";

type Sale = { supplier_name: string; price_kopecks: number; purchase_terms: string; full_refund_before_start?: boolean | null };
type Event = EventTimingInput & {title:string; biz_category?:string | null; place_name?:string | null; address?:string | null};

export function eventSchedule(e: EventTimingInput) {
  return {event_date:e.event_date,event_time:e.event_time,city:e.city ?? null,longitude:e.longitude ?? null};
}
export function ticketContract(e: Event, sale: Sale, full: boolean) {
  const start = eventTiming(e).start.toISOString();
  const price = (sale.price_kopecks/100).toLocaleString("ru-RU") + " ₽";
  const when = e.event_date.split("-").reverse().join(".") + " в " + e.event_time.slice(0,5) + " по местному времени";
  const policy = full ? "Полный возврат при отказе до начала события. К возврату " + price + "."
    : "Добровольный отказ рассматривается по условиям этого события и применимому закону.";
  const text = [e.title, [when,e.city,e.place_name,e.address].filter(Boolean).join(" · "),
    "Организатор: " + sale.supplier_name, "Цена билета и итог к оплате: " + price + ". Сбор с гостя: 0 ₽.",
    policy, sale.purchase_terms, ticketPurchaseConditions].join("\n\n");
  return {text, start, version:createHash("sha256").update(text).digest("hex")};
}

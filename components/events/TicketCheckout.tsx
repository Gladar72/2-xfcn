"use client";
import { useCallback, useEffect, useState } from "react";
import { Sheet } from "@/components/proto/ui";

export interface OnlineCheckout {
  priceKopecks: number; supplier: string; terms: string; termsVersion: string; state: string | null;
}
export function TicketCheckout({ eventId, checkout }: { eventId: string; checkout: OnlineCheckout }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(checkout.state);
  const [email, setEmail] = useState("");
  const [showTerms,setShowTerms] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const price = (checkout.priceKopecks / 100).toLocaleString("ru-RU") + " ₽";
  const request = useCallback(async (body: { action: "pay" | "status"; email?: string; acceptedTerms?: boolean; termsVersion?: string }) => {
    const res = await fetch(`/api/events/${eventId}/checkout`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || "Не удалось проверить заказ");
    setState(result.state); setUrl(result.confirmationUrl); setError("");
    if (result.state === "paid") window.location.replace(`/events/${eventId}/ticket`);
    return result;
  }, [eventId]);
  const refresh = useCallback(() => request({ action: "status" }).catch(e => setError(e.message)), [request]);
  useEffect(() => {
    if (state !== "pending") return;
    void refresh();
    const timer = setInterval(refresh, 7000);
    return () => clearInterval(timer);
  }, [state, refresh]);
  return <>
    <button className="btn v" onClick={() => setOpen(true)}>{state === "pending" ? "Проверяем оплату" : state === "review" ? "Проверить заказ" : "Оплатить билет · " + price}</button>
    <Sheet open={open} onClose={() => setOpen(false)}>
      <h2 className="t">Тестовая оплата билета</h2>
      <p>Продавец · {checkout.supplier}</p><p>К оплате · {price}</p>
      {state === "pending" ? <><p>Ждём подтверждения ЮKassa.</p>
        {url && <a className="btn v" href={url}>Продолжить оплату</a>}
        <button className="btn o" onClick={refresh}>Проверить статус</button></> :
       state === "review" ? <p>Платёж получен. Для проверки заказа обратись в поддержку.</p> :
       <form onSubmit={async e => {
         e.preventDefault(); if (busy) return; setBusy(true);
         try { const result = await request({ action: "pay", email, acceptedTerms: accepted, termsVersion:checkout.termsVersion });
           if (result.state === "pending" && result.confirmationUrl) window.location.assign(result.confirmationUrl);
         } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
       }}>
         {state === "canceled" && <p>Предыдущая оплата отменена. Можно попробовать снова.</p>}
         <button type="button" className="btn o" onClick={() => setShowTerms(!showTerms)}>Договор покупки билета</button>
         {showTerms && <div tabIndex={0} style={{whiteSpace:"pre-line",maxHeight:"35vh",overflowY:"auto"}}>{checkout.terms}</div>}
         <label>Тестовая почта для чека <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="buyer@example.invalid" /></label>
         <p><label><input type="checkbox" required checked={accepted} onChange={e => setAccepted(e.target.checked)} /> Принимаю договор покупки билета и правила возврата</label></p>
         <button className="btn v" disabled={busy || !accepted}>Оплатить {price}</button>
       </form>}
      {error && <p role="alert">{error}</p>}
    </Sheet>
  </>;
}

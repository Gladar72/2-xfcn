"use client";
import { useState } from "react";
import { Sheet } from "@/components/proto/ui";

export interface RefundDetail {
  state: string; canRefund: boolean; requestedAt: string | null; terms: string;
  receiptNumber: string | null; inquiry: {created_at:string;admin_reply:string | null} | null;
}
export function TicketRefund({eventId,title,price,code,info,refresh}:{eventId:string;title:string;price:number;code:string;info:RefundDetail;refresh:()=>void}) {
  const [panel,setPanel] = useState<"refund"|"support"|"terms"|null>(null);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const amount = (price/100).toLocaleString("ru-RU")+" ₽";
  async function send() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const support = panel === "support";
      const res = await fetch(support ? "/api/support/ask" : `/api/events/${eventId}/refund`,{method:"POST",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(support ? {human:true,ticketEventId:eventId,message} : {})});
      if (!res.ok) throw new Error((await res.json()).message || "Не удалось отправить заявление.");
      setPanel(null); setMessage(""); refresh();
    } catch (e) { setError((e as Error).message); refresh(); } finally { setBusy(false); }
  }
  const status = info.state==="refunded" ? "Возврат оформлен" : info.state==="refund_pending" ? "Оформляем возврат" :
    info.state==="refund_review" ? "Возврат на проверке" : null;
  return <div className="gl" style={{padding:16,borderRadius:22,marginTop:14}}>
    {status && <><h2>{status}</h2><p>{amount} · {info.state==="refunded" ? "Деньги направлены тем же способом, которым ты оплатил билет." :
      info.state==="refund_review" ? "Нужна проверка поддержки." : "Заявление принято. Повторно отправлять его не нужно."}</p></>}
    {info.requestedAt && <p>Заявление от {new Date(info.requestedAt).toLocaleString("ru-RU")}</p>}
    {info.receiptNumber && <p>Чек возврата · ФД {info.receiptNumber}</p>}
    {info.inquiry && <p>{info.inquiry.admin_reply ? "Ответ поддержки: "+info.inquiry.admin_reply : "Обращение принято. Ответ появится здесь."}</p>}
    {info.canRefund && <button className="btn k" onClick={()=>{setError("");setPanel("refund")}}>Запросить возврат</button>}
    {!info.canRefund && info.state!=="refund_pending" && <button className="btn o" onClick={()=>{setError("");setPanel("support")}}>Обратиться по билету</button>}
    <button className="report" onClick={()=>setPanel("terms")}>Договор покупки билета</button>
    <Sheet open={panel!==null} onClose={()=>{if(!busy)setPanel(null);}}>
      <h2 className="t">{panel==="refund" ? "Возврат билета" : panel==="terms" ? "Договор покупки билета" : "Обращение по билету"}</h2>
      {panel==="terms" ? <div tabIndex={0} style={{whiteSpace:"pre-line",overflowY:"auto",maxHeight:"62vh"}}>{info.terms}</div> :
        <><p>{title} · {code}</p>
        {panel==="refund" ? <p>К возврату <b>{amount}</b>. Деньги вернутся тем же способом, которым ты оплатил билет.</p>
          : <label>Что произошло?<textarea maxLength={900} value={message} onChange={e=>setMessage(e.target.value)} /></label>}
        {error && <p role="alert">{error}</p>}
        <button className="btn k" disabled={busy || (panel==="support" && message.trim().length<2)} onClick={send}>
          {panel==="refund" ? "Отправить заявление" : "Отправить обращение"}</button></>}
      <button className="btn o" disabled={busy} onClick={()=>setPanel(null)}>{panel==="refund" ? "Оставить билет" : "К билету"}</button>
    </Sheet>
  </div>;
}

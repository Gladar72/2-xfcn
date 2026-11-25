import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Sheet } from "@/components/Sheet";
import { Btn, Glass } from "@/components/brand";
import { colors,f } from "@/lib/theme";
import { api } from "@/lib/api";

export interface RefundDetail {
  state:string;canRefund:boolean;requestedAt:string|null;terms:string;receiptNumber:string|null;
  inquiry:{created_at:string;admin_reply:string|null}|null;
}
export function TicketRefund({eventId,title,code,price,info,refresh}:{eventId:string;title:string;code:string;price:number;info:RefundDetail;refresh:()=>void}) {
  const [panel,setPanel]=useState<"support"|"refund"|"terms"|null>(null);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const amount=(price/100).toLocaleString("ru-RU")+" ₽";
  async function send() {
    if(busy)return;
    setBusy(true);setError("");
    try {
      if(panel==="support") await api("/api/support/ask",{body:{human:true,ticketEventId:eventId,message}});
      else await api(`/api/events/${eventId}/refund`,{method:"POST",body:{}});
      setMessage("");setPanel(null);refresh();
    } catch(e){setError((e as Error).message);refresh();} finally{setBusy(false);}
  }
  const status=info.state==="refunded" ? "Возврат оформлен" : info.state==="refund_pending" ? "Оформляем возврат" :
    info.state==="refund_review" ? "Возврат на проверке" : null;
  return <Glass style={{padding:16,gap:12}}>
    {status && <><Text style={{fontSize:21,...f("500")}}>{status}</Text><Text>{amount} · {info.state==="refunded" ?
      "Деньги направлены тем же способом, которым ты оплатил билет." : info.state==="refund_review" ? "Нужна проверка поддержки." : "Заявление принято."}</Text></>}
    {info.requestedAt && <Text>Заявление от {new Date(info.requestedAt).toLocaleString("ru-RU")}</Text>}
    {info.receiptNumber && <Text>Чек возврата · ФД {info.receiptNumber}</Text>}
    {info.inquiry && <Text>{info.inquiry.admin_reply ? "Ответ поддержки: "+info.inquiry.admin_reply : "Обращение принято. Ответ появится здесь."}</Text>}
    {info.canRefund && <Btn title="Запросить возврат" onPress={()=>{setError("");setPanel("refund");}} />}
    {!info.canRefund && info.state!=="refund_pending" && <Btn kind="o" title="Обратиться по билету" onPress={()=>{setError("");setPanel("support");}} />}
    <Btn kind="o" title="Договор покупки билета" onPress={()=>setPanel("terms")} />
    <Sheet visible={panel!==null} onClose={()=>{if(!busy)setPanel(null);}}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:450}}>
        <View style={{gap:14,paddingVertical:10}}><Text style={{fontSize:22,...f("500")}}>
          {panel==="terms" ? "Договор покупки билета" : panel==="refund" ? "Возврат билета" : "Обращение по билету"}</Text>
        {panel==="terms" ? <Text selectable>{info.terms}</Text> : <>
          <Text>{title} · {code}</Text>
          {panel==="refund" ? <Text>К возврату {amount}. Деньги вернутся тем же способом, которым ты оплатил билет.</Text> :
            <TextInput multiline accessibilityLabel="Что произошло?" placeholder="Что произошло?" value={message} onChangeText={setMessage}
              maxLength={900} style={{backgroundColor:colors.lav,padding:12,borderRadius:12,minHeight:80}} />}
          {!!error && <Text accessibilityRole="alert">{error}</Text>}
          <Btn title={panel==="refund" ? "Отправить заявление" : "Отправить обращение"} loading={busy}
            disabled={busy || (panel==="support" && message.trim().length<2)} onPress={send} /></>}
        <Btn kind="o" title={panel==="refund" ? "Оставить билет" : "К билету"} disabled={busy} onPress={()=>setPanel(null)} />
        </View>
      </ScrollView>
    </Sheet>
  </Glass>;
}

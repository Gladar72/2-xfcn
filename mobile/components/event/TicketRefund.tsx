import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { TicketPanel, TicketAmounts, ticketStyles } from "./TicketPanel";
import { Btn, Glass } from "@/components/brand";
import { Icon, type IconName } from "@/components/Icon";
import { colors,f } from "@/lib/theme";
import { api } from "@/lib/api";

export interface RefundDetail {
  state:string;canRefund:boolean;requestedAt:string|null;terms:string;receiptNumber:string|null;
  inquiry:{created_at:string;admin_reply:string|null}|null;
}
export function TicketRefund({eventId,title,code,price,info,refresh}:{eventId:string;title:string;code:string;price:number;info:RefundDetail;refresh:()=>void}) {
  const [panel,setPanel]=useState<"support"|"refund"|"terms"|null>(null);
  const [termsFromRefund, setTermsFromRefund] = useState(false);
  const [reason, setReason] = useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const { width, height, fontScale } = useWindowDimensions();
  const sideBySide = height < 740 && width >= 350 && fontScale <= 1.15;
  const amount=(price/100).toLocaleString("ru-RU")+" ₽";
  async function send() {
    if(busy)return;
    setBusy(true);setError("");
    try {
      if(panel==="support") await api("/api/support/ask",{body:{human:true,ticketEventId:eventId,message}});
      else await api(`/api/events/${eventId}/refund`,{method:"POST",body:{note:reason.trim()}});
      setMessage("");setReason("");setPanel(null);refresh();
    } catch(e){setError((e as Error).message);refresh();} finally{setBusy(false);}
  }
  function back() {
    if (busy) return;
    if (panel === "terms" && termsFromRefund) {
      setTermsFromRefund(false);setPanel("refund");
    } else setPanel(null);
  }
  const status=info.state==="refunded" ? "Возврат оформлен" : info.state==="refund_pending" ? "Оформляем возврат" :
    info.state==="refund_review" ? "Возврат на проверке" : null;
  return <><Glass strong style={styles.card}>
    {(status || info.requestedAt || info.receiptNumber || info.inquiry) && <View style={styles.summary}>
    {status && <><Text style={styles.status}>{status}</Text><Text>{amount} · {info.state==="refunded" ?
      "Деньги направлены тем же способом, которым ты оплатил билет." : info.state==="refund_review" ? "Нужна проверка поддержки." : "Заявление принято."}</Text></>}
    {info.requestedAt && <Text>Заявление от {new Date(info.requestedAt).toLocaleString("ru-RU")}</Text>}
    {info.receiptNumber && <Text>Чек возврата · ФД {info.receiptNumber}</Text>}
    {info.inquiry && <Text>{info.inquiry.admin_reply ? "Ответ поддержки: "+info.inquiry.admin_reply : "Обращение принято. Ответ появится здесь."}</Text>}
    </View>}
    <View style={sideBySide && styles.actionsAcross}>
      {info.canRefund && <Action compact={sideBySide} icon="reply" title="Запросить возврат" onPress={()=>{setError("");setPanel("refund");}} />}
      {!info.canRefund && info.state!=="refund_pending" && <Action compact={sideBySide} icon="help" title="Обратиться по билету" onPress={()=>{setError("");setPanel("support");}} />}
      {(info.canRefund || info.state!=="refund_pending") && <View style={sideBySide ? styles.verticalDivider : styles.divider} />}
      <Action compact={sideBySide} icon="doc" title="Договор покупки билета" onPress={()=>{setTermsFromRefund(false);setPanel("terms");}} />
    </View>
  </Glass>
    <TicketPanel visible={panel !== null} subtitle={title} busy={busy} onBack={back}
      title={panel === "terms" ? "Договор покупки " : panel === "refund" ? "Возврат " : "Обращение "}
      accent={panel === "support" ? "по билету" : "билета"}
      footer={<>
        {panel !== "terms" && <Btn title={panel === "refund" ? "Отправить заявление" : "Отправить обращение"} loading={busy}
          disabled={busy || (panel === "support" ? message.trim().length < 2 : !info.canRefund)} onPress={send} />}
        <Btn kind="w" title={panel === "refund" ? "Оставить билет" : panel === "terms" && termsFromRefund ? "К заявлению" : "К билету"} disabled={busy} onPress={back} />
      </>}>
      {panel === "terms" ? <Text selectable style={ticketStyles.body}>{info.terms}</Text> : panel === "refund" ? <>
        <TicketAmounts rows={[["Билет",code],["Оплачено",amount],["К возврату",amount]]} />
        <View style={ticketStyles.card}>
          <Text style={ticketStyles.fieldLabel}>Причина обращения · необязательно</Text>
          <TextInput multiline maxLength={500} editable={!busy} accessibilityLabel="Причина обращения"
            value={reason} onChangeText={setReason} style={ticketStyles.input} placeholder="Например, не смогу прийти" />
        </View>
        <Text style={ticketStyles.note}>Деньги вернутся тем же способом, которым ты оплатил билет.</Text>
        <Pressable accessibilityRole="button" disabled={busy} style={styles.termsLink}
          onPress={() => {setTermsFromRefund(true);setPanel("terms");}}>
          <Text style={ticketStyles.body}>Договор и правила возврата</Text>
        </Pressable>
      </> : <>
        <TicketAmounts rows={[["Билет",code],["Оплачено",amount]]} />
        <TextInput multiline accessibilityLabel="Что произошло?" placeholder="Что произошло?" value={message}
          editable={!busy} onChangeText={setMessage} maxLength={900} style={[ticketStyles.card, ticketStyles.body, {minHeight:80}]} />
      </>}
      {!!error && <Text accessibilityRole="alert" style={ticketStyles.body}>{error}</Text>}
    </TicketPanel>
  </>;
}

function Action({ compact, icon, title, onPress }: { compact: boolean; icon: IconName; title: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
    style={({ pressed }) => [styles.action, compact && styles.compactAction, pressed && styles.pressed]}>
    <Icon name={icon} size={19} color={colors.ink2} />
    <Text style={styles.actionLabel}>{title}</Text>
    {!compact && <Icon name="chev" size={16} color={colors.grey} />}
  </Pressable>;
}

const styles = StyleSheet.create({
  termsLink: { minHeight: 44, flexDirection: "row", alignItems: "center", alignSelf: "center" },
  card: { borderRadius: 24, overflow: "hidden" },
  actionsAcross: { flexDirection: "row" },
  compactAction: { flex: 1, paddingHorizontal: 12, gap: 7 },
  verticalDivider: { width: StyleSheet.hairlineWidth, marginVertical: 9, backgroundColor: colors.border },
  summary: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 6 },
  status: { ...f("600"), fontSize: 18, color: colors.ink },
  action: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46, paddingHorizontal: 16, paddingVertical: 9 },
  pressed: { backgroundColor: colors.lav },
  actionLabel: { flex: 1, ...f("500"), fontSize: 15, color: colors.ink },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 47, marginRight: 16, backgroundColor: colors.border },
});

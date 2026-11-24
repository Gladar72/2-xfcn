import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { TicketPanel, TicketAmounts, ticketStyles } from "./TicketPanel";
import { Btn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { colors, f } from "@/lib/theme";

export interface OnlineCheckout {
  priceKopecks: number; supplier: string; terms: string; termsVersion: string; state: string | null;
}
interface Result { state: string; confirmationUrl?: string | null }

export function TicketCheckout({ eventId, eventTitle, checkout, onPaid }: { eventId: string; eventTitle: string; checkout: OnlineCheckout; onPaid: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(checkout.state);
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<"bank_card" | "sbp">("bank_card");
  const [showTerms,setShowTerms] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const endpoint = `/api/events/${eventId}/checkout`;
  const price = (checkout.priceKopecks / 100).toLocaleString("ru-RU") + " ₽";

  const update = useCallback((result: Result) => {
    setState(result.state);
    setUrl(result.confirmationUrl ?? null);
    if (result.state === "paid") { setOpen(false); onPaid(); }
  }, [onPaid]);
  const refresh = useCallback(async () => {
    try { update(await api<Result>(endpoint, { body: { action: "status" } })); setError(""); }
    catch (err) { setError((err as Error).message); }
  }, [endpoint, update]);
  useEffect(() => setState(checkout.state), [checkout.state]);
  useFocusEffect(useCallback(() => {
    if (state !== "pending") return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 7000);
    return () => clearInterval(timer);
  }, [state, refresh]));

  async function pay() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await api<Result>(endpoint, { body: { action: "pay", email: email.trim(), paymentMethod: method, acceptedTerms: accepted, termsVersion:checkout.termsVersion } });
      update(result);
      if (result.state === "pending" && result.confirmationUrl) await Linking.openURL(result.confirmationUrl);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const waiting = state === "pending";
  const canPay = accepted && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && !busy;
  const reviewing = state === "review";
  function back() {
    if (showTerms) setShowTerms(false);
    else setOpen(false);
  }
  useEffect(() => { setAccepted(false); setShowTerms(false); }, [eventId, checkout.termsVersion]);

  const submit = <Btn kind="w" style={[styles.payButton, !canPay && styles.payDisabled]} title={"Оплатить " + price}
    onPress={pay} loading={busy} disabled={!canPay} />;
  return <>
    <Btn kind="w" style={styles.payButton} title={waiting ? "Проверяем оплату" : reviewing ? "Проверить заказ" : "Оплатить билет · " + price} onPress={() => setOpen(true)} />
    <TicketPanel visible={open} onBack={back} busy={busy} subtitle={eventTitle}
      title={showTerms ? "Договор покупки " : waiting ? "Проверяем " : reviewing ? "Проверка " : "Оплата "}
      accent={showTerms ? "билета" : waiting ? "оплату" : reviewing ? "заказа" : "билета"}
      footer={showTerms ? <Btn kind="w" title="Вернуться к оплате" onPress={back} /> : waiting || reviewing ?
        <Btn kind="w" title="Вернуться к событию" onPress={back} /> : submit}>
      {showTerms ? <Text selectable style={ticketStyles.body}>{checkout.terms}</Text> : waiting ? <>
        <Text style={ticketStyles.body}>Ждём подтверждения банка. Билет появится здесь после оплаты.</Text>
        {url && <Btn kind="w" style={styles.payButton} title="Продолжить оплату" onPress={() => Linking.openURL(url).catch(() => setError("Не удалось открыть ЮKassa"))} />}
        <Btn kind="w" title="Проверить статус" onPress={refresh} />
      </> : reviewing ? <Text style={ticketStyles.body}>Платёж получен. Для проверки заказа обратись в поддержку.</Text> : <>
        {state === "canceled" && <Text style={ticketStyles.note}>Предыдущая оплата отменена. Можно попробовать снова.</Text>}
        <TicketAmounts rows={[["1 билет", price], ["Сбор с покупателя", "0 ₽"], ["К оплате", price]]} />
        <View style={ticketStyles.card}>
          {(["sbp","bank_card"] as const).map(value => {
            const label = value === "sbp" ? "СБП" : "Банковская карта";
            return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked: method === value}}
              style={styles.method} disabled={busy} onPress={() => setMethod(value)}>
              <View style={[styles.radio, method === value && styles.radioSelected]}>{method === value && <View style={styles.dot} />}</View>
              <Text style={ticketStyles.body}>{label}</Text>
            </Pressable>;
          })}
        </View>
        <View style={ticketStyles.card}>
          <Text style={ticketStyles.fieldLabel}>Электронная почта для чека</Text>
          <TextInput accessibilityLabel="Электронная почта для чека" value={email} onChangeText={setEmail} keyboardType="email-address"
            editable={!busy} maxLength={64} autoCapitalize="none" autoCorrect={false} placeholder="mail@example.ru" style={ticketStyles.input} />
        </View>
        <Text style={ticketStyles.note}>Сюда придут чек покупки и чек при возврате.</Text>
        <Text style={ticketStyles.note}>Продавец · {checkout.supplier}</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setShowTerms(true)} style={styles.contract}>
          <Text style={ticketStyles.body}>Договор покупки билета</Text><Icon name="chev" size={17} />
        </Pressable>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} disabled={busy}
          accessibilityLabel="Принимаю договор покупки билета и правила возврата" style={({ pressed }) => [styles.consent, pressed && styles.consentPressed]}
          onPress={() => setAccepted(value => !value)}>
          <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>{accepted && <Icon name="check" size={24} strokeWidth={3} color="#fff" />}</View>
          <Text style={styles.consentLabel}>Принимаю договор покупки билета и правила возврата</Text>
        </Pressable>
      </>}
      {!!error && <Text accessibilityRole="alert" style={ticketStyles.body}>{error}</Text>}
    </TicketPanel>
  </>;
}

const styles = StyleSheet.create({
  method: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.grey, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: colors.ink },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink },
  contract: { minHeight: 48, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 16, paddingHorizontal: 14, backgroundColor: "#fff" },
  payButton: { minHeight: 54, height: "auto", paddingVertical: 14, backgroundColor: "#F4F0FF", borderWidth: 1.5, borderColor: "#79659A" },
  payDisabled: { backgroundColor: colors.pearl2, borderColor: "#B3ACBD", opacity: 0.75 },
  consent: { flexDirection: "row", alignItems: "center", minHeight: 52, paddingVertical: 7, paddingHorizontal: 4, gap: 12, borderRadius: 12 },
  consentPressed: { backgroundColor: colors.lav },
  checkbox: { width: 32, height: 32, borderRadius: 9, borderWidth: 2, borderColor: colors.ink2, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  checkboxChecked: { borderColor: colors.ink, backgroundColor: colors.ink },
  consentLabel: { flex: 1, ...f("500"), fontSize: 15, lineHeight: 21, color: colors.ink },
});

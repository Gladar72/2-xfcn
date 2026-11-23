import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Sheet } from "@/components/Sheet";
import { Btn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { colors, FONT, f } from "@/lib/theme";

export interface OnlineCheckout {
  priceKopecks: number; supplier: string; terms: string; termsVersion: string; state: string | null;
}
interface Result { state: string; confirmationUrl?: string | null }

export function TicketCheckout({ eventId, checkout, onPaid }: { eventId: string; checkout: OnlineCheckout; onPaid: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(checkout.state);
  const [email, setEmail] = useState("");
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
      const result = await api<Result>(endpoint, { body: { action: "pay", email, acceptedTerms: accepted, termsVersion:checkout.termsVersion } });
      update(result);
      if (result.state === "pending" && result.confirmationUrl) await Linking.openURL(result.confirmationUrl);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const waiting = state === "pending";
  const canPay = accepted && !!email.trim() && !busy;
  return <>
    <Btn kind="w" style={styles.payButton} title={waiting ? "Проверяем оплату" : state === "review" ? "Проверить заказ" : "Оплатить билет · " + price} onPress={() => setOpen(true)} />
    <Sheet visible={open} onClose={() => setOpen(false)}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 450 }}>
        <View style={{ gap: 12, paddingVertical: 10 }}>
          <Text style={{ fontFamily: FONT, fontSize: 23, color: colors.ink }}>Тестовая оплата билета</Text>
          <Text>Продавец · {checkout.supplier}</Text><Text>К оплате · {price}</Text>
          {waiting ? <>
            <Text>Ждём подтверждения ЮKassa. Билет появится здесь после оплаты.</Text>
            {url && <Btn kind="w" style={styles.payButton} title="Продолжить оплату" onPress={() => Linking.openURL(url).catch(() => setError("Не удалось открыть ЮKassa"))} />}
            <Btn title="Проверить статус" kind="o" onPress={refresh} />
          </> : state === "review" ? <Text>Платёж получен. Для проверки заказа обратись в поддержку.</Text> : <>
            {state === "canceled" && <Text>Предыдущая оплата отменена. Можно попробовать снова.</Text>}
            <Text>Тестовая почта для чека</Text>
            <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="buyer@example.invalid"
              style={{ backgroundColor: "#f4f1f6", borderRadius: 12, padding: 12 }} />
            <Btn title="Договор покупки билета" kind="o" onPress={() => setShowTerms(!showTerms)} />
            {showTerms && <Text selectable>{checkout.terms}</Text>}
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }}
              accessibilityLabel="Принимаю договор покупки билета и правила возврата"
              style={({ pressed }) => [styles.consent, pressed && styles.consentPressed]}
              onPress={() => setAccepted(value => !value)}>
              <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
                {accepted && <Icon name="check" size={24} strokeWidth={3} color="#fff" />}
              </View>
              <Text style={styles.consentLabel}>Принимаю договор покупки билета и правила возврата</Text>
            </Pressable>
            <Btn kind="w" style={[styles.payButton, !canPay && styles.payDisabled]} title={"Оплатить " + price} onPress={pay} loading={busy} disabled={!canPay} />
          </>}
          {!!error && <Text accessibilityRole="alert">{error}</Text>}
        </View>
      </ScrollView>
    </Sheet>
  </>;
}

const styles = StyleSheet.create({
  payButton: { minHeight: 54, height: "auto", paddingVertical: 14, backgroundColor: "#F4F0FF", borderWidth: 1.5, borderColor: "#79659A" },
  payDisabled: { backgroundColor: colors.pearl2, borderColor: "#B3ACBD", opacity: 0.75 },
  consent: { flexDirection: "row", alignItems: "center", minHeight: 52, paddingVertical: 7, paddingHorizontal: 4, gap: 12, borderRadius: 12 },
  consentPressed: { backgroundColor: colors.lav },
  checkbox: { width: 32, height: 32, borderRadius: 9, borderWidth: 2, borderColor: colors.ink2, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  checkboxChecked: { borderColor: colors.ink, backgroundColor: colors.ink },
  consentLabel: { flex: 1, ...f("500"), fontSize: 15, lineHeight: 21, color: colors.ink },
});

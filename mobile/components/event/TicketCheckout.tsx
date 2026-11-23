import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Sheet } from "@/components/Sheet";
import { Btn } from "@/components/brand";
import { api } from "@/lib/api";
import { colors, FONT } from "@/lib/theme";

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
  return <>
    <Btn title={waiting ? "Проверяем оплату" : state === "review" ? "Проверить заказ" : "Оплатить билет · " + price} onPress={() => setOpen(true)} />
    <Sheet visible={open} onClose={() => setOpen(false)}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 450 }}>
        <View style={{ gap: 12, paddingVertical: 10 }}>
          <Text style={{ fontFamily: FONT, fontSize: 23, color: colors.ink }}>Тестовая оплата билета</Text>
          <Text>Продавец · {checkout.supplier}</Text><Text>К оплате · {price}</Text>
          {waiting ? <>
            <Text>Ждём подтверждения ЮKassa. Билет появится здесь после оплаты.</Text>
            {url && <Btn title="Продолжить оплату" onPress={() => Linking.openURL(url).catch(() => setError("Не удалось открыть ЮKassa"))} />}
            <Btn title="Проверить статус" kind="o" onPress={refresh} />
          </> : state === "review" ? <Text>Платёж получен. Для проверки заказа обратись в поддержку.</Text> : <>
            {state === "canceled" && <Text>Предыдущая оплата отменена. Можно попробовать снова.</Text>}
            <Btn title="Договор покупки билета" kind="o" onPress={() => setShowTerms(!showTerms)} />
            {showTerms && <Text selectable>{checkout.terms}</Text>}<Text>Тестовая почта для чека</Text>
            <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="buyer@example.invalid"
              style={{ backgroundColor: "#f4f1f6", borderRadius: 12, padding: 12 }} />
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted(!accepted)}>
              <Text>{accepted ? "☑" : "☐"} Принимаю договор покупки билета и правила возврата</Text>
            </Pressable>
            <Btn title={"Оплатить " + price} onPress={pay} loading={busy} disabled={!accepted || !email.trim() || busy} />
          </>}
          {!!error && <Text accessibilityRole="alert">{error}</Text>}
        </View>
      </ScrollView>
    </Sheet>
  </>;
}

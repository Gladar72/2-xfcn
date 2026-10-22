import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { Image } from "expo-image";
import { Aurora, Btn, Glass, RoundBtn, Title } from "@/components/brand";
import { Sheet } from "@/components/Sheet";
import { Icon } from "@/components/Icon";
import { api, ApiError } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { tapLight, tapOk, tapWarn } from "@/lib/feedback";
import { buyApple, loadApplePrices, restoreApple } from "@/lib/iap";
import { getMyId } from "@/lib/me";
import { stickerUrl } from "@/lib/stickers";
import { STORE } from "@/lib/store";
import { PLAN_FEATURES, PLAN_NAME, PLAN_PRICE_RUB, untilLabel, type Plan, type Subscription } from "@/lib/subscription";
import { colors, FONT } from "@/lib/theme";
import { useGuide } from "@/lib/guide";

/**
 * Тарифы. Оплата зависит от магазина (lib/store.ts):
 *  iPhone — подписка App Store с автопродлением;
 *  RuStore — разовая оплата на 30 дней картой или СБП (ЮKassa);
 *  Google Play — оплаты нет, уже оформленный тариф просто работает.
 */
const PLANS: Plan[] = ["start", "medium", "premium"];
const APPLE_TERMS = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const MANAGE_APPLE = "https://apps.apple.com/account/subscriptions";

export default function SubscriptionScreen() {
  useGuide("subscription");
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ paid?: string }>();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [picked, setPicked] = useState<Plan>("medium");
  const [prices, setPrices] = useState<Partial<Record<Plan, string>>>({});
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [checking, setChecking] = useState(params.paid === "1");
  /** Состояние тарифа до оплаты: успехом считаем только его изменение (продление, смену тарифа). */
  const before = useRef<string | null>(null);
  const stamp = (s: Subscription | null) => (s?.active ? `${s.plan}|${s.periodEnd}` : "none");
  const [toast, setToast] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState("");
  const appear = useRef(new Animated.Value(0)).current;

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  };

  const load = useCallback(async () => {
    try {
      const s = await api<Subscription>("/api/subscriptions");
      setSub(s);
      if (s.active && s.plan) setPicked(s.plan);
      return s;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    load().then(() => Animated.timing(appear, { toValue: 1, duration: 420, useNativeDriver: true }).start());
    if (STORE === "appstore") {
      loadApplePrices().then(setPrices).catch(() => {});
      // Дозавершаем покупку, если приложение закрылось посреди оплаты.
      restoreApple()
        .then((r) => {
          if (r?.active) void load();
        })
        .catch(() => {});
    }
  }, [load, appear]);

  // Пришли по ссылке возврата из оплаты (mesto://subscription?paid=1).
  useEffect(() => {
    if (params.paid === "1") setChecking(true);
  }, [params.paid]);

  // Вернулись из оплаты ЮKassa — ждём подтверждения от банка (вебхук), до ~40 секунд.
  useEffect(() => {
    if (!checking) return;
    let stop = false;
    (async () => {
      let changed = false;
      for (let i = 0; i < 14 && !stop; i++) {
        const s = await load();
        if (before.current === null) before.current = stamp(s);
        else if (s && stamp(s) !== before.current && s.active) {
          changed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (stop) return;
      setChecking(false);
      before.current = null;
      if (changed) {
        tapOk();
        flash("Оплата прошла — тариф включён 🎉");
      }
    })();
    return () => {
      stop = true;
    };
  }, [checking, load]);

  async function buy(withContact?: string) {
    setBusy("buy");
    try {
      if (STORE === "appstore") {
        const userId = await getMyId();
        if (!userId) throw new Error("Нет связи — попробуй ещё раз");
        const r = await buyApple(picked, userId);
        if (r) {
          await load();
          tapOk();
          flash(r.active ? `Тариф «${PLAN_NAME[r.plan]}» включён 🎉` : "Покупка получена — тариф скоро включится");
        }
      } else {
        const r = await api<{ confirmationUrl: string }>("/api/subscriptions/yookassa/create-payment", {
          body: { plan: picked, contact: withContact, returnTo: "app" },
        });
        setContactOpen(false);
        before.current = stamp(sub);
        await WebBrowser.openAuthSessionAsync(r.confirmationUrl, "mesto://subscription");
        // Даже если окно просто закрыли — проверим: оплата могла пройти до закрытия.
        setChecking(true);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "contact_required") {
        setContact("");
        setContactOpen(true);
      } else if (e instanceof ApiError && e.code === "invalid_contact") {
        tapWarn();
        flash("Проверь почту или телефон для чека");
      } else {
        tapWarn();
        flash((e as Error).message || "Не получилось — попробуй ещё раз");
      }
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setBusy("restore");
    try {
      const r = await restoreApple();
      await load();
      tapOk();
      flash(r?.active ? `Тариф «${PLAN_NAME[r.plan]}» восстановлен` : "Активных подписок App Store не нашлось");
    } catch (e) {
      tapWarn();
      flash((e as Error).message || "Не получилось восстановить покупки");
    } finally {
      setBusy(null);
    }
  }

  const priceLabel = (p: Plan) =>
    STORE === "appstore" ? (prices[p] ? `${prices[p]} / мес` : "…") : STORE === "rustore" ? `${PLAN_PRICE_RUB[p]} ₽ / 30 дней` : "";
  const isCurrent = (p: Plan) => !!sub?.active && sub.plan === p;
  const ctaTitle =
    busy === "buy"
      ? "Секунду…"
      : isCurrent(picked)
        ? STORE === "appstore"
          ? "Это твой тариф"
          : `Продлить «${PLAN_NAME[picked]}» — ${PLAN_PRICE_RUB[picked]} ₽`
        : STORE === "appstore"
          ? `Подписаться${prices[picked] ? ` за ${prices[picked]} / мес` : ""}`
          : `Оплатить ${PLAN_PRICE_RUB[picked]} ₽`;

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 14 }}>
        <View style={{ flexDirection: "row" }}>
          <RoundBtn onPress={() => router.back()} size={40}>
            <Icon name="back" />
          </RoundBtn>
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Image source={{ uri: stickerUrl("mosya_rich") }} style={{ width: 140, height: 140 }} contentFit="contain" />
          <Title plain="Тарифы " em="МЕСТО" size={28} style={{ textAlign: "center" }} />
          <Text style={styles.lead}>Создавай свои встречи, откликайся без ограничений и поднимайся выше в ленте</Text>
        </View>

        {!sub ? (
          <ActivityIndicator color={colors.violet} style={{ marginTop: 30 }} />
        ) : (
          <Animated.View style={{ gap: 12, opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
            {sub.active ? (
              <Glass strong style={styles.current}>
                <View style={styles.currentIc}>
                  <Icon name="check" size={18} color={colors.ok} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.currentTitle}>Тариф «{PLAN_NAME[sub.plan ?? ""] ?? "—"}»</Text>
                  <Text style={styles.muted}>
                    Активен до {untilLabel(sub.periodEnd)}
                    {sub.events?.limit ? ` · ${sub.events.used} из ${sub.events.limit} встреч` : ""}
                  </Text>
                </View>
              </Glass>
            ) : null}

            {checking ? (
              <Glass strong style={styles.current}>
                <ActivityIndicator color={colors.violet} />
                <Text style={[styles.muted, { flex: 1 }]}>Проверяем оплату — обычно это несколько секунд…</Text>
              </Glass>
            ) : null}

            {PLANS.map((p) => {
              const on = picked === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => {
                    tapLight();
                    setPicked(p);
                  }}
                  style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
                >
                  <Glass strong style={[styles.plan, on && styles.planOn]}>
                    <View style={styles.planHead}>
                      <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                      <Text style={styles.planName}>{PLAN_NAME[p]}</Text>
                      {p === "medium" ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>популярный</Text>
                        </View>
                      ) : null}
                      {isCurrent(p) ? (
                        <View style={[styles.badge, { backgroundColor: "rgba(34,181,115,0.14)" }]}>
                          <Text style={[styles.badgeText, { color: colors.ok }]}>сейчас</Text>
                        </View>
                      ) : null}
                      <View style={{ flex: 1 }} />
                      {priceLabel(p) ? <Text style={styles.price}>{priceLabel(p)}</Text> : null}
                    </View>
                    {on ? (
                      <View style={{ gap: 6, marginTop: 10 }}>
                        {PLAN_FEATURES[p].map((f) => (
                          <View key={f} style={styles.feature}>
                            <Icon name="check" size={15} color={colors.violet} />
                            <Text style={styles.featureText}>{f}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </Glass>
                </Pressable>
              );
            })}

            {STORE === "googleplay" ? (
              <Glass strong style={styles.note}>
                <Text style={styles.muted}>
                  В этой версии приложения оформить тариф нельзя. Если он у тебя уже есть — все возможности работают и здесь.
                </Text>
              </Glass>
            ) : (
              <>
                <Btn kind="v" title={ctaTitle} onPress={() => buy()} loading={busy === "buy"} disabled={!!busy || (STORE === "appstore" && isCurrent(picked))} />
                {STORE === "appstore" ? (
                  <>
                    <View style={styles.links}>
                      <Pressable onPress={restore} disabled={!!busy} hitSlop={8}>
                        <Text style={styles.link}>{busy === "restore" ? "Восстанавливаем…" : "Восстановить покупки"}</Text>
                      </Pressable>
                      <Pressable onPress={() => Linking.openURL(MANAGE_APPLE)} hitSlop={8}>
                        <Text style={styles.link}>Управлять подпиской</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.legal}>
                      Подписка на 1 месяц продлевается автоматически, оплата списывается с Apple ID. Отменить можно в настройках
                      Apple ID не позднее чем за 24 часа до конца периода.{" "}
                      <Text style={styles.legalLink} onPress={() => Linking.openURL(APPLE_TERMS)}>
                        Условия использования
                      </Text>{" "}
                      и{" "}
                      <Text style={styles.legalLink} onPress={() => Linking.openURL(`${API_URL}/legal/privacy`)}>
                        политика конфиденциальности
                      </Text>
                      .
                    </Text>
                  </>
                ) : (
                  <Text style={styles.legal}>
                    Разовая оплата на 30 дней картой или через СБП, без автопродления. Чек придёт на почту.{" "}
                    <Text style={styles.legalLink} onPress={() => Linking.openURL(`${API_URL}/legal/offer`)}>
                      Оферта
                    </Text>
                    .
                  </Text>
                )}
              </>
            )}
          </Animated.View>
        )}
      </ScrollView>

      {toast ? (
        <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Sheet visible={contactOpen} onClose={() => setContactOpen(false)}>
        <Text style={styles.sheetTitle}>Куда прислать чек?</Text>
        <Text style={styles.muted}>Почта или телефон — по закону чек об оплате отправляем электронно.</Text>
        <Glass strong style={styles.inputWrap}>
          <TextInput
            value={contact}
            onChangeText={setContact}
            placeholder="почта или +7 900 000-00-00"
            placeholderTextColor={colors.grey}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={styles.input}
          />
        </Glass>
        <Btn kind="v" title={busy ? "Секунду…" : "Перейти к оплате"} onPress={() => buy(contact.trim())} disabled={!!busy || contact.trim().length < 5} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: FONT, fontSize: 15, color: colors.ink2, textAlign: "center", lineHeight: 21, paddingHorizontal: 10 },
  current: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 22, padding: 14 },
  currentIc: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(34,181,115,0.14)", alignItems: "center", justifyContent: "center" },
  currentTitle: { fontFamily: FONT, fontSize: 16, fontWeight: "600", color: colors.ink },
  muted: { fontFamily: FONT, fontSize: 13.5, color: colors.grey, lineHeight: 19 },
  plan: { borderRadius: 24, padding: 16, borderWidth: 1.5, borderColor: "transparent" },
  planOn: { borderColor: colors.violet },
  planHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(108,59,255,0.3)", alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.violet },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.violet },
  planName: { fontFamily: FONT, fontSize: 18, fontWeight: "600", color: colors.ink },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.lav },
  badgeText: { fontFamily: FONT, fontSize: 11.5, fontWeight: "600", color: colors.violet },
  price: { fontFamily: FONT, fontSize: 15, fontWeight: "600", color: colors.ink2 },
  feature: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureText: { fontFamily: FONT, fontSize: 14.5, color: colors.ink2, flex: 1 },
  note: { borderRadius: 20, padding: 14 },
  links: { flexDirection: "row", justifyContent: "center", gap: 22 },
  link: { fontFamily: FONT, fontSize: 14, fontWeight: "500", color: colors.violet },
  legal: { fontFamily: FONT, fontSize: 12, color: colors.grey, textAlign: "center", lineHeight: 17, paddingHorizontal: 8 },
  legalLink: { color: colors.ink2, textDecorationLine: "underline" },
  toast: { position: "absolute", alignSelf: "center", backgroundColor: "rgba(22,18,31,0.9)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, maxWidth: "90%" },
  toastText: { fontFamily: FONT, fontSize: 14, color: "#fff", textAlign: "center" },
  sheetTitle: { fontFamily: FONT, fontSize: 19, fontWeight: "600", color: colors.ink, marginBottom: 4 },
  inputWrap: { borderRadius: 18, paddingHorizontal: 16, marginVertical: 12 },
  input: { fontFamily: FONT, fontSize: 16, color: colors.ink, paddingVertical: 14 },
});

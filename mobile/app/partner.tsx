import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import { Aurora, Btn, Glass, Grad, RoundBtn, Title } from "@/components/brand";
import { Sheet } from "@/components/Sheet";
import { Icon, type IconName } from "@/components/Icon";
import { api, ApiError } from "@/lib/api";
import { tapOk, tapWarn } from "@/lib/feedback";
import { stickerUrl } from "@/lib/stickers";
import { colors, FONT, f } from "@/lib/theme";

/** Партнёрская программа для блогеров и пабликов: 30% с каждой оплаты приведённых людей. */

type Money = Record<string, number>;
interface PartnerInfo {
  status: "none" | "pending" | "approved" | "rejected";
  rate: number;
  payoutDetails?: string | null;
  code?: string;
  link?: string;
  stats?: { joined: number; registered: number; buyers: number; payments: number; earned: Money; available: Money; requested: Money; paid: Money };
}

function money(m: Money | undefined): string {
  const parts = Object.entries(m ?? {})
    .filter(([, v]) => v > 0)
    .map(([cur, v]) => `${(Math.round(v * 100) / 100).toLocaleString("ru-RU")} ${cur === "XTR" ? "⭐" : "₽"}`);
  return parts.length ? parts.join(" + ") : "0 ₽";
}
const hasMoney = (m: Money | undefined) => Object.values(m ?? {}).some((v) => v > 0);

const PERKS: { icon: IconName; title: string; text: string }[] = [
  { icon: "wallet", title: "30% с каждой оплаты", text: "Со всех подписок приведённых людей, включая продления, без ограничения по сроку" },
  { icon: "star", title: "«Премиум» бесплатно", text: "Все функции приложения без ограничений, пока ты партнёр" },
  { icon: "people", title: "Новая аудитория", text: "Тебя увидят люди из города, а твои встречи, тренировки и события — на карте" },
  { icon: "pin", title: "Навсегда за тобой", text: "Кто пришёл по твоей ссылке, закрепляется за тобой навсегда" },
];

export default function PartnerScreen() {
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<PartnerInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState("");

  const load = useCallback(async () => {
    try {
      setInfo(await api<PartnerInfo>("/api/partner"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };

  async function apply() {
    setBusy(true);
    try {
      setInfo(await api<PartnerInfo>("/api/partner", { method: "POST" }));
      tapOk();
    } catch (e) {
      tapWarn();
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function saveDetails() {
    setBusy(true);
    try {
      setInfo(await api<PartnerInfo>("/api/partner", { method: "PATCH", body: { payoutDetails: details } }));
      setDetailsOpen(false);
      tapOk();
      flash("Реквизиты сохранены");
    } catch (e) {
      tapWarn();
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function payout() {
    if (!info?.payoutDetails) {
      setDetails("");
      setDetailsOpen(true);
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ amount: string }>("/api/partner/payout", { method: "POST" });
      tapOk();
      flash(`Запросили выплату ${r.amount} — переведём в ближайшее время`);
      load();
    } catch (e) {
      tapWarn();
      flash(e instanceof ApiError ? e.message : "Не получилось запросить выплату");
    }
    setBusy(false);
  }

  async function copyLink() {
    if (!info?.link) return;
    await Clipboard.setStringAsync(info.link);
    tapOk();
    flash("Ссылка скопирована");
  }

  async function shareLink() {
    if (!info?.link) return;
    await Share.share({ message: `МЕСТО — находи компанию на кофе, тренировку, кино и прогулки 🧡\n${info.link}` }).catch(() => {});
  }

  const s = info?.stats;

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 14 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.violet}
          />
        }
      >
        <View style={styles.top}>
          <RoundBtn onPress={() => router.back()} size={40}>
            <Icon name="back" />
          </RoundBtn>
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Image source={{ uri: stickerUrl(info?.status === "approved" ? "mosya_rich" : "mosya_pin") }} style={{ width: 150, height: 150 }} contentFit="contain" />
          <Title plain="Партнёрская " em="программа" size={28} style={{ textAlign: "center" }} />
        </View>

        {!info ? (
          error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <ActivityIndicator color={colors.violet} style={{ marginTop: 30 }} />
          )
        ) : info.status === "approved" ? (
          <>
            <Glass strong style={styles.card}>
              <Text style={styles.label}>Твоя ссылка</Text>
              <Text style={styles.link} selectable>
                {info.link}
              </Text>
              <Text style={styles.muted}>
                Код приглашения: <Text style={{ color: colors.violet, ...f("700") }}>{info.code}</Text> — его можно ввести в приложении в настройках
              </Text>
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Btn kind="v" title="Поделиться" onPress={shareLink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Btn kind="o" title="Копировать" onPress={copyLink} />
                </View>
              </View>
            </Glass>

            <View style={styles.grid}>
              <Stat value={s?.joined ?? 0} label="перешли" />
              <Stat value={s?.registered ?? 0} label="в приложении" />
              <Stat value={s?.buyers ?? 0} label="оплатили" />
            </View>

            <Glass strong style={styles.card}>
              <Text style={styles.label}>Заработано всего</Text>
              <Text style={styles.big}>{money(s?.earned)}</Text>
              <View style={styles.moneyRow}>
                <MoneyCell title="Можно вывести" value={money(s?.available)} accent />
                <MoneyCell title="Ждёт выплаты" value={money(s?.requested)} />
                <MoneyCell title="Выплачено" value={money(s?.paid)} />
              </View>
              <Btn kind="v" title={busy ? "Секунду…" : "Запросить выплату"} onPress={payout} disabled={busy || !hasMoney(s?.available)} />
              <Btn
                kind="o"
                title={info.payoutDetails ? "Изменить реквизиты" : "Указать реквизиты"}
                onPress={() => {
                  setDetails(info.payoutDetails ?? "");
                  setDetailsOpen(true);
                }}
              />
              {info.payoutDetails ? <Text style={styles.muted}>Реквизиты: {info.payoutDetails}</Text> : null}
            </Glass>

            <Glass strong style={styles.card}>
              <Text style={styles.label}>Как это работает</Text>
              <Text style={styles.text}>1. Расскажи о МЕСТО в сторис или посте и добавь свою ссылку.</Text>
              <Text style={styles.text}>2. Кто перейдёт по ней и зарегистрируется — закрепится за тобой навсегда.</Text>
              <Text style={styles.text}>3. С каждой их оплаты подписки — включая продления — тебе 30%.</Text>
              <Text style={styles.text}>4. Укажи реквизиты (СБП или карта, ФИО) и запроси выплату — переведём вручную и пришлём уведомление.</Text>
            </Glass>
          </>
        ) : (
          <>
            <Text style={styles.lead}>Рекомендуй МЕСТО своей аудитории и получай {Math.round(info.rate * 100)}% с каждой оплаты подписки приведённых людей.</Text>
            {PERKS.map((p) => (
              <Glass key={p.title} strong style={styles.perk}>
                <Grad style={styles.perkIc}>
                  <Icon name={p.icon} size={20} color="#fff" />
                </Grad>
                <View style={{ flex: 1 }}>
                  <Text style={styles.perkTitle}>{p.title}</Text>
                  <Text style={styles.muted}>{p.text}</Text>
                </View>
              </Glass>
            ))}
            {info.status === "pending" ? (
              <Glass strong style={[styles.card, { alignItems: "center" }]}>
                <Icon name="clock" size={26} color={colors.violet} />
                <Text style={[styles.perkTitle, { textAlign: "center" }]}>Заявка на рассмотрении</Text>
                <Text style={[styles.muted, { textAlign: "center" }]}>Как только её одобрят, пришлём уведомление — здесь появятся твоя ссылка и статистика.</Text>
              </Glass>
            ) : info.status === "rejected" ? (
              <Glass strong style={[styles.card, { alignItems: "center" }]}>
                <Text style={[styles.perkTitle, { textAlign: "center" }]}>Заявка отклонена</Text>
                <Text style={[styles.muted, { textAlign: "center" }]}>Если есть вопросы — напиши в поддержку.</Text>
                <Btn kind="o" title="Написать в поддержку" onPress={() => router.push("/support")} />
              </Glass>
            ) : (
              <Btn kind="v" title={busy ? "Отправляем…" : "Подать заявку"} onPress={apply} disabled={busy} />
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        )}
      </ScrollView>

      {toast ? (
        <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Sheet visible={detailsOpen} onClose={() => setDetailsOpen(false)}>
        <Text style={styles.sheetTitle}>Реквизиты для выплат</Text>
        <Text style={styles.muted}>Телефон для СБП и банк (или номер карты) и ФИО получателя.</Text>
        <Glass strong style={styles.inputWrap}>
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="+7 900 000-00-00, Т-Банк, Иванов Иван Иванович"
            placeholderTextColor={colors.grey}
            style={styles.input}
            multiline
            maxLength={500}
          />
        </Glass>
        <Btn kind="v" title={busy ? "Сохраняем…" : "Сохранить"} onPress={saveDetails} disabled={busy || details.trim().length < 5} />
      </Sheet>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Glass strong style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Glass>
  );
}

function MoneyCell({ title, value, accent }: { title: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={styles.statLabel}>{title}</Text>
      <Text style={[styles.moneyValue, accent && { color: colors.ok }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row" },
  lead: { fontFamily: FONT, fontSize: 16, color: colors.ink2, textAlign: "center", lineHeight: 22, paddingHorizontal: 6 },
  card: { borderRadius: 24, padding: 16, gap: 10 },
  label: { fontSize: 13, ...f("600"), color: colors.grey, textTransform: "uppercase", letterSpacing: 0.5 },
  link: { fontSize: 17, ...f("600"), color: colors.violet },
  big: { fontSize: 30, ...f("700"), color: colors.ink },
  text: { fontFamily: FONT, fontSize: 15, color: colors.ink2, lineHeight: 21 },
  muted: { fontFamily: FONT, fontSize: 13.5, color: colors.grey, lineHeight: 19 },
  row2: { flexDirection: "row", gap: 10 },
  grid: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: 20, paddingVertical: 14, alignItems: "center" },
  statValue: { fontSize: 24, ...f("700"), color: colors.ink },
  statLabel: { fontFamily: FONT, fontSize: 12.5, color: colors.grey },
  moneyRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  moneyValue: { fontSize: 15, ...f("600"), color: colors.ink },
  perk: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 22, padding: 14 },
  perkIc: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  perkTitle: { fontSize: 16, ...f("600"), color: colors.ink },
  error: { fontFamily: FONT, fontSize: 14, color: colors.danger, textAlign: "center" },
  toast: { position: "absolute", alignSelf: "center", backgroundColor: "rgba(22,18,31,0.9)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, maxWidth: "90%" },
  toastText: { fontFamily: FONT, fontSize: 14, color: "#fff", textAlign: "center" },
  sheetTitle: { fontSize: 19, ...f("600"), color: colors.ink, marginBottom: 4 },
  inputWrap: { borderRadius: 18, paddingHorizontal: 14, marginVertical: 12 },
  input: { fontFamily: FONT, minHeight: 70, fontSize: 16, color: colors.ink, paddingVertical: 12, textAlignVertical: "top" },
});

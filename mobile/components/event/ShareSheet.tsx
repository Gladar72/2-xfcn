import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Btn, Glass } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";
import { API_URL } from "@/lib/config";
import { tapOk } from "@/lib/feedback";
import { colors, FONT } from "@/lib/theme";

/**
 * «Поделиться событием» — как в мини-приложении: картинка для сторис от сервера
 * (/api/events/[id]/story.png), Telegram, сторис Instagram, WhatsApp, ВКонтакте, «Ещё», ссылка.
 *
 * Instagram не принимает ссылку от приложения: ссылку копируем заранее, картинку (с пунктирной
 * рамкой ?ig=1) отдаём в системное окно «Поделиться» → Instagram → «История», а человек сам
 * ставит стикер «Ссылка» в рамку.
 */
type Target = "tg" | "ig" | "wa" | "vk" | "more";

const TARGETS: { k: Target; label: string; bg: [string, string, ...string[]] }[] = [
  { k: "tg", label: "Telegram", bg: ["#2AABEE", "#2AABEE"] },
  { k: "ig", label: "Сторис\nInstagram", bg: ["#F9A13A", "#E1306C", "#8A3AB9"] },
  { k: "wa", label: "WhatsApp", bg: ["#25D366", "#25D366"] },
  { k: "vk", label: "ВКонтакте", bg: ["#0077FF", "#0077FF"] },
  { k: "more", label: "Ещё", bg: [colors.ink, colors.ink] },
];

function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Значок на цветной плашке: свои иконки, для WhatsApp и VK — короткая подпись. */
function Glyph({ k }: { k: Target }) {
  if (k === "tg") return <Icon name="tg" color="#fff" size={26} />;
  if (k === "more") return <Icon name="share" color="#fff" size={24} />;
  if (k === "ig") return <Icon name="camera" color="#fff" size={25} />;
  return <Text style={styles.glyphText}>{k === "wa" ? "WA" : "VK"}</Text>;
}

export function ShareSheet({
  visible,
  onClose,
  eventId,
  title,
  when,
  version,
}: {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  title: string;
  when: string;
  /** Обложка/место/занятость — от них зависит адрес картинки, чтобы не взять старую из кэша. */
  version?: string;
}) {
  const [mode, setMode] = useState<"list" | "ig">("list");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const link = `https://mesto-go.ru/e/${eventId}`;
  const text = `${title} — ${when}. Пойдёшь со мной? 🙌`;
  const v = hashKey(`s3|${version ?? ""}|${title}|${when}`);
  const storyUrl = `${API_URL}/api/events/${eventId}/story.png?v=${v}`;
  const igUrl = `${storyUrl}&ig=1`;

  useEffect(() => {
    if (visible) {
      setMode("list");
      setCopied(false);
    }
  }, [visible]);

  async function open(url: string) {
    await Linking.openURL(url).catch(() => {});
  }

  /** Скачивает картинку во временную папку и открывает системное окно «Поделиться» с файлом. */
  async function shareImage(url: string): Promise<boolean> {
    if (!(await Sharing.isAvailableAsync().catch(() => false))) return false;
    try {
      const file = `${FileSystem.cacheDirectory}mesto-story-${eventId}-${v}.png`;
      const info = await FileSystem.getInfoAsync(file);
      if (!info.exists) await FileSystem.downloadAsync(url, file);
      await Sharing.shareAsync(file, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Сторис «Места»" });
      return true;
    } catch {
      return false;
    }
  }

  async function pick(k: Target) {
    if (k === "tg") {
      await open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
      onClose();
    } else if (k === "ig") {
      await Clipboard.setStringAsync(link).catch(() => {});
      setMode("ig");
    } else if (k === "wa") {
      await open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${link}`)}`);
      onClose();
    } else if (k === "vk") {
      await open(`https://vk.com/share.php?url=${encodeURIComponent(link)}&title=${encodeURIComponent(title)}`);
      onClose();
    } else {
      await Share.share({ message: `${text}\n${link}` }).catch(() => {});
      onClose();
    }
  }

  async function openInstagram() {
    setBusy(true);
    const ok = await shareImage(igUrl);
    setBusy(false);
    if (!ok) await open("https://www.instagram.com/");
  }

  async function copy() {
    await Clipboard.setStringAsync(`${text}\n${link}`).catch(() => {});
    tapOk();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const step = (n: number, t: string, s: string) => (
    <View style={styles.step}>
      <View style={styles.stepN}>
        <Text style={styles.stepNText}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 2, paddingTop: 3 }}>
        <Text style={styles.stepT}>{t}</Text>
        <Text style={styles.stepS}>{s}</Text>
      </View>
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose}>
      {mode === "list" ? (
        <View style={{ gap: 14 }}>
          <Text style={styles.h}>
            Поделиться <Text style={{ color: colors.violet }}>событием</Text>
          </Text>
          <Glass style={styles.preview}>
            <Image source={{ uri: storyUrl }} style={styles.thumb} contentFit="cover" transition={200} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.pTitle}>Мося собрал картинку для сторис</Text>
              <Text style={styles.pText}>Обложка, время, место и сколько свободно. Друзья увидят и откроют событие по ссылке.</Text>
            </View>
          </Glass>
          <View style={styles.row}>
            {TARGETS.map((t) => (
              <Pressable key={t.k} onPress={() => pick(t.k)} style={({ pressed }) => [styles.target, { transform: [{ scale: pressed ? 0.9 : 1 }] }]}>
                <LinearGradient colors={t.bg} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.tIcon}>
                  <Glyph k={t.k} />
                </LinearGradient>
                <Text style={styles.tLabel}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <Btn kind="o" title={copied ? "Ссылка скопирована" : "Скопировать ссылку"} icon={<Icon name={copied ? "check" : "copy"} />} onPress={copy} />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-end" }}>
            <Image source={{ uri: igUrl }} style={styles.thumbBig} contentFit="cover" transition={200} />
            <View style={{ flex: 1, gap: 8, paddingBottom: 6 }}>
              <View style={styles.okPill}>
                <Text style={styles.okText}>✓ Ссылка скопирована</Text>
              </View>
              <Text style={styles.h}>
                Сторис <Text style={{ color: colors.violet }}>готова</Text>
              </Text>
            </View>
          </View>
          <Glass style={styles.steps}>
            {step(1, "Выбери Instagram → «История»", "В окне «Поделиться» найди Instagram и нажми «История»")}
            {step(2, "Добавь стикер «Ссылка»", "Ссылка уже скопирована — вставь её в пунктирную рамку")}
            {step(3, "Опубликуй", "Друзья нажмут на стикер и сразу откроют событие")}
          </Glass>
          <Pressable onPress={openInstagram} disabled={busy} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.96 : 1 }], opacity: busy ? 0.7 : 1 }]}>
            <LinearGradient colors={["#F9A13A", "#E1306C", "#8A3AB9"]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.igBtn}>
              {busy ? <ActivityIndicator color="#fff" /> : <Icon name="camera" color="#fff" />}
              <Text style={styles.igText}>{busy ? "Готовлю картинку…" : "Открыть Instagram"}</Text>
            </LinearGradient>
          </Pressable>
          <Btn kind="o" title="Назад" onPress={() => setMode("list")} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  h: { fontFamily: FONT, fontSize: 24, fontWeight: "500", color: colors.ink, letterSpacing: -0.6 },
  preview: { flexDirection: "row", gap: 14, alignItems: "center", borderRadius: 20, padding: 12 },
  thumb: { width: 92, height: 164, borderRadius: 12, backgroundColor: "#1B1230" },
  thumbBig: { width: 110, height: 196, borderRadius: 14, backgroundColor: "#1B1230" },
  pTitle: { fontFamily: FONT, fontSize: 15.5, fontWeight: "600", color: colors.ink, lineHeight: 20 },
  pText: { fontFamily: FONT, fontSize: 13.5, color: colors.ink2, lineHeight: 19 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  target: { alignItems: "center", gap: 7, width: 62 },
  tIcon: { width: 56, height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tLabel: { fontFamily: FONT, fontSize: 11.5, lineHeight: 14, textAlign: "center", color: colors.ink2 },
  glyphText: { fontFamily: FONT, fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  okPill: { alignSelf: "flex-start", backgroundColor: "#E3F7EA", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  okText: { fontFamily: FONT, fontSize: 13, fontWeight: "600", color: "#1E8A4C" },
  steps: { borderRadius: 20, padding: 16, gap: 12 },
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepN: { width: 28, height: 28, borderRadius: 10, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  stepNText: { fontFamily: FONT, fontSize: 14, fontWeight: "700", color: "#fff" },
  stepT: { fontFamily: FONT, fontSize: 15, fontWeight: "600", color: colors.ink },
  stepS: { fontFamily: FONT, fontSize: 13.5, lineHeight: 19, color: colors.ink2 },
  igBtn: { height: 56, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  igText: { fontFamily: FONT, fontSize: 16.5, fontWeight: "600", color: "#fff" },
});

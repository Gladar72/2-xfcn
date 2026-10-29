import { useState } from "react";
import { Dimensions, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Sheet } from "@/components/Sheet";
import { Avatar } from "@/components/ui";
import { Icon, type IconName } from "@/components/Icon";
import { tapLight } from "@/lib/feedback";
import { INTEREST_STICKERS, MOSYA_STICKERS, REACTIONS, stickerUrl, type Sticker } from "@/lib/stickers";
import { colors, FONT, f } from "@/lib/theme";
import { type ChatMember, type ChatMessage, hasRead, timeOf } from "./types";

/** Панель стикеров под полем ввода (вместо клавиатуры): вкладки «Мося» и «Интересы». */
export function StickerPanel({ height, onPick }: { height: number; onPick: (slug: string) => void }) {
  const [tab, setTab] = useState<"mosya" | "interests">("mosya");
  const data: Sticker[] = tab === "mosya" ? MOSYA_STICKERS : INTEREST_STICKERS;
  const cols = 4;
  const size = Math.floor((Dimensions.get("window").width - 24) / cols);
  return (
    <View style={[styles.panel, { height }]}>
      <View style={styles.tabs}>
        {(
          [
            ["mosya", "Мося"],
            ["interests", "Интересы"],
          ] as const
        ).map(([k, label]) => (
          <Pressable
            key={k}
            onPress={() => {
              tapLight();
              setTab(k);
            }}
            style={[styles.tab, tab === k && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === k && { color: colors.violet }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        key={tab}
        data={data}
        numColumns={cols}
        keyExtractor={(s) => s.slug}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
        initialNumToRender={16}
        windowSize={5}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              tapLight();
              onPick(item.slug);
            }}
            style={({ pressed }) => [styles.cell, { width: size, height: size + (item.label ? 14 : 0) }, pressed && { transform: [{ scale: 0.9 }] }]}
          >
            <Image source={{ uri: stickerUrl(item.slug) }} style={{ width: size - 14, height: size - 14 }} contentFit="contain" recyclingKey={item.slug} />
            {item.label ? (
              <Text style={styles.cellLabel} numberOfLines={1}>
                {item.label}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

interface MenuProps {
  msg: ChatMessage | null;
  mine: boolean;
  canEdit: boolean;
  canWrite: boolean;
  group: boolean;
  onClose: () => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onReply: (m: ChatMessage) => void;
  onCopy: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onReaders: (m: ChatMessage) => void;
}

/** Долгое нажатие на сообщение: ряд реакций-Мось и действия. */
export function MessageMenu(p: MenuProps) {
  const m = p.msg;
  const temp = !!m && m.id.startsWith("temp-");
  const actions: { icon: IconName; label: string; danger?: boolean; run: (m: ChatMessage) => void; show: boolean }[] = m
    ? [
        { icon: "reply", label: "Ответить", run: p.onReply, show: p.canWrite && !m.deleted && !temp },
        { icon: "copy", label: "Копировать", run: p.onCopy, show: !m.deleted && !!m.content && !m.content.startsWith("[[") },
        { icon: "edit", label: "Изменить", run: p.onEdit, show: p.mine && p.canWrite && p.canEdit && !temp && !m.deleted && !!m.content && !m.content.startsWith("[[") },
        { icon: "eye", label: "Кто прочитал", run: p.onReaders, show: p.mine && p.group && !temp },
        { icon: "trash", label: "Удалить", danger: true, run: p.onDelete, show: p.mine && !m.deleted && !m.pending },
      ]
    : [];
  return (
    <Sheet visible={!!m} onClose={p.onClose}>
      {m && p.canWrite && !m.deleted && !temp ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reactRow}>
          {REACTIONS.map((r) => {
            const on = m.reactions.some((x) => x.emoji === r.slug && x.mine);
            return (
              <Pressable
                key={r.slug}
                onPress={() => {
                  tapLight();
                  p.onReact(m, r.slug);
                  p.onClose();
                }}
                style={({ pressed }) => [styles.reactBtn, on && styles.reactBtnOn, pressed && { transform: [{ scale: 1.15 }] }]}
              >
                <Image source={{ uri: stickerUrl(r.slug) }} style={{ width: 46, height: 46 }} contentFit="contain" />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={{ marginTop: 6 }}>
        {actions
          .filter((a) => a.show)
          .map((a) => (
            <Pressable
              key={a.label}
              onPress={() => {
                p.onClose();
                if (m) setTimeout(() => a.run(m), 250);
              }}
              style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.lav }]}
            >
              <Icon name={a.icon} size={20} color={a.danger ? colors.danger : colors.ink} />
              <Text style={[styles.actionText, a.danger && { color: colors.danger }]}>{a.label}</Text>
            </Pressable>
          ))}
      </View>
    </Sheet>
  );
}

/** «Кто прочитал»: участники, у которых last_read_at ≥ времени сообщения, и реакции. */
export function ReadersSheet({ msg, members, onClose }: { msg: ChatMessage | null; members: ChatMember[]; onClose: () => void }) {
  const read = msg ? members.filter((m) => hasRead(m, msg.createdAt)) : [];
  const unread = msg ? members.filter((m) => !hasRead(m, msg.createdAt)) : [];
  const reactOf = (id: string) => msg?.reactions.find((r) => r.userIds.includes(id))?.emoji;
  const Row = ({ m, done }: { m: ChatMember; done: boolean }) => {
    const r = reactOf(m.id);
    return (
      <View style={styles.reader}>
        <Avatar uri={m.avatarUrl} name={m.name} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={styles.readerName}>{m.name}</Text>
          <Text style={styles.readerSub}>{done ? `Прочитано${m.lastReadAt ? ` · ${timeOf(m.lastReadAt)}` : ""}` : "Ещё не прочитал(а)"}</Text>
        </View>
        {r ? <Image source={{ uri: stickerUrl(r) }} style={{ width: 30, height: 30 }} contentFit="contain" /> : null}
        {done ? <Icon name="check" size={16} color={colors.violet} strokeWidth={2.4} /> : null}
      </View>
    );
  };
  return (
    <Sheet visible={!!msg} onClose={onClose}>
      <Text style={styles.sheetTitle}>Кто прочитал</Text>
      <ScrollView style={{ maxHeight: 420, flexShrink: 1 }}>
        {read.map((m) => (
          <Row key={m.id} m={m} done />
        ))}
        {unread.map((m) => (
          <Row key={m.id} m={m} done={false} />
        ))}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: "rgba(255,255,255,0.96)", borderTopWidth: 1, borderTopColor: "rgba(108,59,255,0.08)" },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 },
  tabOn: { backgroundColor: colors.lav },
  tabText: { fontSize: 14, ...f("600"), color: colors.grey },
  cell: { alignItems: "center", justifyContent: "center" },
  cellLabel: { fontFamily: FONT, fontSize: 10.5, color: colors.grey, marginTop: -2 },
  reactRow: { gap: 6, paddingHorizontal: 4, paddingVertical: 4 },
  reactBtn: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.milk },
  reactBtnOn: { backgroundColor: "#E7DCFF", borderWidth: 2, borderColor: colors.violet },
  action: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 14 },
  actionText: { fontFamily: FONT, fontSize: 16, color: colors.ink },
  sheetTitle: { fontSize: 18, ...f("600"), color: colors.ink, marginBottom: 10 },
  reader: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  readerName: { fontSize: 15, ...f("500"), color: colors.ink },
  readerSub: { fontFamily: FONT, fontSize: 12.5, color: colors.grey, marginTop: 1 },
});

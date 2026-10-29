import { memo, useRef } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Avatar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { tapLight } from "@/lib/feedback";
import { parseInvite, parseSticker, stickerUrl } from "@/lib/stickers";
import { brandGradient, colors, FONT, gradientEnd, gradientStart, f } from "@/lib/theme";
import { type ChatMember, type ChatMessage, timeOf } from "./types";

export type ReadState = "pending" | "failed" | "sent" | "partial" | "read";

interface Props {
  msg: ChatMessage;
  mine: boolean;
  /** Первое (верхнее) сообщение в пачке одного автора — показываем имя. */
  first: boolean;
  /** Последнее (нижнее) в пачке — хвостик пузыря и аватар. */
  last: boolean;
  group: boolean;
  sender?: ChatMember;
  senderName: (id: string) => string;
  readState: ReadState;
  highlighted?: boolean;
  onLongPress: (m: ChatMessage) => void;
  onReply: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onOpenImage: (uri: string) => void;
  onJumpTo: (id: string) => void;
  onRetry: (m: ChatMessage) => void;
}

function Ticks({ state, light }: { state: ReadState; light?: boolean }) {
  const c = light ? "rgba(255,255,255,0.92)" : colors.violet;
  if (state === "pending") return <Icon name="clock" size={12} color={light ? "rgba(255,255,255,0.8)" : colors.grey} strokeWidth={2} />;
  if (state === "failed") return <Icon name="close" size={12} color={colors.danger} strokeWidth={2.4} />;
  if (state === "sent") return <Icon name="check" size={13} color={light ? "rgba(255,255,255,0.75)" : colors.grey} strokeWidth={2.4} />;
  // Две галочки: прочитали все — яркие, часть участников — полупрозрачные.
  const op = state === "read" ? 1 : 0.55;
  return (
    <View style={{ flexDirection: "row", opacity: op }}>
      <Icon name="check" size={13} color={c} strokeWidth={2.4} />
      <View style={{ marginLeft: -7 }}>
        <Icon name="check" size={13} color={c} strokeWidth={2.4} />
      </View>
    </View>
  );
}

function Meta({ msg, mine, readState, light }: { msg: ChatMessage; mine: boolean; readState: ReadState; light?: boolean }) {
  return (
    <View style={styles.meta}>
      {msg.editedAt && !msg.deleted ? <Text style={[styles.metaText, light && styles.metaLight]}>изм.</Text> : null}
      <Text style={[styles.metaText, light && styles.metaLight]}>{timeOf(msg.createdAt)}</Text>
      {mine ? <Ticks state={readState} light={light} /> : null}
    </View>
  );
}

function Reactions({ msg, mine, onReact }: { msg: ChatMessage; mine: boolean; onReact: (m: ChatMessage, e: string) => void }) {
  if (!msg.reactions.length) return null;
  return (
    <View style={[styles.reactions, mine ? { justifyContent: "flex-end" } : null]}>
      {msg.reactions.map((r) => (
        <Pressable
          key={r.emoji}
          onPress={() => {
            tapLight();
            onReact(msg, r.emoji);
          }}
          style={[styles.reactChip, r.mine && styles.reactChipMine]}
        >
          {r.emoji.startsWith("mosya_") ? (
            <Image source={{ uri: stickerUrl(r.emoji) }} style={{ width: 22, height: 22 }} contentFit="contain" />
          ) : (
            <Text style={{ fontFamily: FONT, fontSize: 15 }}>{r.emoji}</Text>
          )}
          {r.count > 1 ? <Text style={[styles.reactCount, r.mine && { color: colors.violet }]}>{r.count}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

function BubbleImpl(p: Props) {
  const { msg, mine } = p;
  const tx = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);
  const latest = useRef(p);
  latest.current = p;

  // Свайп влево (своё) / вправо (чужое) — «Ответить», как в Telegram.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => !latest.current.msg.deleted && !latest.current.msg.id.startsWith("temp-") && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6 && (latest.current.mine ? g.dx < 0 : g.dx > 0),
      onPanResponderMove: (_e, g) => {
        const d = latest.current.mine ? Math.max(-80, Math.min(0, g.dx)) : Math.min(80, Math.max(0, g.dx));
        tx.setValue(d);
        if (!fired.current && Math.abs(d) >= 60) {
          fired.current = true;
          tapLight();
        }
      },
      onPanResponderRelease: () => {
        if (fired.current) latest.current.onReply(latest.current.msg);
        fired.current = false;
        Animated.spring(tx, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 260 }).start();
      },
      onPanResponderTerminate: () => {
        fired.current = false;
        Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const sticker = !msg.deleted ? parseSticker(msg.content) : null;
  const invite = !msg.deleted ? parseInvite(msg.content) : null;
  const image = msg.localImage || msg.imageUrl;
  const showName = p.group && !mine && p.first;
  const replyIconOpacity = tx.interpolate({ inputRange: mine ? [-60, -20, 0] : [0, 20, 60], outputRange: mine ? [1, 0.2, 0] : [0, 0.2, 1] });

  let body;
  if (sticker) {
    body = (
      <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
        {showName ? <Text style={[styles.sender, { marginLeft: 6 }]}>{p.senderName(msg.senderId)}</Text> : null}
        {msg.replyTo ? <ReplyQuote reply={msg.replyTo} mine={false} name={p.senderName(msg.replyTo.senderId)} onPress={() => p.onJumpTo(msg.replyTo!.id)} /> : null}
        <Image source={{ uri: stickerUrl(sticker) }} style={styles.sticker} contentFit="contain" transition={120} />
        <View style={styles.stickerMeta}>
          <Meta msg={msg} mine={mine} readState={p.readState} />
        </View>
      </View>
    );
  } else {
    const inner = (
      <>
        {showName ? <Text style={styles.sender}>{p.senderName(msg.senderId)}</Text> : null}
        {msg.replyTo ? <ReplyQuote reply={msg.replyTo} mine={mine} name={p.senderName(msg.replyTo.senderId)} onPress={() => p.onJumpTo(msg.replyTo!.id)} /> : null}
        {msg.deleted ? (
          <Text style={[styles.deleted, mine && { color: "rgba(255,255,255,0.8)" }]}>Сообщение удалено</Text>
        ) : (
          <>
            {image ? (
              <Pressable onPress={() => p.onOpenImage(image)} onLongPress={() => p.onLongPress(msg)} delayLongPress={320}>
                <Image source={{ uri: image }} style={styles.image} contentFit="cover" transition={150} />
              </Pressable>
            ) : null}
            {invite ? (
              <Pressable onPress={() => router.push(`/event/${invite}`)} style={[styles.invite, mine && { backgroundColor: "rgba(255,255,255,0.18)" }]}>
                <Icon name="cal" size={20} color={mine ? "#fff" : colors.violet} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inviteTitle, mine && { color: "#fff" }]}>Приглашение на встречу</Text>
                  <Text style={[styles.inviteSub, mine && { color: "rgba(255,255,255,0.8)" }]}>Нажми, чтобы открыть</Text>
                </View>
                <Icon name="chev" size={16} color={mine ? "#fff" : colors.grey} />
              </Pressable>
            ) : msg.content ? (
              <Text style={[styles.text, mine && { color: "#fff" }]} selectable={false}>
                {msg.content}
                {/* место под время, чтобы оно не наезжало на последнюю строку */}
                <Text style={styles.spacer}>{mine ? "  00:00 ✓✓ " : "  00:00 "}{msg.editedAt ? "изм. " : ""}</Text>
              </Text>
            ) : null}
          </>
        )}
        <View style={styles.metaAbs}>
          <Meta msg={msg} mine={mine} readState={p.readState} light={mine} />
        </View>
      </>
    );
    const radius = {
      borderTopLeftRadius: !mine && !p.first ? 8 : 20,
      borderBottomLeftRadius: !mine && !p.last ? 8 : !mine ? 6 : 20,
      borderTopRightRadius: mine && !p.first ? 8 : 20,
      borderBottomRightRadius: mine && !p.last ? 8 : mine ? 6 : 20,
    };
    body = mine ? (
      <LinearGradient colors={brandGradient} start={gradientStart} end={gradientEnd} style={[styles.bubble, radius, image && !msg.content ? styles.imageOnly : null]}>
        {inner}
      </LinearGradient>
    ) : (
      <View style={[styles.bubble, styles.theirs, radius, image && !msg.content ? styles.imageOnly : null]}>{inner}</View>
    );
  }

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, { marginTop: p.first ? 8 : 2 }, p.highlighted && styles.highlight]}>
      <Animated.View pointerEvents="none" style={[styles.replyIcon, mine ? { right: 6 } : { left: 6 }, { opacity: replyIconOpacity }]}>
        <Icon name="reply" size={18} color={colors.violet} />
      </Animated.View>
      {p.group && !mine ? (
        <View style={styles.avatarSlot}>{p.last ? <Avatar uri={p.sender?.avatarUrl} name={p.sender?.name} size={30} /> : null}</View>
      ) : null}
      <Animated.View style={{ maxWidth: "80%", transform: [{ translateX: tx }] }} {...pan.panHandlers}>
        <Pressable
          onLongPress={() => p.onLongPress(msg)}
          delayLongPress={320}
          onPress={msg.failed ? () => p.onRetry(msg) : undefined}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
        >
          {body}
        </Pressable>
        {msg.failed ? <Text style={styles.failed}>Не отправлено · нажми, чтобы повторить</Text> : null}
        <Reactions msg={msg} mine={mine} onReact={p.onReact} />
      </Animated.View>
    </View>
  );
}

export const Bubble = memo(BubbleImpl);

export function ReplyQuote({ reply, mine, name, onPress }: { reply: ChatMessage["replyTo"]; mine: boolean; name: string; onPress?: () => void }) {
  if (!reply) return null;
  const sticker = parseSticker(reply.content);
  const text = reply.deleted ? "Сообщение удалено" : sticker ? "Стикер" : parseInvite(reply.content) ? "Приглашение на встречу" : reply.content || (reply.imageUrl ? "Фото" : "");
  return (
    <Pressable onPress={onPress} style={[styles.quote, mine ? styles.quoteMine : styles.quoteTheirs]}>
      {reply.imageUrl && !reply.deleted ? <Image source={{ uri: reply.imageUrl }} style={styles.quoteThumb} contentFit="cover" /> : null}
      {sticker ? <Image source={{ uri: stickerUrl(sticker) }} style={styles.quoteThumb} contentFit="contain" /> : null}
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.quoteName, mine && { color: "#fff" }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.quoteText, mine && { color: "rgba(255,255,255,0.85)" }]} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 10, borderRadius: 12 },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  highlight: { backgroundColor: "rgba(108,59,255,0.10)" },
  avatarSlot: { width: 34, marginRight: 2 },
  replyIcon: { position: "absolute", top: "40%", width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  bubble: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, minWidth: 72 },
  theirs: { backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: "rgba(255,255,255,1)" },
  imageOnly: { padding: 4, paddingBottom: 4 },
  sender: { fontSize: 13, color: colors.violet, ...f("600"), marginBottom: 2 },
  text: { fontFamily: FONT, fontSize: 16, color: colors.ink, lineHeight: 21 },
  spacer: { fontFamily: FONT, fontSize: 11, color: "transparent" },
  deleted: { fontFamily: FONT, fontSize: 15, fontStyle: "italic", color: colors.grey, paddingRight: 52 },
  image: { width: 230, height: 230, borderRadius: 16, marginBottom: 2 },
  metaAbs: { position: "absolute", right: 10, bottom: 6 },
  meta: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontFamily: FONT, fontSize: 11, color: colors.grey },
  metaLight: { color: "rgba(255,255,255,0.85)" },
  sticker: { width: 150, height: 150 },
  stickerMeta: { backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginTop: -6 },
  invite: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, backgroundColor: colors.lav, minWidth: 220, marginBottom: 14 },
  inviteTitle: { fontSize: 15, ...f("600"), color: colors.ink },
  inviteSub: { fontFamily: FONT, fontSize: 12, color: colors.grey, marginTop: 1 },
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 },
  reactChip: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: "rgba(108,59,255,0.12)" },
  reactChipMine: { borderColor: colors.violet, backgroundColor: "#F1EBFF" },
  reactCount: { fontSize: 12, color: colors.ink2, ...f("600") },
  failed: { fontFamily: FONT, fontSize: 11, color: colors.danger, marginTop: 2, textAlign: "right" },
  quote: { flexDirection: "row", alignItems: "center", gap: 8, borderLeftWidth: 3, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 5 },
  quoteMine: { borderLeftColor: "#fff", backgroundColor: "rgba(255,255,255,0.18)" },
  quoteTheirs: { borderLeftColor: colors.violet, backgroundColor: colors.lav },
  quoteThumb: { width: 32, height: 32, borderRadius: 6 },
  quoteName: { fontSize: 13, ...f("600"), color: colors.violet },
  quoteText: { fontFamily: FONT, fontSize: 13, color: colors.ink2 },
});

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Aurora, Glass, Grad, RoundBtn } from "@/components/brand";
import { Avatar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ConfirmSheet } from "@/components/Sheet";
import { Bubble, ReplyQuote, type ReadState } from "@/components/chat/Bubble";
import { MessageMenu, ReadersSheet, StickerPanel } from "@/components/chat/Panels";
import {
  type ChatInfo,
  type ChatMember,
  type ChatMessage,
  dayLabel,
  hasRead,
  isOnline,
  lastSeenText,
  ms,
  sameDay,
  sameGroup,
  shapeReactions,
} from "@/components/chat/types";
import { api, ApiError } from "@/lib/api";
import { tapLight, tapOk, tapWarn } from "@/lib/feedback";
import { getMyId } from "@/lib/me";
import { plural, qs } from "@/lib/format";
import { subscribeConversation } from "@/lib/realtime";
import { stickerContent, stickerUrl } from "@/lib/stickers";
import { colors, FONT } from "@/lib/theme";

const PAGE = 50;
const EDIT_WINDOW_MS = 48 * 3600_000;

let tempSeq = 0;

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [me, setMe] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]); // по возрастанию времени
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [info, setInfo] = useState<Omit<ChatInfo, "messages" | "hasMore"> | null>(null);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [readonly, setReadonly] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [panel, setPanel] = useState<"none" | "stickers">("none");
  const [kbHeight, setKbHeight] = useState(0);
  const lastKb = useRef(0);
  const [menuMsg, setMenuMsg] = useState<ChatMessage | null>(null);
  const [readersMsg, setReadersMsg] = useState<ChatMessage | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<ChatMessage | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const [highlight, setHighlight] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const list = useRef<FlatList<ChatMessage>>(null);
  const input = useRef<TextInput>(null);
  const meRef = useRef<string | null>(null);
  const readonlyRef = useRef(false);
  const lastTypingSent = useRef(0);
  const markTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  const isGroup = !!info?.eventId;
  const canWrite = !readonly && !blocked;

  const showToast = useCallback(
    (t: string) => {
      setToast(t);
      toastAnim.setValue(0);
      Animated.sequence([
        Animated.timing(toastAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(1600),
        Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setToast(null);
      });
    },
    [toastAnim]
  );

  // ---------- загрузка ----------

  const fetchPage = useCallback(
    async (before?: string) => {
      const params = { limit: PAGE, before, readonly: readonlyRef.current ? 1 : undefined };
      try {
        return await api<ChatInfo>(`/api/conversations/${id}/messages?${qs(params)}`);
      } catch (e) {
        // Встреча завершена — чат открывается только для чтения (архив).
        if (e instanceof ApiError && e.code === "event_closed" && !readonlyRef.current) {
          readonlyRef.current = true;
          setReadonly(true);
          return await api<ChatInfo>(`/api/conversations/${id}/messages?${qs({ ...params, readonly: 1 })}`);
        }
        throw e;
      }
    },
    [id]
  );

  const markRead = useCallback(() => {
    if (markTimer.current) clearTimeout(markTimer.current);
    markTimer.current = setTimeout(() => {
      if (AppState.currentState !== "active") return;
      api(`/api/conversations/${id}`, { method: "PATCH", body: { action: "mark_read" } }).catch(() => {});
    }, 400);
  }, [id]);

  /** Слить свежую страницу с тем, что уже на экране (опрос без realtime / возврат из фона). */
  const mergeLatest = useCallback((fresh: ChatMessage[], freshHasMore?: boolean) => {
    setMessages((prev) => {
      if (!prev.length) return fresh;
      // Пропущено больше страницы (долго были в фоне) — без пересечения со старым списком
      // заменяем его целиком, иначе в середине истории осталась бы дыра.
      const confirmed = prev.filter((m) => !m.id.startsWith("temp-"));
      if (fresh.length && confirmed.length && !fresh.some((m) => confirmed.some((c) => c.id === m.id)) && ms(fresh[0]!.createdAt) > ms(confirmed[confirmed.length - 1]!.createdAt)) {
        if (freshHasMore !== undefined) setHasMore(freshHasMore);
        return [...fresh, ...prev.filter((m) => m.id.startsWith("temp-"))];
      }
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of fresh) byId.set(m.id, { ...byId.get(m.id), ...m, pending: false, failed: false, localImage: null });
      return Array.from(byId.values()).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetchPage();
      mergeLatest(r.messages, r.hasMore);
      setMembers(r.members);
      setInfo((old) => old ?? r);
      setLoadError(null);
    } catch {}
  }, [fetchPage, mergeLatest]);

  useEffect(() => {
    let alive = true;
    getMyId().then((v) => {
      meRef.current = v;
      if (alive) setMe(v);
    });
    (async () => {
      try {
        const r = await fetchPage();
        if (!alive) return;
        // Сообщения, пришедшие по realtime раньше ответа, не теряем.
        mergeLatest(r.messages);
        setHasMore(r.hasMore);
        setInfo(r);
        setMembers(r.members);
        markRead();
      } catch (e) {
        if (!alive) return;
        setLoadError(e instanceof ApiError && e.status === 403 ? "Нет доступа к этому чату" : "Не удалось загрузить чат");
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchPage, markRead, mergeLatest]);

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder || !messages.length) return;
    setLoadingOlder(true);
    try {
      const r = await fetchPage(messages[0]!.createdAt);
      setMessages((prev) => {
        const have = new Set(prev.map((m) => m.id));
        return [...r.messages.filter((m) => !have.has(m.id)), ...prev];
      });
      setHasMore(r.hasMore);
    } catch {}
    setLoadingOlder(false);
  }, [hasMore, loadingOlder, messages, fetchPage]);

  // ---------- realtime ----------

  useEffect(() => {
    const unsub = subscribeConversation(
      id,
      (event, p) => {
        const meId = meRef.current;
        switch (event) {
          case "message": {
            const m = p as unknown as ChatMessage;
            const incoming: ChatMessage = { ...m, reactions: m.reactions ?? [], replyTo: m.replyTo ?? null, editedAt: m.editedAt ?? null, deleted: !!m.deleted };
            setMessages((prev) => {
              if (prev.some((x) => x.id === m.id)) return prev;
              // Своё сообщение вернулось через канал раньше ответа на POST — заменяем временное.
              if (m.senderId === meId) {
                const i = prev.findIndex((x) => x.pending && x.id.startsWith("temp-") && x.content === m.content && !!x.localImage === !!m.imageUrl);
                if (i >= 0) {
                  const next = [...prev];
                  next[i] = { ...incoming, localImage: prev[i]!.localImage };
                  return next.sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
                }
              }
              return [...prev, incoming];
            });
            setTyping((t) => {
              if (!t[m.senderId]) return t;
              const n = { ...t };
              delete n[m.senderId];
              return n;
            });
            if (m.senderId !== meId) markRead();
            break;
          }
          case "read": {
            const { userId, lastReadAt } = p as { userId: string; lastReadAt: string };
            setMembers((prev) => prev.map((x) => (x.id === userId ? { ...x, lastReadAt, lastActiveAt: lastReadAt } : x)));
            break;
          }
          case "edit": {
            const { id: mid, content, editedAt } = p as { id: string; content: string; editedAt: string };
            setMessages((prev) => prev.map((x) => (x.id === mid ? { ...x, content, editedAt } : x)));
            break;
          }
          case "delete": {
            const { id: mid } = p as { id: string };
            setMessages((prev) => prev.map((x) => (x.id === mid ? { ...x, deleted: true, content: "", imageUrl: null, reactions: [] } : x)));
            break;
          }
          case "reaction": {
            const { id: mid, reactions } = p as { id: string; reactions: { emoji: string; userIds: string[] }[] };
            setMessages((prev) => prev.map((x) => (x.id === mid ? { ...x, reactions: shapeReactions(reactions, meId) } : x)));
            break;
          }
          case "typing": {
            const { userId, name } = p as { userId: string; name: string };
            if (userId === meId) break;
            setTyping((t) => ({ ...t, [userId]: { name, until: Date.now() + 5000 } }));
            break;
          }
        }
      },
      setLive
    );
    return unsub;
  }, [id, markRead]);

  // Соединение восстановилось — догружаем всё, что пришло за время обрыва.
  const wasLive = useRef(false);
  useEffect(() => {
    if (live && !wasLive.current && info) refresh();
    wasLive.current = live;
  }, [live, info, refresh]);

  // Пока чат открыт — регулярно отмечаемся прочитавшими: сервер не шлёт push тем,
  // кто читал чат последние 20 секунд.
  useEffect(() => {
    const t = setInterval(() => {
      if (AppState.currentState === "active") markRead();
    }, 15000);
    return () => clearInterval(t);
  }, [markRead]);

  // Без живого соединения — редкий опрос; при возврате в приложение — догружаем и отмечаем прочитанным.
  useEffect(() => {
    const t = setInterval(() => {
      if (!live && AppState.currentState === "active") refresh();
    }, 8000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        refresh();
        markRead();
      }
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [live, refresh, markRead]);

  // «печатает…» гаснет само через 5 секунд.
  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const t = setTimeout(() => {
      const now = Date.now();
      setTyping((cur) => Object.fromEntries(Object.entries(cur).filter(([, v]) => v.until > now)));
    }, 1000);
    return () => clearTimeout(t);
  }, [typing]);

  // Клавиатура и панель стикеров занимают одно место — как в Telegram.
  useEffect(() => {
    const s1 = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      setKbHeight(e.endCoordinates.height);
      lastKb.current = e.endCoordinates.height;
      setPanel("none");
    });
    const s2 = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKbHeight(0));
    return () => {
      s1.remove();
      s2.remove();
    };
  }, []);

  // ---------- отправка ----------

  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 3000) return;
    lastTypingSent.current = now;
    api(`/api/conversations/${id}/typing`, { method: "POST" }).catch(() => {});
  }, [id]);

  const scrollToBottom = () => list.current?.scrollToOffset({ offset: 0, animated: true });

  const bodies = useRef(new Map<string, { content?: string; image?: string; replyToId?: string }>());

  const postMessage = useCallback(
    async (temp: ChatMessage, body: { content?: string; image?: string; replyToId?: string }) => {
      bodies.current.set(temp.id, body);
      try {
        const r = await api<{ messageId: string; createdAt: string; imageUrl: string | null }>(`/api/conversations/${id}/messages`, { body });
        setMessages((prev) => {
          // broadcast мог прийти раньше ответа — тогда просто убираем временное.
          if (prev.some((x) => x.id === r.messageId)) return prev.filter((x) => x.id !== temp.id);
          return prev
            .map((x) => (x.id === temp.id ? { ...x, id: r.messageId, createdAt: r.createdAt, imageUrl: r.imageUrl ?? x.imageUrl, pending: false } : x))
            .sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
        });
        bodies.current.delete(temp.id);
        tapLight();
      } catch (e) {
        const code = e instanceof ApiError ? e.code : "";
        if (code === "blocked") setBlocked(true);
        if (code === "event_closed") {
          readonlyRef.current = true;
          setReadonly(true);
        }
        setMessages((prev) => prev.map((x) => (x.id === temp.id ? { ...x, pending: false, failed: true } : x)));
        tapWarn();
      }
    },
    [id]
  );

  const sendNew = useCallback(
    (content: string, extra?: { image?: string; localImage?: string }): boolean => {
      if (!meRef.current) {
        // Свой id ещё не узнали (не было сети при открытии) — пробуем снова, текст не теряем.
        getMyId().then((v) => {
          meRef.current = v;
          setMe(v);
        });
        showToast("Нет связи — попробуй ещё раз");
        return false;
      }
      const temp: ChatMessage = {
        id: `temp-${++tempSeq}`,
        senderId: meRef.current,
        content,
        imageUrl: null,
        localImage: extra?.localImage ?? null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        replyTo: replyTo
          ? { id: replyTo.id, senderId: replyTo.senderId, content: replyTo.content.slice(0, 200), imageUrl: replyTo.imageUrl, deleted: replyTo.deleted }
          : null,
        reactions: [],
        pending: true,
      };
      setMessages((prev) => [...prev, temp]);
      const body = { content: content || undefined, image: extra?.image, replyToId: replyTo?.id };
      setReplyTo(null);
      requestAnimationFrame(scrollToBottom);
      postMessage(temp, body);
      return true;
    },
    [replyTo, postMessage, showToast]
  );

  const onSend = useCallback(async () => {
    const content = text.trim();
    if (!content) return;
    if (editing) {
      const target = editing;
      setEditing(null);
      setText("");
      if (content === target.content) return;
      setMessages((prev) => prev.map((x) => (x.id === target.id ? { ...x, content, editedAt: new Date().toISOString() } : x)));
      try {
        await api(`/api/conversations/${id}/messages/${target.id}`, { method: "PATCH", body: { content } });
        tapOk();
      } catch (e) {
        setMessages((prev) => prev.map((x) => (x.id === target.id && x.content === content && !x.deleted ? { ...x, content: target.content, editedAt: target.editedAt } : x)));
        showToast(e instanceof ApiError && e.code === "edit_expired" ? "Изменить можно в течение 48 часов" : "Не удалось изменить");
      }
      return;
    }
    if (sendNew(content)) setText("");
  }, [text, editing, id, sendNew, showToast]);

  const onRetry = useCallback(
    (m: ChatMessage) => {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, failed: false, pending: true } : x)));
      postMessage(m, bodies.current.get(m.id) ?? { content: m.content || undefined, replyToId: m.replyTo?.id });
    },
    [postMessage]
  );

  const pickPhoto = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    const out = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 1280 } }], {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (!out.base64) return;
    const caption = text.trim();
    if (sendNew(caption, { image: `data:image/jpeg;base64,${out.base64}`, localImage: out.uri })) setText("");
  }, [text, sendNew]);

  const sendSticker = useCallback(
    (slug: string) => {
      sendNew(stickerContent(slug));
    },
    [sendNew]
  );

  // ---------- действия с сообщением ----------

  const react = useCallback(
    async (m: ChatMessage, emoji: string) => {
      if (!canWrite || m.pending) return;
      const meId = meRef.current;
      if (!meId) return;
      // Оптимистично: одна реакция на человека — повторный тап снимает.
      setMessages((prev) =>
        prev.map((x) => {
          if (x.id !== m.id) return x;
          const had = x.reactions.find((r) => r.mine)?.emoji;
          const lists = x.reactions.map((r) => ({ emoji: r.emoji, userIds: r.userIds.filter((u) => u !== meId) })).filter((r) => r.userIds.length);
          if (had !== emoji) {
            const ex = lists.find((r) => r.emoji === emoji);
            if (ex) ex.userIds.push(meId);
            else lists.push({ emoji, userIds: [meId] });
          }
          return { ...x, reactions: shapeReactions(lists, meId) };
        })
      );
      try {
        const r = await api<{ reactions: { emoji: string; userIds: string[] }[] }>(`/api/conversations/${id}/messages/${m.id}/reactions`, { body: { emoji } });
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: shapeReactions(r.reactions, meId) } : x)));
      } catch {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: m.reactions } : x)));
      }
    },
    [id, canWrite]
  );

  const startReply = useCallback(
    (m: ChatMessage) => {
      if (!canWrite) return;
      setEditing(null);
      setReplyTo(m);
      input.current?.focus();
    },
    [canWrite]
  );

  const onCopy = useCallback(
    async (m: ChatMessage) => {
      await Clipboard.setStringAsync(m.content);
      tapOk();
      showToast("Скопировано");
    },
    [showToast]
  );

  const onEdit = useCallback((m: ChatMessage) => {
    setReplyTo(null);
    setEditing(m);
    setText(m.content);
    setTimeout(() => input.current?.focus(), 50);
  }, []);

  const doDelete = useCallback(async () => {
    const m = deleteMsg;
    setDeleteMsg(null);
    if (!m) return;
    if (m.id.startsWith("temp-")) {
      // Не ушедшее на сервер — просто убираем с экрана.
      bodies.current.delete(m.id);
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
      return;
    }
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted: true, content: "", imageUrl: null, reactions: [] } : x)));
    try {
      await api(`/api/conversations/${id}/messages/${m.id}`, { method: "DELETE" });
      tapOk();
    } catch {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted: false, content: m.content, imageUrl: m.imageUrl, reactions: m.reactions } : x)));
      showToast("Не удалось удалить");
    }
  }, [deleteMsg, id, showToast]);

  const jumpTo = useCallback(
    (mid: string) => {
      const idx = [...messages].reverse().findIndex((m) => m.id === mid);
      if (idx < 0) {
        showToast("Сообщение выше — пролистай историю");
        return;
      }
      list.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      setHighlight(mid);
      setTimeout(() => setHighlight((h) => (h === mid ? null : h)), 1400);
    },
    [messages, showToast]
  );

  // ---------- вычисления для отрисовки ----------

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const senderName = useCallback(
    (sid: string) => (sid === meRef.current ? "Вы" : memberById.get(sid)?.name ?? "Участник"),
    [memberById]
  );

  const readStateOf = useCallback(
    (m: ChatMessage): ReadState => {
      if (m.failed) return "failed";
      if (m.pending) return "pending";
      if (!members.length) return "sent";
      const n = members.filter((x) => hasRead(x, m.createdAt)).length;
      if (n === 0) return "sent";
      return n >= members.length ? "read" : "partial";
    },
    [members]
  );

  const reversed = useMemo(() => [...messages].reverse(), [messages]);

  const other = !isGroup ? members[0] : undefined;
  const typingNames = Object.values(typing)
    .filter((t) => t.until > Date.now())
    .map((t) => t.name);
  let subtitle: string;
  if (typingNames.length) subtitle = typingNames.length === 1 ? (isGroup ? `${typingNames[0]} печатает…` : "печатает…") : `${typingNames.length} печатают…`;
  else if (readonly) subtitle = "архив встречи";
  else if (isGroup) {
    const online = members.filter((m) => isOnline(m.lastActiveAt)).length;
    subtitle = `${members.length + 1} ${plural(members.length + 1, "участник", "участника", "участников")}${online ? `, ${online} в сети` : ""}`;
  } else subtitle = lastSeenText(other?.lastActiveAt);
  const title = isGroup ? info?.eventTitle ?? "Встреча" : other?.name ?? "Чат";
  const subtitleLive = !!typingNames.length || (!isGroup && isOnline(other?.lastActiveAt));

  const openMenu = useCallback((m: ChatMessage) => {
    tapLight();
    Keyboard.dismiss();
    setMenuMsg(m);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const older = reversed[index + 1];
      const newer = reversed[index - 1];
      const mine = item.senderId === me;
      const first = !sameGroup(older, item);
      const last = !sameGroup(item, newer);
      const showDay = !older || !sameDay(older.createdAt, item.createdAt);
      return (
        <View>
          {showDay ? (
            <View style={styles.dayWrap}>
              <Text style={styles.day}>{dayLabel(item.createdAt)}</Text>
            </View>
          ) : null}
          <Bubble
            msg={item}
            mine={mine}
            first={first || showDay}
            last={last}
            group={isGroup}
            sender={memberById.get(item.senderId)}
            senderName={senderName}
            readState={mine ? readStateOf(item) : "sent"}
            highlighted={highlight === item.id}
            onLongPress={openMenu}
            onReply={startReply}
            onReact={react}
            onOpenImage={setViewer}
            onJumpTo={jumpTo}
            onRetry={onRetry}
          />
        </View>
      );
    },
    [reversed, me, isGroup, memberById, senderName, readStateOf, highlight, startReply, react, jumpTo, onRetry, openMenu]
  );

  const openHeader = () => {
    if (info?.eventId) router.push(`/event/${info.eventId}`);
    else if (other) router.push(`/person/${other.id}`);
  };

  const panelHeight = Math.max(lastKb.current - insets.bottom, 290);
  const menuMine = !!menuMsg && menuMsg.senderId === me;
  const menuCanEdit = !!menuMsg && Date.now() - ms(menuMsg.createdAt) < EDIT_WINDOW_MS;

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <Glass strong style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <RoundBtn onPress={() => router.back()} size={40}>
          <Icon name="back" />
        </RoundBtn>
        <Pressable style={styles.headerMain} onPress={openHeader}>
          {isGroup ? (
            info?.eventPhotoUrl ? (
              <Image source={{ uri: info.eventPhotoUrl }} style={styles.headerPic} contentFit="cover" />
            ) : (
              <Grad style={[styles.headerPic, { alignItems: "center", justifyContent: "center" }]}>
                <Icon name="people" size={20} color="#fff" />
              </Grad>
            )
          ) : (
            <View>
              <Avatar uri={other?.avatarUrl} name={other?.name} size={40} />
              {isOnline(other?.lastActiveAt) ? <View style={styles.onlineDot} /> : null}
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.headerSub, subtitleLive && { color: colors.violet }]} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </Pressable>
      </Glass>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {loadError ? (
          <View style={styles.center}>
            <Text style={styles.empty}>{loadError}</Text>
          </View>
        ) : !info ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.violet} />
          </View>
        ) : (
          <FlatList
            ref={list}
            data={reversed}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingVertical: 10 }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 120 }}
            onScrollToIndexFailed={(e) => list.current?.scrollToOffset({ offset: e.averageItemLength * e.index, animated: true })}
            ListFooterComponent={loadingOlder ? <ActivityIndicator style={{ margin: 12 }} color={colors.violet} /> : null}
            ListEmptyComponent={
              <View style={[styles.center, { transform: [{ scaleY: -1 }] }]}>
                <Image source={{ uri: stickerUrl("mosya_wave") }} style={{ width: 140, height: 140 }} contentFit="contain" />
                <Text style={styles.empty}>Напиши первым — или отправь Мосю</Text>
              </View>
            }
          />
        )}

        {canWrite ? (
          <View style={{ paddingBottom: panel === "stickers" || kbHeight > 0 ? 4 : Math.max(insets.bottom, 8) }}>
            {replyTo || editing ? (
              <View style={styles.compose}>
                <Icon name={editing ? "edit" : "reply"} size={18} color={colors.violet} />
                <View style={{ flex: 1 }}>
                  {editing ? (
                    <>
                      <Text style={styles.composeTitle}>Редактирование</Text>
                      <Text style={styles.composeText} numberOfLines={1}>
                        {editing.content}
                      </Text>
                    </>
                  ) : (
                    <ReplyQuote reply={replyTo} mine={false} name={senderName(replyTo!.senderId)} />
                  )}
                </View>
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    if (editing) setText("");
                    setEditing(null);
                    setReplyTo(null);
                  }}
                >
                  <Icon name="close" size={18} color={colors.grey} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.inputRow}>
              {!editing ? (
                <Pressable onPress={pickPhoto} hitSlop={6} style={styles.sideBtn}>
                  <Icon name="camera" size={22} color={colors.ink2} />
                </Pressable>
              ) : null}
              <Glass strong style={styles.inputWrap}>
                <TextInput
                  ref={input}
                  value={text}
                  onChangeText={(t) => {
                    setText(t);
                    if (t) sendTyping();
                  }}
                  placeholder="Сообщение"
                  placeholderTextColor={colors.grey}
                  style={styles.input}
                  multiline
                  maxLength={2000}
                  onFocus={() => setPanel("none")}
                />
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    tapLight();
                    if (panel === "stickers") {
                      setPanel("none");
                      input.current?.focus();
                    } else {
                      Keyboard.dismiss();
                      setPanel("stickers");
                    }
                  }}
                  style={styles.smile}
                >
                  <Icon name={panel === "stickers" ? "keyboard" : "smile"} size={22} color={panel === "stickers" ? colors.violet : colors.ink2} />
                </Pressable>
              </Glass>
              {text.trim() ? (
                <Pressable onPress={onSend} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.88 : 1 }] })}>
                  <Grad style={styles.send}>
                    <Icon name={editing ? "check" : "send"} color="#fff" size={20} />
                  </Grad>
                </Pressable>
              ) : null}
            </View>
            {panel === "stickers" ? (
              <View style={{ paddingBottom: insets.bottom }}>
                <StickerPanel height={panelHeight} onPick={sendSticker} />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.readonly, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Icon name="lock" size={16} color={colors.grey} />
            <Text style={styles.readonlyText}>{blocked ? "Ты не можешь писать в этот чат" : "Встреча завершена — чат в архиве, писать нельзя"}</Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.toast, { top: insets.top + 70, opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }]}
        >
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      ) : null}

      <MessageMenu
        msg={menuMsg}
        mine={menuMine}
        canEdit={menuCanEdit}
        canWrite={canWrite}
        group={isGroup}
        onClose={() => setMenuMsg(null)}
        onReact={react}
        onReply={startReply}
        onCopy={onCopy}
        onEdit={onEdit}
        onDelete={setDeleteMsg}
        onReaders={setReadersMsg}
      />
      <ReadersSheet msg={readersMsg} members={members} onClose={() => setReadersMsg(null)} />
      <ConfirmSheet
        visible={!!deleteMsg}
        title="Удалить сообщение?"
        text="Оно исчезнет у всех участников чата."
        confirm="Удалить"
        danger
        onConfirm={doDelete}
        onClose={() => setDeleteMsg(null)}
      />
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)}>
          {viewer ? <Image source={{ uri: viewer }} style={{ width: "100%", height: "80%" }} contentFit="contain" /> : null}
          <View style={[styles.viewerClose, { top: insets.top + 12 }]}>
            <Icon name="close" size={22} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 10, borderRadius: 0, zIndex: 2 },
  headerMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerPic: { width: 40, height: 40, borderRadius: 14 },
  headerTitle: { fontFamily: FONT, fontSize: 16.5, fontWeight: "600", color: colors.ink },
  headerSub: { fontFamily: FONT, fontSize: 12.5, color: colors.grey, marginTop: 1 },
  onlineDot: { position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ok, borderWidth: 2, borderColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  empty: { fontFamily: FONT, fontSize: 15, color: colors.grey, textAlign: "center" },
  dayWrap: { alignItems: "center", marginVertical: 10 },
  day: { fontFamily: FONT, fontSize: 12.5, fontWeight: "500", color: colors.ink2, backgroundColor: "rgba(255,255,255,0.75)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, overflow: "hidden" },
  compose: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.9)" },
  composeTitle: { fontFamily: FONT, fontSize: 13, fontWeight: "600", color: colors.violet },
  composeText: { fontFamily: FONT, fontSize: 13, color: colors.ink2 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 },
  sideBtn: { width: 40, height: 48, alignItems: "center", justifyContent: "center" },
  inputWrap: { flex: 1, borderRadius: 24, paddingLeft: 16, paddingRight: 44, minHeight: 48, justifyContent: "center" },
  input: { fontFamily: FONT, minHeight: 44, maxHeight: 130, fontSize: 16, color: colors.ink, paddingVertical: 10 },
  smile: { position: "absolute", right: 12, bottom: 12 },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  readonly: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 12, paddingHorizontal: 20, backgroundColor: "rgba(255,255,255,0.8)" },
  readonlyText: { fontFamily: FONT, fontSize: 13.5, color: colors.grey, textAlign: "center", flexShrink: 1 },
  toast: { position: "absolute", alignSelf: "center", backgroundColor: "rgba(22,18,31,0.88)", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18 },
  toastText: { fontFamily: FONT, fontSize: 14, color: "#fff" },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" },
  viewerClose: { position: "absolute", right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
});

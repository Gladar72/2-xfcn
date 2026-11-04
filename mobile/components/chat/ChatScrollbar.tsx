import { useEffect, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";
import { colors } from "@/lib/theme";

const INSET = 8;

/**
 * Смещение прокрутки передаём через «шину», а не через state экрана чата:
 * так при прокрутке перерисовывается только ползунок, а не весь чат.
 */
export type ScrollBus = { emit: (y: number) => void; listen: (fn: (y: number) => void) => () => void };
export function createScrollBus(): ScrollBus {
  const fns = new Set<(y: number) => void>();
  return {
    emit: (y) => fns.forEach((fn) => fn(y)),
    listen: (fn) => {
      fns.add(fn);
      return () => {
        fns.delete(fn);
      };
    },
  };
}
const MIN_THUMB = 44;

/**
 * Ползунок для быстрой прокрутки длинной истории чата (как ChatScrollbar в мини-приложении).
 * Список в чате перевёрнутый (inverted): смещение 0 — самые новые сообщения внизу.
 * Ползунок появляется при прокрутке и прячется через секунду без движения.
 */
export function ChatScrollbar({
  bus,
  contentHeight,
  viewportHeight,
  onSeek,
  onDragStart,
}: {
  bus: ScrollBus;
  contentHeight: number;
  viewportHeight: number;
  onSeek: (offset: number) => void;
  onDragStart?: () => void;
}) {
  const [offset, setOffset] = useState(0);
  useEffect(() => bus.listen(setOffset), [bus]);
  const range = Math.max(0, contentHeight - viewportHeight);
  const track = Math.max(0, viewportHeight - INSET * 2);
  const thumb = Math.min(track, Math.max(MIN_THUMB, (track * viewportHeight) / Math.max(1, contentHeight)));
  const travel = Math.max(1, track - thumb);
  // Перевёрнутый список: новые внизу, поэтому смещение 0 — ползунок внизу.
  const top = range ? (1 - Math.min(range, Math.max(0, offset)) / range) * travel : travel;

  const [dragging, setDragging] = useState(false);
  // Невидимый ползунок не должен перехватывать касания у правого края (там свои сообщения).
  const [shown, setShown] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grab = useRef(0);
  const geom = useRef({ range, travel, top });
  geom.current = { range, travel, top };
  const seekRef = useRef(onSeek);
  seekRef.current = onSeek;
  const startRef = useRef(onDragStart);
  startRef.current = onDragStart;

  // Показываем при любой прокрутке, прячем через секунду покоя.
  useEffect(() => {
    if (range < viewportHeight) return;
    setShown(true);
    Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!dragging) {
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(({ finished }) => finished && setShown(false));
      }, 1100);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [offset, dragging, range, viewportHeight, opacity]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        grab.current = geom.current.top;
        setDragging(true);
        startRef.current?.();
      },
      onPanResponderMove: (_, g) => {
        const { range: r, travel: t } = geom.current;
        const y = Math.min(t, Math.max(0, grab.current + g.dy));
        seekRef.current((1 - y / t) * r);
      },
      onPanResponderRelease: () => setDragging(false),
      onPanResponderTerminate: () => setDragging(false),
    })
  ).current;

  // Короткая переписка — ползунок не нужен.
  if (range < viewportHeight) return null;

  return (
    <Animated.View style={[styles.track, { top: INSET, height: track, opacity }]} pointerEvents="box-none">
      <View
        {...pan.panHandlers}
        pointerEvents={shown ? "auto" : "none"}
        hitSlop={{ left: 18, right: 8, top: 8, bottom: 8 }}
        style={[styles.thumb, { top, height: thumb }, dragging && styles.thumbOn]}
        accessibilityRole="adjustable"
        accessibilityLabel="Быстрая прокрутка истории"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: { position: "absolute", right: 3, width: 14 },
  thumb: { position: "absolute", right: 0, width: 6, borderRadius: 3, backgroundColor: "rgba(108,59,255,0.35)" },
  thumbOn: { width: 8, borderRadius: 4, backgroundColor: colors.violet },
});

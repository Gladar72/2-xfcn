import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs, router } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass } from "@/components/brand";
import { Image } from "expo-image";
import { API_URL } from "@/lib/config";
import { Icon, type IconName } from "@/components/Icon";
import { colors, f } from "@/lib/theme";
import { PendingReviews } from "@/components/reviews/PendingReviews";
import { fetchPendingApplications } from "@/lib/pending";

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: "Главная", icon: "home" },
  map: { label: "Карта", icon: "map" },
  chats: { label: "Чаты", icon: "chat" },
  profile: { label: "Профиль", icon: "user" },
};

/** Плавающий светлый стеклянный таббар с Мосей «+» по центру — как в прототипе. */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => TABS[r.name]);
  const left = routes.slice(0, 2);
  const right = routes.slice(2);
  // Цифра на «Профиле» (там «Мои встречи») — сколько новых заявок ждут ответа на мои встречи.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    fetchPendingApplications().then((r) => setPending(r.count));
  }, [state.index]);

  const item = (r: (typeof routes)[number]) => {
    const t = TABS[r.name]!;
    const on = state.routes[state.index]?.key === r.key;
    return (
      <Pressable
        key={r.key}
        onPress={() => {
          const e = navigation.emit({ type: "tabPress", target: r.key, canPreventDefault: true });
          if (!on && !e.defaultPrevented) navigation.navigate(r.name);
        }}
        style={[styles.tab, on && styles.tabOn]}
      >
        <Icon name={t.icon} color={on ? colors.ink : "rgba(23,20,31,0.45)"} size={22} />
        {r.name === "profile" && pending > 0 ? (
          <View style={styles.badge} accessibilityLabel={`Новых заявок: ${pending}`}>
            <Text style={styles.badgeText}>{pending > 9 ? "9+" : pending}</Text>
          </View>
        ) : null}
        <Text style={[styles.label, { color: on ? colors.ink : "rgba(23,20,31,0.45)" }]}>{t.label}</Text>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 14) }]}>
      <Glass strong intensity={50} style={styles.bar}>
        <View style={styles.row}>
          {left.map(item)}
          {/* Как в прототипе: по центру — Мося-капля с «+», чуть выше панели. */}
          <Pressable onPress={() => router.push("/create")} accessibilityLabel="Создать встречу" style={({ pressed }) => [styles.plusRing, { transform: [{ scale: pressed ? 0.9 : 1 }] }]}>
            <Image source={{ uri: `${API_URL}/brand/creature/mp00.webp` }} style={styles.blob} contentFit="contain" cachePolicy="disk" />
            <Icon name="plus" color="#fff" size={28} strokeWidth={2.2} />
          </Pressable>
          {right.map(item)}
        </View>
      </Glass>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar {...p} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="map" />
        <Tabs.Screen name="chats" />
        <Tabs.Screen name="profile" />
      </Tabs>
      <PendingReviews />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 14, right: 14, alignItems: "center" },
  bar: { width: "100%", maxWidth: 440, height: 68, borderRadius: 999 },
  row: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 },
  tab: { width: 62, height: 54, borderRadius: 999, alignItems: "center", justifyContent: "center", gap: 3 },
  tabOn: {},
  label: { fontSize: 10.5, ...f("500") },
  badge: {
    position: "absolute",
    top: 3,
    left: "56%",
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: "#FF3B6B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: { color: "#fff", fontSize: 10.5, ...f("700") },
  plusRing: { width: 74, height: 74, alignItems: "center", justifyContent: "center", marginTop: -26 },
  blob: { position: "absolute", width: 78, height: 78 },
});

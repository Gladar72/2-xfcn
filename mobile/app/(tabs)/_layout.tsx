import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs, router } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass, Grad } from "@/components/brand";
import { Icon, type IconName } from "@/components/Icon";
import { FONT } from "@/lib/theme";

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: "Главная", icon: "home" },
  map: { label: "Карта", icon: "map" },
  chats: { label: "Чаты", icon: "chat" },
  profile: { label: "Профиль", icon: "user" },
};

/** Плавающий тёмный стеклянный таббар с кнопкой «+» по центру — как в мини-приложении. */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => TABS[r.name]);
  const left = routes.slice(0, 2);
  const right = routes.slice(2);

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
        <Icon name={t.icon} color={on ? "#fff" : "rgba(255,255,255,0.55)"} size={22} />
        <Text style={[styles.label, { color: on ? "#fff" : "rgba(255,255,255,0.55)" }]}>{t.label}</Text>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 14) }]}>
      <Glass dark intensity={60} style={styles.bar}>
        <View style={styles.row}>
          {left.map(item)}
          <Pressable onPress={() => router.push("/create")} style={({ pressed }) => [styles.plusRing, { transform: [{ scale: pressed ? 0.86 : 1 }] }]}>
            <Grad style={styles.plus}>
              <Icon name="plus" color="#fff" size={26} strokeWidth={2.2} />
            </Grad>
          </Pressable>
          {right.map(item)}
        </View>
      </Glass>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar {...p} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 14, right: 14, alignItems: "center" },
  bar: { width: "100%", maxWidth: 440, height: 68, borderRadius: 999 },
  row: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 },
  tab: { width: 62, height: 54, borderRadius: 999, alignItems: "center", justifyContent: "center", gap: 3 },
  tabOn: { backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  label: { fontFamily: FONT, fontSize: 10.5, fontWeight: "500" },
  plusRing: { width: 68, height: 68, borderRadius: 34, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", marginTop: -2 },
  plus: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#AA46FF",
    shadowOpacity: 0.9,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
});

import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/lib/theme";

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.ink400,
        tabBarStyle: { borderTopColor: colors.border },
        tabBarLabelStyle: { fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Встречи", tabBarIcon: icon("sparkles-outline") }} />
      <Tabs.Screen name="map" options={{ title: "Карта", tabBarIcon: icon("map-outline") }} />
      <Tabs.Screen name="chats" options={{ title: "Чаты", tabBarIcon: icon("chatbubbles-outline") }} />
      <Tabs.Screen name="profile" options={{ title: "Профиль", tabBarIcon: icon("person-circle-outline") }} />
    </Tabs>
  );
}

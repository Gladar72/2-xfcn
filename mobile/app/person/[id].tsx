import { router, useLocalSearchParams } from "expo-router";
import { PersonView } from "@/components/people/PersonView";
import { useGuide } from "@/lib/guide";

/** Профиль человека: из встречи, чата, заявок или «Как меня видят» (?self=1). */
export default function PersonScreen() {
  useGuide("person");
  const { id, self, name, avatar, age } = useLocalSearchParams<{ id: string; self?: string; name?: string; avatar?: string; age?: string }>();
  // Имя и фото приходят сразу со встречи — экран открывается мгновенно, остальное догружается.
  const preview = name ? { id, name, age: Number(age) || 0, avatarUrl: avatar || null } : undefined;
  return <PersonView id={id} preview={preview} self={self === "1"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} />;
}

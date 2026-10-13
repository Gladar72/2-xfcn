import { router, useLocalSearchParams } from "expo-router";
import { PersonView } from "@/components/people/PersonView";

/** Профиль человека: из встречи, чата, заявок или «Как меня видят» (?self=1). */
export default function PersonScreen() {
  const { id, self } = useLocalSearchParams<{ id: string; self?: string }>();
  return <PersonView id={id} self={self === "1"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} />;
}

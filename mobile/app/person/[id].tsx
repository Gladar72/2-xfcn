import { router, useLocalSearchParams } from "expo-router";
import { PersonView } from "@/components/people/PersonView";
import { useGuide } from "@/lib/guide";

/** Профиль человека: из встречи, чата, заявок или «Как меня видят» (?self=1). */
export default function PersonScreen() {
  useGuide("person");
  const { id, self } = useLocalSearchParams<{ id: string; self?: string }>();
  return <PersonView id={id} self={self === "1"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} />;
}

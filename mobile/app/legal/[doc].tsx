import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Aurora, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import documents from "@/lib/legal-documents.json";
import { colors, FONT, f } from "@/lib/theme";

export default function LegalDocument() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const blocks = doc === "offer" || doc === "privacy" || doc === "consent" ? documents[doc] : [];
  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.bar}>
          <RoundBtn size={44} onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
            <Icon name="back" />
          </RoundBtn>
        </View>
        <ScrollView key={doc} contentContainerStyle={styles.body}>
          {blocks.length === 0 && <Text style={styles.text}>Документ не найден</Text>}
          {blocks.map((block, i) => (
            <Text key={i} selectable accessibilityRole={block.tag.startsWith("h") ? "header" : undefined}
              style={[styles.text, block.tag === "h1" && styles.title, block.tag === "h2" && styles.heading]}>
              {block.tag === "li" && "•  "}
              {block.parts.map((part, j) => "href" in part && typeof part.href === "string" ? (
                <Text key={j} accessibilityRole="link" style={styles.link}
                  onPress={() => router.push({ pathname: "/legal/[doc]", params: { doc: String(part.href).split("/").pop()! } })}>{part.text}</Text>
              ) : part.text)}
            </Text>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 16, paddingVertical: 6 },
  body: { paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
  text: { fontFamily: FONT, color: colors.ink, fontSize: 16, lineHeight: 24 },
  title: { ...f("600"), fontSize: 29, lineHeight: 34, marginBottom: 6 },
  heading: { ...f("600"), fontSize: 19, lineHeight: 25, marginTop: 12 },
  link: { textDecorationLine: "underline" },
});

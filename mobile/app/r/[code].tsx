import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/lib/auth";
import { applyPendingRef, savePendingRef } from "@/lib/referral";
import { colors } from "@/lib/theme";

/** mesto://r/<code> — переход по ссылке партнёра. Код применится к аккаунту (сейчас или при регистрации). */
export default function ReferralLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { ready, signedIn } = useAuth();

  useEffect(() => {
    if (!ready) return;
    (async () => {
      if (code) await savePendingRef(String(code));
      if (signedIn) {
        await applyPendingRef();
        router.replace("/(tabs)");
      } else {
        router.replace("/(auth)/login");
      }
    })();
  }, [ready, signedIn, code]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.milk }}>
      <ActivityIndicator color={colors.violet} />
    </View>
  );
}

import { useEffect } from "react";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "@/lib/auth";
import { registerForPush } from "@/lib/push";
import { colors } from "@/lib/theme";

function Gate() {
  const { ready, signedIn, ticket } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === "(auth)";
    if (!signedIn && ticket && segments[1] !== "register") router.replace("/(auth)/register");
    else if (!signedIn && !ticket && !inAuth) router.replace("/(auth)/login");
    else if (signedIn && inAuth) router.replace("/(tabs)");
  }, [ready, signedIn, ticket, segments]);

  useEffect(() => {
    if (signedIn) registerForPush().catch(() => {});
  }, [signedIn]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="event/[id]" options={{ headerShown: true, title: "", headerBackTitle: "Назад", headerTintColor: colors.accent }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

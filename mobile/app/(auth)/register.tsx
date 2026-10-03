import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Button, Chip, ErrorText, Field } from "@/components/ui";
import { api, type ApiError } from "@/lib/api";
import { useAuth, type AuthResult } from "@/lib/auth";
import { loginWithTelegram } from "@/lib/telegramLogin";
import { colors, font } from "@/lib/theme";

const POPULAR_CITIES = ["Тюмень", "Москва", "Санкт-Петербург", "Екатеринбург", "Новосибирск", "Казань"];

interface Interest {
  id: string;
  name: string;
  emoji: string | null;
}

export default function RegisterScreen() {
  const { ticket, ticketKind, prefillName, handleAuthResult, signOut } = useAuth();
  const [tgBusy, setTgBusy] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);
  const [name, setName] = useState(prefillName ?? "");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [city, setCity] = useState("Тюмень");
  const [bio, setBio] = useState("");
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ interests: Interest[] }>("/api/interests", { auth: false })
      .then((r) => setInterests(r.interests ?? []))
      .catch(() => {});
  }, []);

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    const out = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 900 } }], {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (out.base64) setPhoto({ uri: out.uri, base64: `data:image/jpeg;base64,${out.base64}` });
  }

  // Номер новый, но у человека уже есть профиль в Telegram-версии:
  // входим через Telegram и привязываем к тому профилю этот номер.
  async function useExistingTelegramProfile() {
    setTgError(null);
    setTgBusy(true);
    try {
      const r = await loginWithTelegram(ticket);
      if (!r) return;
      if (r.status === "authenticated") {
        await handleAuthResult(r);
      } else {
        setTgError("Профиль с этим Telegram не найден — заполни анкету ниже, чтобы создать новый.");
      }
    } catch (e) {
      setTgError((e as Error).message);
    } finally {
      setTgBusy(false);
    }
  }

  async function submit() {
    setError(null);
    const birthDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return setError("Укажи дату рождения полностью");
    if (!gender) return setError("Укажи пол");
    if (!agreed) return setError("Нужно принять условия оферты и политики конфиденциальности");
    setBusy(true);
    try {
      const r = await api<AuthResult>("/api/auth/mobile/register", {
        auth: false,
        body: {
          ticket,
          profile: {
            name,
            birthDate,
            gender,
            city,
            bio,
            agreedToTerms: true,
            interestIds: picked,
            photoBase64: photo?.base64,
          },
        },
      });
      await handleAuthResult(r);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Расскажи о себе</Text>
        <Text style={styles.sub}>Так люди поймут, с кем идут на встречу</Text>

        {ticketKind === "phone" ? (
          <View style={styles.tgBox}>
            <Text style={styles.tgTitle}>Уже есть профиль в «Место» в Telegram?</Text>
            <Text style={styles.tgText}>Войди через Telegram — номер привяжется к твоему профилю, встречи и чаты сохранятся.</Text>
            <Button title="Войти через Telegram" variant="telegram" onPress={useExistingTelegramProfile} loading={tgBusy} />
            <ErrorText>{tgError}</ErrorText>
          </View>
        ) : null}

        <Pressable onPress={pickPhoto} style={styles.photo}>
          {photo ? (
            <Image source={{ uri: photo.uri }} style={{ width: "100%", height: "100%" }} />
          ) : (
            <Text style={{ color: colors.accent, fontWeight: "700" }}>+ Фото</Text>
          )}
        </Pressable>

        <Field label="Имя" value={name} onChangeText={setName} placeholder="Как тебя зовут" maxLength={60} />

        <Text style={styles.label}>Дата рождения</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field value={day} onChangeText={(t) => setDay(t.replace(/\D/g, "").slice(0, 2))} placeholder="ДД" keyboardType="number-pad" style={{ width: 80, textAlign: "center" }} />
          <Field value={month} onChangeText={(t) => setMonth(t.replace(/\D/g, "").slice(0, 2))} placeholder="ММ" keyboardType="number-pad" style={{ width: 80, textAlign: "center" }} />
          <Field value={year} onChangeText={(t) => setYear(t.replace(/\D/g, "").slice(0, 4))} placeholder="ГГГГ" keyboardType="number-pad" style={{ width: 110, textAlign: "center" }} />
        </View>

        <Text style={styles.label}>Пол</Text>
        <View style={styles.wrapRow}>
          <Chip label="Мужской" active={gender === "male"} onPress={() => setGender("male")} />
          <Chip label="Женский" active={gender === "female"} onPress={() => setGender("female")} />
        </View>

        <Field label="Город" value={city} onChangeText={setCity} />
        <View style={styles.wrapRow}>
          {POPULAR_CITIES.map((c) => (
            <Chip key={c} label={c} active={city === c} onPress={() => setCity(c)} />
          ))}
        </View>

        <Field label="О себе (необязательно)" value={bio} onChangeText={setBio} multiline maxLength={300} style={{ height: 96, paddingTop: 14 }} />

        {interests.length > 0 ? (
          <>
            <Text style={styles.label}>Интересы</Text>
            <View style={styles.wrapRow}>
              {interests.map((i) => (
                <Chip
                  key={i.id}
                  label={`${i.emoji ?? ""} ${i.name}`.trim()}
                  active={picked.includes(i.id)}
                  onPress={() => setPicked((p) => (p.includes(i.id) ? p.filter((x) => x !== i.id) : p.length < 15 ? [...p, i.id] : p))}
                />
              ))}
            </View>
          </>
        ) : null}

        <Pressable onPress={() => setAgreed((v) => !v)} style={styles.terms}>
          <View style={[styles.check, agreed && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
            {agreed ? <Text style={{ color: "#fff", fontWeight: "900" }}>✓</Text> : null}
          </View>
          <Text style={{ flex: 1, color: colors.ink600, fontSize: font.sm }}>Мне есть 18 лет, принимаю условия оферты и политику конфиденциальности</Text>
        </Pressable>

        <ErrorText>{error}</ErrorText>
        <Button title="Готово" onPress={submit} loading={busy} disabled={name.trim().length < 2} />
        <Button title="Войти по-другому" variant="ghost" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: font.display, fontWeight: "800", color: colors.ink900 },
  sub: { fontSize: font.sm, color: colors.ink600, marginBottom: 8 },
  label: { fontSize: font.sm, color: colors.ink600, fontWeight: "600" },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photo: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.lavender100,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tgBox: { backgroundColor: colors.lavender100, borderRadius: 18, padding: 14, gap: 8, marginBottom: 8 },
  tgTitle: { fontSize: font.base, fontWeight: "800", color: colors.ink900 },
  tgText: { fontSize: font.sm, color: colors.ink600 },
  terms: { flexDirection: "row", gap: 12, alignItems: "center", marginVertical: 8 },
  check: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
});

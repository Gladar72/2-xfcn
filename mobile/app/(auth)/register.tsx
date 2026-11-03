import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Aurora, Btn, Glass, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { CitySheet } from "@/components/CitySheet";
import { DateWheels, ageOf, ageWord, type BirthDate } from "@/components/register/DateWheels";
import { RegHint } from "@/components/register/RegHint";
import { API_URL } from "@/lib/config";
import { api, type ApiError } from "@/lib/api";
import { useAuth, type AuthResult } from "@/lib/auth";
import { loginWithTelegram } from "@/lib/telegramLogin";
import { detectCity } from "@/lib/geoCity";
import { refreshLocationSilently } from "@/lib/location";
import { interestIcon } from "@/lib/interests";
import { photoFromUrl, pickPhoto } from "@/lib/photos";
import { startGuideTour } from "@/lib/guide";
import { clearPendingRef, getPendingRef } from "@/lib/referral";
import { stickerUrl } from "@/lib/stickers";
import { colors, FONT, f } from "@/lib/theme";

/**
 * Регистрация в три шага (как в брифе, экраны «Почти готово» → «Интересы» → «Где ищем компанию?»):
 * 1) фото (из Telegram подставляется само, можно ещё два), имя, дата барабанами, пол;
 * 2) интересы плитками с 3D-иконками, минимум три;
 * 3) город — определяем по геолокации или выбирают сами, тут же согласия.
 * Мося выглядывает снизу справа и подсказывает, не закрывая поля.
 * Шаги въезжают сбоку: ~450 мс, cubic-bezier(.32,.72,0,1).
 */

interface Interest {
  id: string;
  name: string;
}

const TOP_INTERESTS = ["Кофе", "Кино", "Бег", "Путешествия", "Музыка", "Йога", "Бары", "Концерты", "Походы", "Книги", "Настолки", "Вечеринки"];
const MIN_INTERESTS = 3;
const EASE = Easing.bezier(0.32, 0.72, 0, 1);
// Тестовая сборка для снимков на эмуляторе: анкета заполнена, шаги листаются без проверок.
const SMOKE = process.env.EXPO_PUBLIC_AUTH_SMOKE === "1";

export default function RegisterScreen() {
  const { ticket, ticketKind, prefillName, prefillPhoto, handleAuthResult, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const slide = useRef(new Animated.Value(0)).current;

  // шаг 1
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null]);
  const [tgPhoto, setTgPhoto] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(!!prefillPhoto);
  const [name, setName] = useState(prefillName ?? (SMOKE ? "Андрей" : ""));
  const [birth, setBirth] = useState<BirthDate>(() => (SMOKE ? { d: 14, m: 7, y: 1996 } : { d: 1, m: 0, y: new Date().getFullYear() - 25 }));
  const [birthTouched, setBirthTouched] = useState(false);
  const [gender, setGender] = useState<"male" | "female" | null>(SMOKE ? "male" : null);
  // шаг 2
  const [interests, setInterests] = useState<Interest[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  // шаг 3
  const [city, setCity] = useState<string | null>(null);
  const [cityAuto, setCityAuto] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  // Согласие на обработку персональных данных — отдельной галочкой (152-ФЗ).
  const [agreedPd, setAgreedPd] = useState(false);

  const [nudge, setNudge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);

  useEffect(() => {
    api<{ interests: Interest[] }>("/api/interests", { auth: false })
      .then((r) => {
        const list = r.interests ?? [];
        setInterests(list);
        if (SMOKE) setPicked(list.filter((i) => ["Кофе", "Кино", "Путешествия", "Бары"].includes(i.name)).map((i) => i.id));
      })
      .catch(() => setInterests([]));
  }, []);

  // Фото из Telegram — главным фото, человеку остаётся только подтвердить.
  useEffect(() => {
    if (!prefillPhoto) return;
    let alive = true;
    photoFromUrl(prefillPhoto).then((p) => {
      if (!alive) return;
      if (p) {
        setPhotos((cur) => (cur[0] ? cur : [p, cur[1], cur[2]]));
        setTgPhoto(true);
      }
      setPhotoBusy(false);
    });
    return () => {
      alive = false;
    };
  }, [prefillPhoto]);

  function go(next: number) {
    const dir = next > step ? 1 : -1;
    setNudge(null);
    setError(null);
    slide.setValue(dir);
    setStep(next);
    Animated.timing(slide, { toValue: 0, duration: 450, easing: EASE, useNativeDriver: true }).start();
  }

  async function addPhoto(i: number) {
    const p = await pickPhoto();
    if (!p) return;
    setPhotos((cur) => {
      const n = [...cur];
      // Пустой главный слот заполняем первым, чтобы главное фото всегда было.
      const at = n[0] || i === 0 ? i : 0;
      n[at] = p;
      return n;
    });
    if (i === 0) setTgPhoto(false);
    setNudge(null);
  }

  function removePhoto(i: number) {
    setPhotos((cur) => {
      const rest = cur.filter((_, k) => k !== i);
      return [...rest, null];
    });
    if (i === 0) setTgPhoto(false);
  }

  const age = ageOf(birth);
  const cleanName = name.trim();
  // Мося здоровается, когда человек перестал печатать, а не на каждую букву.
  const [heardName, setHeardName] = useState(cleanName);
  useEffect(() => {
    const t = setTimeout(() => setHeardName(cleanName), 700);
    return () => clearTimeout(t);
  }, [cleanName]);

  function next1() {
    if (SMOKE) return go(1);
    if (!photos[0]) return setNudge("Добавь фото — так люди поймут, с кем идут на встречу");
    if (cleanName.length < 2) return setNudge("Напиши своё имя — хватит одного");
    if (age < 18) return setNudge("«Место» — для тех, кому уже есть 18");
    if (!gender) return setNudge("И последнее — выбери, ты парень или девушка");
    go(1);
  }

  function next2() {
    if (SMOKE) return go(2);
    if ((interests?.length ?? 0) > 0 && picked.length < MIN_INTERESTS) return setNudge(`Выбери ещё ${MIN_INTERESTS - picked.length} — так подберу встречи точнее`);
    go(2);
  }

  async function findCity() {
    setGeoBusy(true);
    setError(null);
    const r = await detectCity();
    setGeoBusy(false);
    if ("city" in r) {
      setCity(r.city);
      setCityAuto(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      setError(r.error === "denied" ? "Без геолокации не определить — выбери город сам" : "Не нашли твой город — выбери его из списка");
      setCityOpen(true);
    }
  }

  async function useExistingTelegramProfile() {
    setError(null);
    setTgBusy(true);
    try {
      const r = await loginWithTelegram(ticket);
      if (!r) return;
      if (r.status === "authenticated") await handleAuthResult(r);
      else setNudge("Профиль с этим Telegram не найден — давай создадим новый");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTgBusy(false);
    }
  }

  async function submit() {
    setError(null);
    if (!city) return setError("Выбери город");
    if (!agreed) return setError("Нужно принять условия оферты и политики конфиденциальности");
    if (!agreedPd) return setError("Нужно согласие на обработку персональных данных");
    const main = photos[0];
    if (!main) return go(0);
    setBusy(true);
    try {
      const refCode = await getPendingRef();
      const pad = (n: number) => String(n).padStart(2, "0");
      const r = await api<AuthResult>("/api/auth/mobile/register", {
        auth: false,
        body: {
          ticket,
          refCode: refCode ?? undefined,
          profile: {
            name: cleanName,
            birthDate: `${birth.y}-${pad(birth.m + 1)}-${pad(birth.d)}`,
            gender,
            city,
            agreedToTerms: true,
            interestIds: picked,
            photoBase64: main,
            extraPhotos: photos.slice(1).filter((p): p is string => !!p),
          },
        },
      });
      await clearPendingRef();
      // Новый человек — Мося проведёт по разделам.
      if (r.status === "authenticated") startGuideTour();
      await handleAuthResult(r);
      // Геолокацию уже разрешили на шаге с городом — сразу отметим точку для «Люди рядом».
      refreshLocationSilently().catch(() => {});
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  // Что говорит Мося
  const hint = useMemo(() => {
    if (nudge) return { pose: "mosya_think", text: nudge };
    if (step === 0) {
      if (heardName.length >= 2 && birthTouched && age >= 18) return { pose: "mosya_bday", text: `${age} ${ageWord(age)} — отличный возраст для новых знакомств!` };
      if (heardName.length >= 2) return { pose: "mosya_wave", text: `Приятно познакомиться, ${heardName}!` };
      // Вход по почте или через Apple — фото из Telegram нет, просим добавить своё.
      if (!photos[0] && !photoBusy) return { pose: "mosya_selfie", text: "Начни с фото — так тебя узнают на встрече" };
      return { pose: "mosya_wave", text: "Знаю, анкеты — скучно. Тут пара секунд!" };
    }
    const n = picked.length;
    if (n === 0) return { pose: "mosya_love", text: "Тапай, что нравится — подберу встречи и людей" };
    if (n < MIN_INTERESTS) return { pose: "mosya_love", text: `Отлично! Ещё ${MIN_INTERESTS - n}, и идём дальше` };
    return { pose: "mosya_jump", text: `Выбрано ${n} — уже вижу, куда тебя позвать!` };
  }, [nudge, step, heardName, birthTouched, age, picked.length, photos, photoBusy]);

  const shown = useMemo(() => {
    if (!interests) return [];
    if (showAll) return interests;
    const byName = new Map(interests.map((i) => [i.name, i]));
    const top = TOP_INTERESTS.map((n) => byName.get(n)).filter((x): x is Interest => !!x);
    return top.length >= 6 ? top : interests.slice(0, 12);
  }, [interests, showAll]);

  const tileW = (width - 40 - 16) / 3;
  const translateX = slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [-40, 0, 40] });
  const opacity = slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] });
  const hasTgOffer = ticketKind === "phone" || ticketKind === "email" || ticketKind === "apple";

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <Aurora />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.top}>
          <Pressable onPress={() => (step > 0 ? go(step - 1) : signOut())} style={styles.back} hitSlop={8} accessibilityLabel={step > 0 ? "Назад" : "Войти по-другому"}>
            <Icon name="back" size={20} color={colors.ink} strokeWidth={2} />
          </Pressable>
          <View style={styles.prog}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.bar, i <= step && styles.barOn]} />
            ))}
          </View>
          <Text style={styles.cnt}>{step + 1} / 3</Text>
        </View>

        <Animated.View style={{ flex: 1, opacity, transform: [{ translateX }] }}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {step === 0 ? (
              <>
                {cleanName.length >= 2 ? <Title plain="Почти готово, " em={cleanName} size={28} /> : <Title plain="Почти " em="готово" size={28} />}
                <Text style={styles.sub}>Пара секунд — и в путь</Text>

                <View style={styles.photos}>
                  {photos.map((p, i) => (
                    <Pressable key={i} onPress={() => addPhoto(i)} style={[styles.ph, i === 0 ? styles.phMain : styles.phAdd, !p && styles.phEmpty]} accessibilityLabel={p ? "Заменить фото" : "Добавить фото"}>
                      {p ? (
                        <>
                          <Image source={{ uri: p }} style={StyleSheet.absoluteFill} contentFit="cover" />
                          <Pressable onPress={() => removePhoto(i)} hitSlop={8} style={styles.phX} accessibilityLabel="Убрать фото">
                            <Icon name="close" size={12} color="#fff" strokeWidth={2.6} />
                          </Pressable>
                          {i === 0 && tgPhoto ? <Text style={styles.phTag}>из Telegram</Text> : null}
                        </>
                      ) : i === 0 && photoBusy ? (
                        <ActivityIndicator color={colors.violet} />
                      ) : (
                        <>
                          <Icon name={i === 0 ? "camera" : "plus"} size={i === 0 ? 28 : 24} color={colors.violet} strokeWidth={2} />
                          {i === 0 ? <Text style={styles.phText}>Фото</Text> : null}
                        </>
                      )}
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  value={name}
                  onChangeText={(t) => {
                    setName(t);
                    setNudge(null);
                  }}
                  placeholder="Как тебя зовут"
                  placeholderTextColor={colors.grey}
                  maxLength={60}
                  autoCapitalize="words"
                  textContentType="givenName"
                  style={styles.field}
                />

                <Text style={styles.lbl}>Дата рождения</Text>
                <DateWheels
                  value={birth}
                  onChange={(b) => {
                    setBirth(b);
                    setBirthTouched(true);
                    setNudge(null);
                  }}
                />
                <View style={styles.age}>
                  <Text style={[styles.ageNum, age < 18 && styles.ageBad]}>
                    {age} {ageWord(age)}
                  </Text>
                  <Text style={styles.ageText}>Дату не покажем — только возраст</Text>
                </View>

                <Segmented
                  value={gender}
                  onChange={(g) => {
                    setGender(g);
                    setNudge(null);
                  }}
                />

                {hasTgOffer ? (
                  <Glass style={styles.tgBox}>
                    <Text style={styles.tgText}>Уже есть профиль «Места» в Telegram?</Text>
                    <Pressable onPress={useExistingTelegramProfile} hitSlop={6} disabled={tgBusy}>
                      {tgBusy ? <ActivityIndicator color={colors.tg} /> : <Text style={styles.tgLink}>Войти через Telegram</Text>}
                    </Pressable>
                  </Glass>
                ) : null}
              </>
            ) : step === 1 ? (
              <>
                <Title plain="Что тебе " em="по душе?" size={28} />
                <Text style={styles.sub}>Выбери хотя бы три — подберём встречи и людей</Text>
                {!interests ? (
                  <ActivityIndicator color={colors.violet} style={{ marginTop: 40 }} />
                ) : (
                  <>
                    <View style={styles.grid}>
                      {shown.map((it) => {
                        const on = picked.includes(it.id);
                        return (
                          <Pressable
                            key={it.id}
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              setNudge(null);
                              setPicked((p) => (p.includes(it.id) ? p.filter((x) => x !== it.id) : p.length < 15 ? [...p, it.id] : p));
                            }}
                            style={({ pressed }) => [styles.tile, { width: tileW }, on && styles.tileOn, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
                          >
                            <Image source={{ uri: interestIcon(it.name) }} style={styles.tileIc} contentFit="contain" cachePolicy="disk" />
                            <Text style={styles.tileText} numberOfLines={1} adjustsFontSizeToFit>
                              {it.name}
                            </Text>
                            {on ? (
                              <View style={styles.tick}>
                                <Icon name="check" size={11} color="#fff" strokeWidth={3} />
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                    {!showAll && interests.length > shown.length ? (
                      <Pressable onPress={() => setShowAll(true)} style={styles.more}>
                        <Icon name="search" size={17} color={colors.grey} />
                        <Text style={styles.moreText}>Ещё {interests.length - shown.length} {plural(interests.length - shown.length, "интерес", "интереса", "интересов")}</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </>
            ) : (
              <>
                <Image source={{ uri: stickerUrl("mosya_pin") }} style={styles.bigMosya} contentFit="contain" cachePolicy="disk" />
                <Title plain="Где ищем " em="компанию?" size={28} style={{ textAlign: "center" }} />
                <Text style={[styles.sub, { textAlign: "center" }]}>Покажем встречи и людей рядом с тобой</Text>

                <Pressable onPress={city ? () => setCityOpen(true) : findCity} disabled={geoBusy} style={styles.geo}>
                  <View style={styles.pin}>
                    <Icon name="nav" size={20} color={colors.violet} strokeWidth={1.9} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.geoTitle}>{city ?? "Определить автоматически"}</Text>
                    <Text style={styles.geoSub}>{city ? (cityAuto ? "Определили по геолокации" : "Твой город") : "По геолокации, займёт секунду"}</Text>
                  </View>
                  {geoBusy ? (
                    <ActivityIndicator color={colors.violet} />
                  ) : city ? (
                    <View style={styles.ok}>
                      <Icon name="check" size={16} color="#fff" strokeWidth={2.6} />
                    </View>
                  ) : (
                    <Text style={styles.find}>Найти</Text>
                  )}
                </Pressable>
                <Pressable onPress={() => setCityOpen(true)} style={[styles.more, { marginTop: 12 }]}>
                  <Icon name="search" size={17} color={colors.grey} />
                  <Text style={styles.moreText}>{city ? "Выбрать другой город" : "Выбрать из списка"}</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </Animated.View>

        {step < 2 ? <RegHint pose={hint.pose} text={hint.text} /> : null}

        <View style={styles.foot}>
          {step === 2 ? (
            <>
              <Check on={agreed} onPress={() => setAgreed((v) => !v)}>
                Мне есть 18 лет, принимаю{" "}
                <Text style={styles.link} onPress={() => Linking.openURL(`${API_URL}/legal/offer`)}>
                  оферту
                </Text>{" "}
                и{" "}
                <Text style={styles.link} onPress={() => Linking.openURL(`${API_URL}/legal/privacy`)}>
                  политику конфиденциальности
                </Text>
              </Check>
              <Check on={agreedPd} onPress={() => setAgreedPd((v) => !v)}>
                Даю{" "}
                <Text style={styles.link} onPress={() => Linking.openURL(`${API_URL}/legal/consent`)}>
                  согласие на обработку персональных данных
                </Text>
              </Check>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Btn title="Готово" onPress={submit} loading={busy} disabled={!city || !agreed || !agreedPd} />
            </>
          ) : (
            <Btn title="Дальше" onPress={step === 0 ? next1 : next2} disabled={step === 0 && photoBusy} />
          )}
        </View>
      </KeyboardAvoidingView>
      <CitySheet
        visible={cityOpen}
        value={city}
        onPick={(c) => {
          setCity(c);
          setCityAuto(false);
          setError(null);
          setCityOpen(false);
        }}
        onClose={() => setCityOpen(false)}
      />
    </SafeAreaView>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const t = n % 10;
  const h = n % 100;
  if (h >= 11 && h <= 14) return many;
  if (t === 1) return one;
  if (t >= 2 && t <= 4) return few;
  return many;
}

/** Пол — переключатель как в iPhone: белая плашка переезжает под выбранный вариант. */
function Segmented({ value, onChange }: { value: "male" | "female" | null; onChange: (v: "male" | "female") => void }) {
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(value === "female" ? 1 : 0)).current;
  const shown = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    if (!value) return;
    Animated.parallel([
      Animated.spring(x, { toValue: value === "female" ? 1 : 0, damping: 18, stiffness: 220, useNativeDriver: true }),
      Animated.timing(shown, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [value, x, shown]);
  const half = (w - 6) / 2;
  return (
    <View style={styles.seg} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? <Animated.View style={[styles.segPill, { width: half, opacity: shown, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, half] }) }] }]} /> : null}
      {(["male", "female"] as const).map((g) => (
        <Pressable
          key={g}
          style={styles.segBtn}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onChange(g);
          }}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === g }}
        >
          <Text style={[styles.segText, value === g && { ...f("600") }]}>{g === "male" ? "Парень" : "Девушка"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Check({ on, onPress, children }: { on: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={styles.terms} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <View style={[styles.check, on && styles.checkOn]}>{on ? <Icon name="check" size={14} color="#fff" strokeWidth={3} /> : null}</View>
      <Text style={styles.termsText}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingTop: 8 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.8)", alignItems: "center", justifyContent: "center" },
  prog: { flex: 1, flexDirection: "row", gap: 5 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "rgba(108,59,255,0.15)" },
  barOn: { backgroundColor: colors.violet },
  cnt: { fontFamily: FONT, fontSize: 12, color: colors.grey, minWidth: 30, textAlign: "right" },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  sub: { fontFamily: FONT, fontSize: 14.5, color: colors.grey, marginTop: 6, lineHeight: 20 },

  photos: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 16 },
  ph: { borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  phMain: { width: 96, height: 120 },
  phAdd: { width: 72, height: 90 },
  phEmpty: { backgroundColor: "rgba(255,255,255,0.75)", borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(108,59,255,0.35)" },
  phText: { fontSize: 13, color: colors.violet, marginTop: 4, ...f("600") },
  phX: { position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(22,18,31,0.45)", alignItems: "center", justifyContent: "center" },
  phTag: { position: "absolute", bottom: 7, fontSize: 10.5, color: "#fff", backgroundColor: "rgba(22,18,31,0.4)", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: "hidden", ...f("500") },

  field: { marginTop: 14, height: 52, borderRadius: 16, backgroundColor: "#fff", paddingHorizontal: 16, fontFamily: FONT, fontSize: 17, color: colors.ink },
  lbl: { marginTop: 16, marginBottom: 8, fontSize: 12, color: colors.grey, letterSpacing: 0.8, textTransform: "uppercase", ...f("600") },
  age: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  ageNum: { fontSize: 13.5, color: colors.violet, backgroundColor: colors.lav, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, overflow: "hidden", ...f("600") },
  ageBad: { color: "#D2387F", backgroundColor: "rgba(255,95,174,0.14)" },
  ageText: { fontFamily: FONT, fontSize: 13.5, color: "#5B5470", flexShrink: 1 },

  seg: { marginTop: 14, height: 46, borderRadius: 14, backgroundColor: "rgba(118,118,128,0.12)", flexDirection: "row", padding: 3 },
  segPill: { position: "absolute", top: 3, bottom: 3, left: 3, borderRadius: 11, backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  segBtn: { flex: 1, alignItems: "center", justifyContent: "center" },
  segText: { fontSize: 15, color: colors.ink, ...f("500") },

  tgBox: { marginTop: 16, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  tgText: { fontFamily: FONT, fontSize: 13.5, color: colors.ink2, flexShrink: 1 },
  tgLink: { fontSize: 14, color: colors.tg, ...f("600") },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  tile: { height: 84, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1.5, borderColor: "rgba(108,59,255,0.1)", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 4 },
  tileOn: { backgroundColor: "#fff", borderColor: colors.violet },
  tileIc: { width: 40, height: 40 },
  tileText: { fontSize: 13, color: colors.ink, ...f("500") },
  tick: { position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.violet, alignItems: "center", justifyContent: "center" },
  more: { alignSelf: "center", marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8, height: 42, paddingHorizontal: 16, borderRadius: 16, backgroundColor: "#fff" },
  moreText: { fontFamily: FONT, fontSize: 15, color: colors.grey },

  bigMosya: { width: 136, height: 136, alignSelf: "center", marginTop: 4, marginBottom: 6 },
  geo: { marginTop: 20, borderRadius: 20, backgroundColor: "#fff", padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  pin: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  geoTitle: { fontSize: 16, color: colors.ink, ...f("600") },
  geoSub: { fontFamily: FONT, fontSize: 13, color: colors.grey, marginTop: 2 },
  ok: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.violet, alignItems: "center", justifyContent: "center" },
  find: { fontSize: 14, color: colors.violet, backgroundColor: colors.lav, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, overflow: "hidden", ...f("600") },

  foot: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12, gap: 10 },
  terms: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: "rgba(108,59,255,0.35)", alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkOn: { backgroundColor: colors.violet, borderColor: colors.violet },
  termsText: { flex: 1, fontFamily: FONT, fontSize: 12.5, lineHeight: 17, color: "#5B5470" },
  link: { color: colors.violet, textDecorationLine: "underline" },
  error: { fontFamily: FONT, color: colors.danger, fontSize: 13.5, textAlign: "center" },
});

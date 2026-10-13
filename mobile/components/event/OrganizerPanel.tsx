import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { Glass } from "@/components/brand";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { ConfirmSheet } from "@/components/Sheet";
import { ApplicantRow, SmallBtn, type Application } from "@/components/event/Applicant";
import { api } from "@/lib/api";
import { animateNext, manageErrorText, tapOk, tapWarn } from "@/lib/feedback";
import { plural } from "@/lib/format";
import { colors, FONT } from "@/lib/theme";

export interface OrganizerEvent {
  id: string;
  title: string;
  status: string;
  startsAt: string;
  autoCompleteAt?: string;
  seatsTotal: number;
  seatsTaken: number;
  isBusiness: boolean;
  participants: { id: string; name: string; avatarUrl: string | null }[];
  invites?: { id: string; status: string; user: { id: string; name: string; avatarUrl: string | null } }[];
  pendingApplicationsCount?: number;
}

const INVITE_STATUS: Record<string, { label: string; color: string }> = {
  accepted: { label: "Идёт", color: colors.ok },
  declined: { label: "Не сможет", color: colors.grey },
  pending: { label: "Ждём ответа", color: "#E8892F" },
};

function hhmm(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Всё, чем организатор управляет на экране встречи — как в мини-приложении
 * (app/(app)/events/[id]/page.tsx): новые заявки, приглашённые, участники,
 * «Поднять», «Редактировать», билеты, «Отменить» / «Завершить».
 */
export function OrganizerPanel({ event, onChanged }: { event: OrganizerEvent; onChanged: () => void }) {
  const [pending, setPending] = useState<Application[]>([]);
  const [confirm, setConfirm] = useState<null | "cancel" | "complete" | { remove: { id: string; name: string } }>(null);
  const [busy, setBusy] = useState(false);
  const [boosting, setBoosting] = useState(false);

  const active = event.status === "published" || event.status === "closed";
  const started = Date.now() >= new Date(event.startsAt).getTime();

  const loadApplications = useCallback(() => {
    api<{ applications: Application[] }>(`/api/events/${event.id}/applications`)
      .then((r) => setPending((r.applications ?? []).filter((a) => a.status === "pending" && a.applicant)))
      .catch(() => {});
  }, [event.id]);

  useEffect(loadApplications, [loadApplications, event.seatsTaken, event.pendingApplicationsCount]);

  async function decide(app: Application, action: "accept" | "reject") {
    try {
      await api(`/api/applications/${app.id}`, { method: "PATCH", body: { action } });
      animateNext();
      setPending((list) => list.filter((a) => a.id !== app.id));
      if (action === "accept") tapOk();
      onChanged();
    } catch (e) {
      tapWarn();
      Alert.alert("Не получилось", manageErrorText(e));
      loadApplications();
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === "cancel" || confirm === "complete") {
        await api(`/api/events/${event.id}`, { method: "PATCH", body: { action: confirm } });
      } else {
        await api(`/api/events/${event.id}/members/${confirm.remove.id}`, { method: "DELETE" });
        animateNext();
      }
      tapOk();
      setConfirm(null);
      onChanged();
    } catch (e) {
      tapWarn();
      setConfirm(null);
      Alert.alert("Не получилось", manageErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function boost() {
    setBoosting(true);
    try {
      const r = await api<{ boostsUsed: number; boostsLimit: number | null }>("/api/boosts", { body: { eventId: event.id } });
      tapOk();
      Alert.alert(
        "Встреча поднята!",
        r.boostsLimit ? `Она снова в начале ленты. Использовано ${r.boostsUsed} из ${r.boostsLimit} в этом месяце.` : "Она снова в начале ленты."
      );
    } catch (e) {
      tapWarn();
      Alert.alert("Не получилось", manageErrorText(e));
    } finally {
      setBoosting(false);
    }
  }

  const going = event.seatsTaken + 1;
  const max = event.seatsTotal + 1;
  const invites = event.invites ?? [];
  const invitesGoing = invites.filter((i) => i.status === "accepted").length;

  return (
    <View style={{ gap: 14 }}>
      {!active ? null : (
        <Glass strong style={styles.hint}>
          <View style={styles.ic}>
            <Icon name="edit" size={18} color={colors.violet} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hintTitle}>Ты организатор этой встречи</Text>
            <Text style={styles.muted}>Информацию можно изменить в любой момент</Text>
          </View>
        </Glass>
      )}

      {active && pending.length > 0 ? (
        <View style={{ gap: 10 }}>
          <View style={styles.secRow}>
            <Text style={styles.section}>Новые заявки</Text>
            <View style={styles.count}>
              <Text style={styles.countText}>{pending.length}</Text>
            </View>
          </View>
          {pending.map((a) => (
            <ApplicantRow key={a.id} app={a} onDecide={decide} />
          ))}
        </View>
      ) : null}

      {invites.length > 0 ? (
        <View style={{ gap: 10 }}>
          <View style={styles.secRow}>
            <Text style={styles.section}>Приглашённые</Text>
            <Text style={styles.muted}>
              {invitesGoing} из {invites.length} {plural(invites.length, "идёт", "идут", "идут")}
            </Text>
          </View>
          <Glass strong style={styles.list}>
            {invites.map((i, idx) => {
              const st = INVITE_STATUS[i.status] ?? INVITE_STATUS.pending!;
              return (
                <View key={i.id} style={[styles.person, idx > 0 && styles.sep]}>
                  <Avatar uri={i.user.avatarUrl} name={i.user.name} size={40} />
                  <Text style={styles.personName} numberOfLines={1}>
                    {i.user.name}
                  </Text>
                  <Text style={[styles.status, { color: st.color }]}>{st.label}</Text>
                </View>
              );
            })}
          </Glass>
        </View>
      ) : null}

      {event.participants.length > 0 ? (
        <View style={{ gap: 10 }}>
          <View style={styles.secRow}>
            <Text style={styles.section}>Участники</Text>
            <Text style={styles.muted}>
              {going} из {max}
            </Text>
          </View>
          <Glass strong style={styles.list}>
            {event.participants.map((p, idx) => (
              <View key={p.id} style={[styles.person, idx > 0 && styles.sep]}>
                <Avatar uri={p.avatarUrl} name={p.name} size={40} />
                <Text style={styles.personName} numberOfLines={1}>
                  {p.name}
                </Text>
                {active && !started ? (
                  <Pressable hitSlop={8} onPress={() => setConfirm({ remove: { id: p.id, name: p.name } })}>
                    <Text style={styles.remove}>Убрать</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </Glass>
        </View>
      ) : null}

      {active ? (
        <View style={styles.tiles}>
          {event.status === "published" ? (
            <Tile icon="up" title={boosting ? "Поднимаем…" : "Поднять встречу"} sub="в начало ленты" onPress={boosting ? undefined : boost} />
          ) : (
            <Tile icon="people" title="Все заявки" sub="история и решения" onPress={() => router.push(`/applications/${event.id}` as Href)} />
          )}
          <Tile icon="edit" title="Редактировать" sub="место, время, фото" onPress={() => router.push({ pathname: "/create", params: { id: event.id } })} />
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        {event.status === "published" ? (
          <LinkRow icon="people" title="Все заявки" sub="история и решения" onPress={() => router.push(`/applications/${event.id}` as Href)} />
        ) : null}
        {event.isBusiness ? (
          <LinkRow icon="doc" title="Билеты гостей" sub={`${event.participants.length} · номера для входа`} onPress={() => router.push(`/tickets/${event.id}` as Href)} />
        ) : null}
      </View>

      {active && !started ? (
        <Pressable onPress={() => setConfirm("cancel")} style={styles.cancelLink} hitSlop={6}>
          <Text style={styles.cancelText}>Отменить встречу</Text>
        </Pressable>
      ) : null}
      {active && started ? (
        <View style={{ gap: 6 }}>
          <SmallBtn label="Завершить встречу" primary onPress={() => setConfirm("complete")} />
          {event.autoCompleteAt ? (
            <Text style={[styles.muted, { textAlign: "center" }]}>Иначе встреча закроется сама в {hhmm(event.autoCompleteAt)} — через 30 минут после окончания.</Text>
          ) : null}
        </View>
      ) : null}

      <ConfirmSheet
        visible={confirm === "cancel"}
        title="Отменить встречу?"
        text="Участники получат уведомление. Лимит тарифа вернётся."
        confirm="Да, отменить"
        busyText="Отменяем…"
        danger
        busy={busy}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
      <ConfirmSheet
        visible={confirm === "complete"}
        title="Завершить встречу?"
        text="Чат закроется, участники смогут оставить отзывы."
        confirm="Да, завершить"
        busyText="Завершаем…"
        busy={busy}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
      <ConfirmSheet
        visible={typeof confirm === "object" && confirm !== null}
        title={typeof confirm === "object" && confirm ? `Убрать ${confirm.remove.name}?` : "Убрать участника?"}
        text="Человек выйдет из встречи и чата, место освободится. Мы его аккуратно уведомим."
        confirm="Да, убрать"
        busyText="Убираем…"
        danger
        busy={busy}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
    </View>
  );
}

function Tile({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <Glass strong style={styles.tile}>
        <View style={styles.ic}>
          <Icon name={icon} size={18} color={colors.violet} />
        </View>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.muted}>{sub}</Text>
      </Glass>
    </Pressable>
  );
}

function LinkRow({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <Glass strong style={styles.link}>
        <View style={styles.ic}>
          <Icon name={icon} size={18} color={colors.violet} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.hintTitle}>{title}</Text>
          <Text style={styles.muted}>{sub}</Text>
        </View>
        <Icon name="chev" size={18} color={colors.grey} />
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: { borderRadius: 22, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  hintTitle: { fontFamily: FONT, fontSize: 15.5, fontWeight: "500", color: colors.ink },
  muted: { fontFamily: FONT, fontSize: 13, color: colors.grey, marginTop: 2 },
  ic: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  secRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  section: { fontFamily: FONT, fontSize: 19, fontWeight: "500", color: colors.ink, letterSpacing: -0.4 },
  count: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: colors.live, alignItems: "center", justifyContent: "center", paddingHorizontal: 7 },
  countText: { fontFamily: FONT, fontSize: 13, fontWeight: "700", color: "#fff" },
  list: { borderRadius: 22, paddingHorizontal: 12 },
  person: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(108,59,255,0.15)" },
  personName: { flex: 1, fontFamily: FONT, fontSize: 15.5, color: colors.ink },
  status: { fontFamily: FONT, fontSize: 13, fontWeight: "600" },
  remove: { fontFamily: FONT, fontSize: 14, fontWeight: "600", color: colors.danger },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { borderRadius: 22, padding: 14, gap: 6, minHeight: 112 },
  tileTitle: { fontFamily: FONT, fontSize: 15.5, fontWeight: "500", color: colors.ink, marginTop: 4 },
  link: { borderRadius: 22, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  cancelLink: { alignSelf: "center", paddingVertical: 8 },
  cancelText: { fontFamily: FONT, fontSize: 15, fontWeight: "500", color: colors.danger },
});

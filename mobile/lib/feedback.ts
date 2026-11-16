import * as Haptics from "expo-haptics";
import { AppState, LayoutAnimation, Platform } from "react-native";

/** Лёгкая вибрация-отклик на действия: принять заявку, отметить гостя и т. п. */
export function tapOk() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
export function tapWarn() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
export function tapLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Плавная перестройка списка (строка исчезла / появилась) перед setState. */
export function animateNext() {
  LayoutAnimation.configureNext({
    duration: 260,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: Platform.OS === "ios" ? LayoutAnimation.Types.spring : LayoutAnimation.Types.easeInEaseOut, springDamping: 0.85 },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
}

/** Понятные тексты для ошибок управления встречей (коды — из app/api/...). */
const MANAGE_ERRORS: Record<string, string> = {
  forbidden: "Это не твоя встреча",
  not_found: "Встреча не найдена",
  event_not_found: "Встреча не найдена",
  already_processed: "Эту заявку уже обработали",
  event_full: "Мест больше нет — сначала увеличь количество мест",
  event_already_started: "Встреча уже началась — это действие недоступно",
  not_a_member: "Человек уже не в списке встречи",
  cannot_remove_organizer: "Организатора убрать нельзя",
  cannot_cancel: "Эту встречу уже нельзя отменить",
  cannot_cancel_processed_application: "Заявку уже рассмотрели — отозвать её нельзя",
  event_not_active: "Продвигать можно только активную встречу",
  event_started: "Встреча уже началась — продвигать поздно",
  no_slot_before_start: "До начала встречи первое место уже занято",
  other_event_promoted: "В топе уже стоит другая твоя встреча — одновременно можно продвигать только одну",
  subscription_required: "Чтобы продвигать по тарифу, нужна подписка — разово можно в Telegram-версии",
  boost_limit_reached: "Продвижения по тарифу на этот период закончились — разово можно в Telegram-версии",
};

export function manageErrorText(e: unknown): string {
  const err = e as { code?: string; message?: string; data?: { message?: string } };
  if (err?.data?.message) return err.data.message;
  if (err?.code && MANAGE_ERRORS[err.code]) return MANAGE_ERRORS[err.code]!;
  return err?.message || "Что-то пошло не так. Попробуй ещё раз";
}

/**
 * Вибрация при запуске. iOS не играет вибрацию, пока приложение ещё «не активно» (идёт запуск,
 * показывается системная заставка) — поэтому ждём, когда приложение станет активным, и только потом
 * через небольшую паузу даём отклик. Средняя сила: лёгкую на старте почти не чувствуется.
 */
export function tapOnLaunch(delayMs = 350, style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (done) return;
    timer = setTimeout(() => {
      if (done || AppState.currentState !== "active") return;
      done = true;
      // Первый вызов вибромотора после запуска iOS часто «проглатывает» (генератор ещё не готов),
      // поэтому сначала будим его тихим щелчком, а через 120 мс даём заметный двойной отклик.
      Haptics.selectionAsync().catch(() => {});
      setTimeout(() => {
        if (style === Haptics.ImpactFeedbackStyle.Light) Haptics.impactAsync(style).catch(() => {});
        else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }, 120);
    }, delayMs);
  };
  if (AppState.currentState === "active") fire();
  const sub = AppState.addEventListener("change", (st) => { if (st === "active") fire(); });
  return () => { done = true; sub.remove(); if (timer) clearTimeout(timer); };
}

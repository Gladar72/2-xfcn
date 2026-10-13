import { AppState } from "react-native";
import { api } from "./api";

/**
 * Живые события чата через Supabase Realtime (Broadcast) — тот же приватный канал
 * "conversation:<id>", что слушает мини-приложение. Протокол Phoenix реализован
 * вручную (без supabase-js): одно WebSocket-соединение, вход в канал, пульс,
 * переподключение. Сервер сам пишет в канал: message / read / edit / delete /
 * reaction / typing (lib/supabase/broadcast.ts).
 */

type Handler = (event: string, payload: Record<string, unknown>) => void;

interface Cfg {
  token: string;
  url: string;
  anonKey: string;
}

let cfg: Promise<Cfg | null> | null = null;
function config(): Promise<Cfg | null> {
  if (!cfg) {
    cfg = api<{ token: string; url: string | null; anonKey: string | null }>("/api/auth/realtime-token")
      .then((r) => (r.token && r.url && r.anonKey ? { token: r.token, url: r.url, anonKey: r.anonKey } : null))
      .catch(() => {
        cfg = null;
        return null;
      });
  }
  return cfg;
}

/** После выхода из аккаунта — забыть токен. */
export function resetRealtime() {
  cfg = null;
}

/**
 * Подписка на канал чата. Возвращает функцию отписки.
 * onStatus(true/false) — есть ли живое соединение (без него экран чата
 * переходит на редкий опрос сервера).
 */
export function subscribeConversation(conversationId: string, onEvent: Handler, onStatus?: (live: boolean) => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let ref = 0;
  /** Поколение подключения: устаревшие сокеты и колбэки после await ничего не трогают. */
  let gen = 0;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  /** ref последнего пульса без ответа: не ответил к следующему — соединение мёртвое. */
  let pendingBeat: string | null = null;
  const topic = `realtime:conversation:${conversationId}`;

  function cleanup() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    pendingBeat = null;
    const old = ws;
    ws = null;
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      try {
        old.close();
      } catch {}
    }
  }

  function scheduleRetry() {
    if (closed || retry) return;
    onStatus?.(false);
    const delay = Math.min(15000, 1000 * 2 ** Math.min(attempts, 4));
    attempts += 1;
    retry = setTimeout(() => {
      retry = null;
      connect();
    }, delay);
  }

  function fail(myGen: number) {
    if (myGen !== gen) return;
    cleanup();
    scheduleRetry();
  }

  async function connect() {
    const myGen = ++gen;
    cleanup();
    onStatus?.(false);
    const c = await config();
    if (closed || myGen !== gen) return;
    if (!c) return scheduleRetry();
    const wsUrl = `${c.url.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(c.anonKey)}&vsn=1.0.0`;
    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
    } catch {
      return scheduleRetry();
    }
    ws = socket;
    const send = (msg: Record<string, unknown>) => {
      try {
        socket.send(JSON.stringify(msg));
      } catch {}
    };
    socket.onopen = () => {
      if (myGen !== gen) return;
      ref += 1;
      send({
        topic,
        event: "phx_join",
        ref: String(ref),
        join_ref: String(ref),
        payload: { config: { broadcast: { ack: false, self: false }, presence: { key: "" }, private: true }, access_token: c.token },
      });
      heartbeat = setInterval(() => {
        if (pendingBeat) return fail(myGen); // прошлый пульс остался без ответа
        ref += 1;
        pendingBeat = String(ref);
        send({ topic: "phoenix", event: "heartbeat", payload: {}, ref: pendingBeat });
      }, 25000);
    };
    socket.onmessage = (e) => {
      if (myGen !== gen) return;
      let msg: { event?: string; topic?: string; ref?: string | null; payload?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.topic === "phoenix") {
        if (msg.event === "phx_reply" && msg.ref === pendingBeat) pendingBeat = null;
        return;
      }
      if (msg.topic !== topic) return;
      if (msg.event === "phx_reply") {
        const status = (msg.payload as { status?: string } | undefined)?.status;
        if (status === "ok") {
          attempts = 0;
          onStatus?.(true);
        } else if (status === "error") {
          // Скорее всего, истёк токен — запросим новый при следующей попытке.
          cfg = null;
          fail(myGen);
        }
        return;
      }
      if (msg.event === "broadcast") {
        const inner = msg.payload as { event?: string; payload?: Record<string, unknown> } | undefined;
        if (inner?.event) onEvent(inner.event, inner.payload ?? {});
        return;
      }
      if (msg.event === "phx_error" || msg.event === "phx_close") fail(myGen);
    };
    socket.onerror = () => {};
    socket.onclose = () => fail(myGen);
  }

  // Вернулись в приложение — соединение могло умереть в фоне: переподключаемся всегда
  // (живой сокет после долгого фона на iOS часто только выглядит открытым).
  let bgAt = 0;
  const sub = AppState.addEventListener("change", (st) => {
    if (closed) return;
    if (st !== "active") {
      bgAt = Date.now();
      return;
    }
    if (!ws || ws.readyState !== 1 || (bgAt && Date.now() - bgAt > 20000)) {
      if (retry) clearTimeout(retry);
      retry = null;
      connect();
    }
  });

  connect();

  return () => {
    closed = true;
    gen += 1;
    sub.remove();
    if (retry) clearTimeout(retry);
    cleanup();
  };
}

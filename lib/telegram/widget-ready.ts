/** Never trust a message from another frame or origin, including auth-shaped data. */
export function isTelegramWidgetReady(event: Pick<MessageEvent, "origin" | "source" | "data">, frame: Window | null): boolean {
  if (!frame || event.source !== frame || event.origin !== "https://oauth.telegram.org") return false;
  try {
    const data = typeof event.data === "string" ? JSON.parse(event.data) : null;
    return data?.event === "ready" || (data?.event === "resize" && Number(data.width) > 0 && Number(data.height) > 0);
  } catch {
    return false;
  }
}

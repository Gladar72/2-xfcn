// Одна галочка — отправлено; две белые — прочитали не все (групповой чат);
// две зелёные — прочитали все. Общий компонент для MessageBubble и ChatListItem.
export function ReadTicks({ status }: { status: "sent" | "partial" | "read" }) {
  const second = status === "read" || status === "partial";
  const color = status === "read" ? "#7CF29A" : "currentColor";
  return (
    <svg width="14" height="10" viewBox="0 0 16 11" fill="none" className="shrink-0">
      <path d="M1 5.5L4.5 9L10.5 1.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {second && (
        <path d="M5.5 5.5L9 9L15 1.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

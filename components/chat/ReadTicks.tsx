// Одна галочка — отправлено, две (зелёные) — собеседник прочитал.
// Общий компонент для MessageBubble (внутри чата) и ChatListItem (список чатов).
export function ReadTicks({ status }: { status: "sent" | "read" }) {
  return (
    <svg width="14" height="10" viewBox="0 0 16 11" fill="none" className="shrink-0">
      <path
        d="M1 5.5L4.5 9L10.5 1.5"
        stroke={status === "read" ? "#7CF29A" : "currentColor"}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {status === "read" && (
        <path
          d="M5.5 5.5L9 9L15 1.5"
          stroke="#7CF29A"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

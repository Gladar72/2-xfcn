"use client";

import { useRouter } from "next/navigation";
import { Ic } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";

export default function ChatLoading() {
  const router = useRouter();
  return <div className="P"><section className="scr aurora" data-id="chat-loading" aria-busy="true">
    <div className="scroll">
      <button className="rb gl" onClick={() => goBack(router, "/chats")} aria-label="Назад"><Ic n="back" /></button>
      <p role="status" style={{ margin: "24px 0", color: "var(--grey)" }}>Открываем чат…</p>
      {[0, 1, 2].map((i) => <div className="sk" key={i} style={{ height: 44, marginBottom: 12, width: i % 2 ? "65%" : "50%" }} />)}
    </div>
  </section></div>;
}
